const test = require('node:test');
const assert = require('node:assert/strict');

process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'shop-a';
process.env.MONGO_DB_NAME = 'internal-analytics-test';
process.env.SYNC_ON_BOOT = 'false';
process.env.CHANNEL_TELEGRAM_ENABLED = 'false';
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.CHANNEL_INTERNAL_TOKEN = 'internal-token-0123456789abcdef';

let mongod;
let db;
let server;
let base;
let ChannelOrder;
let billz;

test.before(async () => {
  const { MongoMemoryServer } = require(
    '/Users/tm/Projects/project vitamin delivery/backend/node_modules/mongodb-memory-server'
  );
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  db = require('../src/db');
  await db.connect();
  ChannelOrder = require('../src/models/ChannelOrder');
  billz = require('../src/billz/client');
  const { app } = require('../src/server');
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  server?.close();
  await db?.disconnect();
  await mongod?.stop();
});

test.beforeEach(async () => {
  await ChannelOrder().deleteMany({});
});

async function call(path, { token = process.env.CHANNEL_INTERNAL_TOKEN } = {}) {
  const res = await fetch(`${base}${path}`, {
    headers: token === null ? {} : { 'X-Internal-Token': token },
  });
  return { status: res.status, body: await res.json() };
}

test('analytics endpoints require internal token', async () => {
  const res = await call('/internal/analytics/channels/medicalka/summary?preset=7d', { token: null });
  assert.equal(res.status, 401);
});

test('channel summary and list return bounded normalized data', async () => {
  await ChannelOrder().create({
    channel: 'medicalka', externalId: 'MED-API', internalOrderId: 'INT-API',
    status: 'sold', soldAt: new Date(), totalAmount: 250_000,
    items: [{ billzProductId: 'p', name: 'OvaBoost', quantity: 2, unitPrice: 125_000 }],
    customer: { name: 'Mijoz', phone: '+998901234567', address: 'hidden' },
    billz: { orderNumber: 'B-API' },
  });

  const summary = await call('/internal/analytics/channels/medicalka/summary?preset=7d');
  assert.equal(summary.status, 200);
  assert.equal(summary.body.channel, 'medicalka');
  assert.equal(summary.body.summary.grossRevenue, 250_000);

  const sales = await call('/internal/analytics/channels/medicalka/sales?preset=7d&limit=500');
  assert.equal(sales.status, 200);
  assert.equal(sales.body.limit, 100);
  assert.equal(sales.body.rows[0].customer.phoneMasked, '+998 ** *** ** 67');
  assert.equal(JSON.stringify(sales.body).includes('hidden'), false);
});

test('channel and period validation fail closed', async () => {
  const unknown = await call('/internal/analytics/channels/shop/summary?preset=7d');
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error, 'unsupported_channel');

  const preset = await call('/internal/analytics/channels/medicalka/summary?preset=365d');
  assert.equal(preset.status, 422);
  assert.equal(preset.body.error, 'invalid_analytics_query');

  const long = await call('/internal/analytics/channels/medicalka/summary?from=2026-01-01&to=2026-08-01');
  assert.equal(long.status, 422);
});

test('Billz capability route sanitizes permission denial', async () => {
  const original = billz.get;
  billz.get = async () => { const err = new Error('private upstream message'); err.status = 403; throw err; };
  try {
    const result = await call('/internal/analytics/billz/capability?force=true');
    assert.equal(result.status, 200);
    assert.equal(result.body.state, 'report_access_required');
    assert.equal(JSON.stringify(result.body).includes('private'), false);
  } finally {
    billz.get = original;
  }
});

test('Billz inventory route returns trusted mirror state', async () => {
  const result = await call('/internal/analytics/billz/inventory');
  assert.equal(result.status, 200);
  assert.equal(result.body.inventory.freshness, 'unavailable');
  assert.equal(result.body.inventory.sellableUnits, 0);
});
