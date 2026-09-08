const test = require('node:test');
const assert = require('node:assert/strict');
const { memoryModel } = require('./helpers/uzumMemoryModel');
const { createLifecycle, cleanOrder } = require('../src/uzum/lifecycle');
const { toUzum } = require('../src/adapters/uzum/statuses');
const actor = { type: 'admin-panel', telegramId: 77, name: 'Admin' };
const id = '11111111-1111-4111-8111-111111111111';
const at = new Date('2026-09-07T10:00:00Z');
function fixture(over = {}) {
  const row = { _id: 'order-1', channel: 'uzum', internalOrderId: id, externalId: 'eats-1',
    createdAt: at, updatedAt: at, items: [{ billzProductId: 'p', name: 'Vitamin', quantity: 2, unitPrice: 100 }],
    status: 'received', billz: {}, uzum: { version: 1, revision: 1, audit: [] }, ...over };
  const Model = memoryModel([row]);
  const calls = [];
  const stock = { available: 5, reserved: 0, sold: 0 };
  const core = {
    async reserveOrder() { calls.push('reserve'); row.status = 'reserved'; row.billz.reservationApplied = true; stock.reserved += 2; return structuredClone(row); },
    async completeOrder() { calls.push('complete'); row.status = 'sold'; row.soldAt = at; row.billz.reservationApplied = false; stock.reserved -= 2; stock.sold += 2; return structuredClone(row); },
    async cancelOrder() { calls.push('cancel'); if (row.billz.reservationApplied) stock.reserved -= 2; row.status = 'cancelled'; row.billz.reservationApplied = false; return structuredClone(row); },
  };
  let current = new Date(at.getTime() + 1000);
  const service = createLifecycle({ Model, core, enabled: () => true, now: () => current, checkAvailability: async () => {
    if (stock.available < 2) throw Object.assign(new Error('unavailable'), { code: 'uzum_unavailable', status: 409 });
  } });
  return { row, Model, core, calls, stock, service, time(value) { current = value; } };
}
const decide = (f, action, extra = {}) => f.service.decide(id, { action, actor, ...extra });
test('stored NEW is inert; accept reserves and ready sells exactly once; sold is READY', async () => {
  const f = fixture();
  assert.equal(cleanOrder(f.row, at).status, 'NEW');
  assert.deepEqual(f.calls, []);
  assert.equal((await decide(f, 'accept')).order.status, 'ACCEPTED_BY_RESTAURANT');
  assert.equal((await decide(f, 'accept')).idempotent, true);
  assert.equal((await decide(f, 'ready')).order.status, 'READY');
  assert.equal((await decide(f, 'ready')).idempotent, true);
  assert.deepEqual(f.calls, ['reserve', 'complete']);
  assert.equal(f.stock.sold, 2);
  assert.equal(toUzum('sold'), 'READY');
  assert.equal(f.row.uzum.audit.filter((entry) => entry.outcome === 'applied').length, 2);
});
test('ready before acceptance, invalid actor and cross-channel ids cannot move stock', async () => {
  const f = fixture();
  await assert.rejects(decide(f, 'ready'), { code: 'uzum_not_accepted' });
  await assert.rejects(decide(f, 'accept', { actor: { type: 'user', telegramId: 77 } }), { code: 'uzum_invalid_actor' });
  f.row.channel = 'medicalka';
  await assert.rejects(decide(f, 'accept'), { code: 'uzum_not_found' });
  assert.deepEqual(f.calls, []);
});
test('deadline is createdAt plus 15 minutes; updatedAt cannot revive late acceptance', async () => {
  const f = fixture();
  f.time(new Date(at.getTime() + 15 * 60_000));
  f.row.updatedAt = new Date(at.getTime() + 14 * 60_000);
  await assert.rejects(decide(f, 'accept'), { code: 'uzum_acceptance_expired' });
  assert.deepEqual(f.calls, []);
  assert.equal(cleanOrder(f.row, new Date(at.getTime() + 15 * 60_000)).expired, true);
});
test('accepted order remains ready-able after deadline; no timeout cancellation', async () => {
  const f = fixture();
  await decide(f, 'accept');
  f.time(new Date(at.getTime() + 60 * 60_000));
  assert.equal((await decide(f, 'ready')).order.status, 'READY');
});
test('availability recheck prevents reserve and preserves receipt price', async () => {
  const f = fixture(); f.stock.available = 1;
  await assert.rejects(decide(f, 'accept'), { code: 'uzum_unavailable' });
  assert.deepEqual(f.calls, []);
  f.stock.available = 5;
  await decide(f, 'accept');
  assert.equal(f.row.items[0].unitPrice, 100);
});
test('two independent workers race on one durable claim, never double reserve', async () => {
  const f = fixture();
  let release; const gate = new Promise((yes) => { release = yes; });
  const reserve = f.core.reserveOrder;
  f.core.reserveOrder = async () => { await gate; return reserve(); };
  const first = decide(f, 'accept');
  await new Promise(setImmediate);
  const other = createLifecycle({ Model: f.Model, core: f.core, enabled: () => true, now: () => new Date(at.getTime() + 1000), checkAvailability: async () => {} });
  await assert.rejects(other.decide(id, { action: 'accept', actor: { ...actor, type: 'telegram' } }), { code: 'uzum_operation_in_progress' });
  release(); await first;
  assert.deepEqual(f.calls, ['reserve']);
});
test('partner cancellation during reservation is durable and applied before acceptance returns', async () => {
  const f = fixture();
  let release; const gate = new Promise((yes) => { release = yes; });
  const reserve = f.core.reserveOrder;
  f.core.reserveOrder = async () => { await gate; return reserve(); };
  const accepting = decide(f, 'accept');
  await new Promise(setImmediate);
  await assert.rejects(f.service.decide(id, { action: 'reject', actor: { type: 'uzum', name: 'Uzum' }, reason: 'Customer cancelled' }, { partner: true }), { code: 'uzum_operation_in_progress' });
  assert.ok(f.row.uzum.cancelRequested);
  release();
  await assert.rejects(accepting, { code: 'uzum_cancelled' });
  assert.equal(f.row.status, 'cancelled');
  assert.deepEqual(f.calls, ['reserve', 'cancel']);
  assert.equal((await decide(f, 'reject')).idempotent, true);
});
test('cancel during sale records reconciliation; ready and post-sale reject cannot refund', async () => {
  const f = fixture(); await decide(f, 'accept');
  let release; const gate = new Promise((yes) => { release = yes; });
  const complete = f.core.completeOrder;
  f.core.completeOrder = async () => { await gate; return complete(); };
  const ready = decide(f, 'ready'); await new Promise(setImmediate);
  await assert.rejects(decide(f, 'reject', { reason: 'Cancel' }), { code: 'uzum_operation_in_progress' });
  release(); await assert.rejects(ready, { code: 'uzum_reconciliation_required' });
  assert.equal(f.row.status, 'sold');
  assert.equal(cleanOrder(f.row, at).status, 'READY');
  await assert.rejects(decide(f, 'reject'), { code: 'uzum_reconciliation_required' });
  assert.deepEqual(f.calls, ['reserve', 'complete']);
});
test('uncertain Billz failure and stale lease stay fenced, safe errors only', async () => {
  const f = fixture();
  f.core.reserveOrder = async () => { f.row.status = 'failed'; f.row.billz.reconciliationRequired = true; f.row.billz.operationToken = 'core-owner'; throw new Error('SECRET'); };
  await assert.rejects(decide(f, 'accept'), { code: 'uzum_reconciliation_required' });
  await assert.rejects(decide(f, 'accept'), { code: 'uzum_reconciliation_required' });
  assert.equal(f.row.billz.operationToken, 'core-owner');
  assert.equal(JSON.stringify(cleanOrder(f.row, at)).includes('SECRET'), false);
  const stale = fixture(); stale.row.uzum.operation = { token: 'old', action: 'accept', startedAt: new Date(at.getTime() - 600_000) };
  await assert.rejects(decide(stale, 'accept'), { code: 'uzum_reconciliation_required' });
  assert.deepEqual(stale.calls, []);
});
test('legacy reservations require operator reconciliation, never gain an invented actor', async () => {
  const f = fixture({ status: 'reserved', uzum: undefined, billz: { reservationApplied: true } });
  assert.equal(cleanOrder(f.row, at).reconciliationRequired, true);
  await assert.rejects(decide(f, 'ready'), { code: 'uzum_reconciliation_required' });
  assert.deepEqual(f.calls, []);
});

test('disabled service permits history reads but never decisions or cancellation drain', async () => {
  const f = fixture();
  const disabled = createLifecycle({ Model: f.Model, core: f.core, enabled: () => false, now: () => at });
  await assert.rejects(disabled.decide(id, { action: 'accept', actor }), { code: 'uzum_disabled' });
  assert.deepEqual((await disabled.get(id)).actions, []);
  assert.equal((await disabled.list()).enabled, false);
  await disabled.drainCancellations(); assert.deepEqual(f.calls, []);
});
test('reserve completed after deadline never publishes acceptance and compensates with cancellation', async () => {
  const f = fixture(); const reserve = f.core.reserveOrder;
  f.core.reserveOrder = async () => {
    await reserve(); f.time(new Date(at.getTime() + 15 * 60_000));
    assert.equal(cleanOrder(f.row, at).status, 'NEW', 'reservation is not operator acceptance');
  };
  await assert.rejects(decide(f, 'accept'), { code: 'uzum_acceptance_expired' });
  assert.deepEqual(f.calls, ['reserve', 'cancel']); assert.equal(f.row.status, 'cancelled');
  assert.equal(f.row.uzum.acceptedAt, undefined);
});
test('durable cancellation after retry-safe reservation failure drains without another reserve', async () => {
  const f = fixture();
  let release; const gate = new Promise((resolve) => { release = resolve; });
  f.core.reserveOrder = async () => { await gate; f.row.status = 'failed'; f.row.billz.failureDisposition = 'retry_safe'; throw Object.assign(new Error('private diagnostic'), { retrySafe: true, outcomeUnknown: false }); };
  const accepting = decide(f, 'accept'); await new Promise(setImmediate);
  await assert.rejects(decide(f, 'reject'), { code: 'uzum_operation_in_progress' });
  release(); await assert.rejects(accepting, { code: 'uzum_accounting_failed' });
  assert.ok(f.row.uzum.cancelRequested);
  await f.service.drainCancellations(); assert.equal(f.row.status, 'cancelled'); assert.deepEqual(f.calls, ['cancel']);
});
