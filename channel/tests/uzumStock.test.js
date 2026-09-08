const test = require('node:test');
const assert = require('node:assert/strict');
const { transferSoldHold, soldHoldQuantity, snapshotUpdate } = require('../src/uzum/stock');
const { memoryModel } = require('./helpers/uzumMemoryModel');
const at = new Date('2026-09-08T10:00:00Z');
// Evaluate the small Mongo aggregation expression subset used by the real
// atomic updates, so assertions exercise their branch/ordering semantics.
function evaluate(value, row, vars = {}) {
  if (typeof value === 'string' && value.startsWith('$$')) return value.slice(2).split('.').reduce((v, k) => v?.[k], vars);
  if (typeof value === 'string' && value.startsWith('$')) return value.slice(1).split('.').reduce((v, k) => v?.[k], row);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((v) => evaluate(v, row, vars));
  if ('$literal' in value) return value.$literal;
  if ('$ifNull' in value) { const [a, b] = evaluate(value.$ifNull, row, vars); return a ?? b; }
  if ('$cond' in value) { const [a, b, c] = value.$cond; return evaluate(evaluate(a, row, vars) ? b : c, row, vars); }
  if ('$and' in value) return evaluate(value.$and, row, vars).every(Boolean);
  if ('$not' in value) return !evaluate(value.$not, row, vars)[0];
  if ('$in' in value) { const [a, b] = evaluate(value.$in, row, vars); return b.includes(a); }
  if ('$lt' in value) { const [a, b] = evaluate(value.$lt, row, vars); return a < b; }
  if ('$lte' in value) { const [a, b] = evaluate(value.$lte, row, vars); return a <= b; }
  if ('$gte' in value) { const [a, b] = evaluate(value.$gte, row, vars); return a >= b; }
  if ('$subtract' in value) { const [a, b] = evaluate(value.$subtract, row, vars); return a - b; }
  if ('$max' in value) return Math.max(...evaluate(value.$max, row, vars));
  if ('$concatArrays' in value) return evaluate(value.$concatArrays, row, vars).flat();
  if ('$map' in value) { const o = value.$map; return evaluate(o.input, row, vars).map((v) => evaluate(o.in, row, { ...vars, [o.as]: v })); }
  if ('$filter' in value) { const o = value.$filter; return evaluate(o.input, row, vars).filter((v) => evaluate(o.cond, row, { ...vars, [o.as]: v })); }
  return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, evaluate(v, row, vars)]));
}
function apply(row, pipeline) { for (const stage of pipeline) Object.assign(row, evaluate(stage.$set, row)); }
function model(rows) {
  return { async updateOne(filter, pipeline) {
    const row = rows.find((entry) => entry.billzProductId === filter.billzProductId);
    if (!row) throw new Error('missing product');
    apply(row, pipeline); return { matchedCount: 1 };
  } };
}
function owned(items) {
  const order = { internalOrderId: 'order', channel: 'uzum', status: 'reserved', items,
    billz: { reservationApplied: true, operationAction: 'complete', operationToken: 'owner' } };
  return { order, Orders: memoryModel([structuredClone(order)]) };
}
test('sale atomically converts reservation to a unique hold; duplicate transfer never consumes another reservation', async () => {
  const row = { billzProductId: 'p', stock: 5, reservedQty: 4, uzumSoldHolds: [] };
  const { order, Orders } = owned([{ billzProductId: 'p', quantity: 1 }, { billzProductId: 'p', quantity: 1 }]);
  await transferSoldHold(order, at, model([row]), Orders);
  assert.equal(row.reservedQty, 2); assert.equal(soldHoldQuantity(row), 2);
  await assert.rejects(transferSoldHold(order, at, model([row]), Orders), { code: 'BILLZ_OPERATION_OWNERSHIP_LOST' });
  assert.equal(row.reservedQty, 2); assert.equal(row.uzumSoldHolds.length, 1);
  assert.equal(row.stock - row.reservedQty - soldHoldQuantity(row), 1);
});
test('only a snapshot started strictly after sale settles holds; stale overlapping snapshot changes nothing', async () => {
  const row = { billzProductId: 'p', stock: 5, reservedQty: 2, uzumSoldHolds: [{ orderId: 'order', quantity: 2, soldAt: at }] };
  apply(row, snapshotUpdate({ stock: 5 }, at, at));
  assert.equal(soldHoldQuantity(row), 2);
  const fresh = new Date(at.getTime() + 1);
  apply(row, snapshotUpdate({ stock: 3 }, fresh, fresh));
  assert.equal(row.stock, 3); assert.equal(soldHoldQuantity(row), 0);
  apply(row, snapshotUpdate({ stock: 5 }, at, new Date(fresh.getTime() + 1)));
  assert.equal(row.stock, 3); assert.equal(row.snapshotStartedAt.getTime(), fresh.getTime());
  const { order, Orders } = owned([{ billzProductId: 'p', quantity: 2 }]);
  await transferSoldHold(order, at, model([row]), Orders);
  assert.equal(row.reservedQty, 2, 'zero quantity marker still guards against replay');
  assert.equal(soldHoldQuantity(row), 0);
  assert.equal(row.uzumSoldHolds.length, 1);
});
test('partial transfer throws; completed products retain protection without negative counters', async () => {
  const row = { billzProductId: 'p', stock: 2, reservedQty: 0 };
  const { order, Orders } = owned([{ billzProductId: 'p', quantity: 2 }, { billzProductId: 'missing', quantity: 1 }]);
  await assert.rejects(transferSoldHold(order, at, model([row]), Orders));
  assert.equal(row.reservedQty, 0); assert.equal(soldHoldQuantity(row), 2);
});
module.exports = { apply };
