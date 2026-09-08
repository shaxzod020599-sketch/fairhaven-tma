const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const stock = require('../src/uzum/stock');

// Socket-free checks execute the production aggregation expressions; real
// Mongo integration remains necessary to verify the database engine itself.
function evaluate(value, row, vars = {}) {
  if (typeof value === 'string' && value.startsWith('$$')) return value.slice(2).split('.').reduce((v, k) => v?.[k], vars);
  if (typeof value === 'string' && value.startsWith('$')) return value.slice(1).split('.').reduce((v, k) => v?.[k], row);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((v) => evaluate(v, row, vars));
  if ('$literal' in value) return value.$literal;
  if ('$ifNull' in value) { const [a, b] = evaluate(value.$ifNull, row, vars); return a ?? b; }
  if ('$cond' in value) { const [a, b, c] = value.$cond; return evaluate(evaluate(a, row, vars) ? b : c, row, vars); }
  if ('$lt' in value) { const [a, b] = evaluate(value.$lt, row, vars); return a < b; }
  if ('$gte' in value) { const [a, b] = evaluate(value.$gte, row, vars); return a >= b; }
  if ('$subtract' in value) { const [a, b] = evaluate(value.$subtract, row, vars); return a - b; }
  if ('$add' in value) return evaluate(value.$add, row, vars).reduce((a, b) => a + b, 0);
  if ('$sum' in value) return evaluate(value.$sum, row, vars).reduce((a, b) => a + b, 0);
  if ('$max' in value) return Math.max(...evaluate(value.$max, row, vars));
  if ('$map' in value) { const o = value.$map; return evaluate(o.input, row, vars).map((v) => evaluate(o.in, row, { ...vars, [o.as]: v })); }
  if ('$filter' in value) { const o = value.$filter; return evaluate(o.input, row, vars).filter((v) => evaluate(o.cond, row, { ...vars, [o.as]: v })); }
  if (Object.keys(value).some((key) => key.startsWith('$'))) throw new Error(`Unsupported test expression ${Object.keys(value)}`);
  return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, evaluate(v, row, vars)]));
}

function loadSource(relative, dependencies, globals = {}) {
  const filename = path.join(__dirname, relative);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports,
    require: (name) => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
      return dependencies[name];
    }, ...globals,
  }, { filename });
  return module.exports;
}

test('inventory sellable projection deducts sold holds without changing physical quantities', async () => {
  const { summarizeInventory } = loadSource('../src/analytics/billzInventory.js', {
    '../config': { sync: { intervalMs: 300000 } },
  });
  let projection;
  const logQuery = { sort() { return this; }, lean: async () => null };
  await summarizeInventory({
    ProductModel: { aggregate: async (pipeline) => { projection = pipeline[1].$project; return []; } },
    SyncLogModel: { findOne: () => logQuery },
  });
  for (const [holds, expected] of [[undefined, 3], [[], 3], [[{ quantity: 1 }, { quantity: 2 }], 0], [[{ quantity: 9 }], 0]]) {
    const row = { stock: 5, reservedQty: 1, pendingQty: 1, retailPrice: 100, uzumSoldHolds: holds };
    assert.equal(evaluate(projection.sellable, row), expected);
    assert.equal(evaluate(projection.physical, row), 5);
    assert.equal(evaluate(projection.reserved, row), 1);
    assert.equal(evaluate(projection.pending, row), 1);
  }
});

test('a repeated missing snapshot advances the tombstone and rejects an older present snapshot', async () => {
  const row = { billzProductId: 'p', stock: 2, deletedInBillz: false, reservedQty: 0, pendingQty: 0 };
  let timestamp = Date.parse('2026-09-08T10:00:00Z');
  let products = [];
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [timestamp])); }
    static now() { return timestamp; }
  }
  const matches = (filter) => Object.entries(filter).every(([key, condition]) => {
    if (key === '$expr') return evaluate(condition, row);
    if (condition && typeof condition === 'object') {
      if ('$in' in condition) return condition.$in.includes(row[key]);
      if ('$nin' in condition) return !condition.$nin.includes(row[key]);
      if ('$ne' in condition) return row[key] !== condition.$ne;
      throw new Error(`Unsupported test filter ${key}`);
    }
    return row[key] === condition;
  });
  const apply = (pipeline) => {
    const before = JSON.stringify(row);
    for (const stage of pipeline) Object.assign(row, evaluate(stage.$set, row));
    return Number(before !== JSON.stringify(row));
  };
  const model = {
    find(filter) { return { select() { return this; }, lean: async () => matches(filter) ? [row] : [] }; },
    countDocuments: async (filter) => Number(matches(filter)),
    bulkWrite: async (operations) => { for (const op of operations) if (matches(op.updateOne.filter)) apply(op.updateOne.update); },
    updateMany: async (filter, pipeline) => ({ modifiedCount: matches(filter) ? apply(pipeline) : 0 }),
  };
  const { runCatalogSync } = loadSource('../src/sync/catalog.js', {
    '../config': { billz: { pageSize: 10, shopId: 'shop' }, sync: { minCatalogRatio: 0.5 } },
    '../logger': { info() {}, error() {} },
    '../billz/client': { listProducts: async () => ({ total: products.length, products }) },
    '../models/BillzProduct': () => model,
    '../models/SyncLog': () => ({ create: async () => ({}) }),
    // Durable-order cleanup is covered by the real Mongo accounting suite.
    '../uzum/stock': { ...stock, cleanupSoldHolds: async () => {} },
  }, { Date: Clock });
  const first = await runCatalogSync({ force: true });
  assert.equal(first.ok, true);
  assert.equal(first.markedDeleted, 1);
  timestamp += 2000;
  const newest = timestamp;
  const repeated = await runCatalogSync({ force: true });
  assert.equal(repeated.ok, true);
  assert.equal(row.snapshotStartedAt.getTime(), newest);
  assert.equal(repeated.markedDeleted, 0, 'an existing tombstone is not a newly deleted product');
  timestamp -= 1000;
  products = [{ id: 'p', name: 'Delayed', shop_measurement_values: [{ shop_id: 'shop', active_measurement_value: 10 }] }];
  const delayed = await runCatalogSync({ force: true });
  assert.equal(delayed.ok, true);
  assert.equal(row.deletedInBillz, true);
  assert.equal(row.stock, 2);
  assert.equal(row.snapshotStartedAt.getTime(), newest);
});
