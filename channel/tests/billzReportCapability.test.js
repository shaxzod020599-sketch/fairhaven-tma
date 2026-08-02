const test = require('node:test');
const assert = require('node:assert/strict');

process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'shop-a';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/test';

const {
  checkReportCapability,
  resetReportCapabilityCache,
} = require('../src/billz/reportCapability');

test.beforeEach(() => resetReportCapabilityCache());

test('200 proves report route availability without interpreting revenue', async () => {
  const calls = [];
  const client = { get: async (...args) => { calls.push(args); return { orders: [{ total: 'secret-shape' }] }; } };
  const now = new Date('2026-08-02T12:00:00.000Z');
  const result = await checkReportCapability({ client, now });
  assert.deepEqual(result, { state: 'available', checkedAt: now, reason: '' });
  assert.deepEqual(calls, [['/v2/order', { limit: 1, page: 1 }]]);
  assert.equal(JSON.stringify(result).includes('secret-shape'), false);
});

test('403 becomes explicit report access requirement and never leaks body', async () => {
  const client = { get: async () => { const err = new Error('denied private body'); err.status = 403; err.body = { token: 'no' }; throw err; } };
  const result = await checkReportCapability({ client, now: new Date('2026-08-02T12:00:00Z') });
  assert.equal(result.state, 'report_access_required');
  assert.equal(result.reason, 'billz_report_permission_denied');
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.equal(JSON.stringify(result).includes('token'), false);
});

for (const status of [0, 401, 429, 500, 503]) {
  test(`status ${status} becomes sanitized unavailable`, async () => {
    const client = { get: async () => { const err = new Error('upstream detail'); err.status = status; throw err; } };
    const result = await checkReportCapability({ client, now: new Date('2026-08-02T12:00:00Z') });
    assert.deepEqual(result, {
      state: 'unavailable',
      checkedAt: new Date('2026-08-02T12:00:00Z'),
      reason: 'billz_temporarily_unavailable',
    });
  });
}

test('checks inside 15 minutes reuse cache and force bypasses it', async () => {
  let calls = 0;
  const client = { get: async () => { calls += 1; return {}; } };
  await checkReportCapability({ client, now: new Date('2026-08-02T12:00:00Z') });
  await checkReportCapability({ client, now: new Date('2026-08-02T12:14:59Z') });
  assert.equal(calls, 1);
  await checkReportCapability({ client, force: true, now: new Date('2026-08-02T12:15:00Z') });
  assert.equal(calls, 2);
});
