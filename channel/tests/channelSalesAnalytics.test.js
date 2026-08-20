const test = require('node:test');
const assert = require('node:assert/strict');

process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'shop-a';
process.env.BILLZ_CASHBOX_ID = 'till-1';
process.env.MONGO_DB_NAME = 'channel-sales-analytics-test';

const FROM = new Date('2026-08-01T00:00:00.000Z');
const TO = new Date('2026-08-03T00:00:00.000Z');

let mongod;
let db;
let ChannelOrder;
let summarizeChannelSales;
let listChannelSales;

function order(overrides = {}) {
  return {
    channel: 'medicalka',
    externalId: `EXT-${Math.random()}`,
    internalOrderId: `INT-${Math.random()}`,
    items: [{ billzProductId: 'p-1', name: 'OvaBoost', quantity: 2, unitPrice: 50_000 }],
    totalAmount: 100_000,
    customer: { name: 'Dilnoza', phone: '+998901234567', address: 'private' },
    status: 'sold',
    soldAt: new Date('2026-08-01T10:00:00.000Z'),
    billz: { orderNumber: 'B-100', lastError: '' },
    ...overrides,
  };
}

test.before(async () => {
  const { MongoMemoryServer } = require(
    '/Users/tm/Projects/project vitamin delivery/backend/node_modules/mongodb-memory-server'
  );
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  db = require('../src/db');
  await db.connect();
  ChannelOrder = require('../src/models/ChannelOrder');
  ({ summarizeChannelSales, listChannelSales } = require('../src/analytics/channelSales'));
  await ChannelOrder().init();
});

test.after(async () => {
  await db?.disconnect();
  await mongod?.stop();
});

test.beforeEach(async () => {
  await ChannelOrder().deleteMany({});
});

/**
 * Dates an order that never sold, inside the window under test.
 *
 * Only `sold` rows are placed by `soldAt`; everything else is placed by
 * `updatedAt`, which mongoose stamps with the real clock on create. Leaving it
 * there made these assertions depend on the day they were run — they passed on
 * 2026-08-02, when "now" still fell inside [FROM, TO), and began failing on
 * 2026-08-03 when it no longer did. Written through the driver because
 * mongoose treats `updatedAt` as its own and overwrites it.
 */
async function placeInWindow(externalIds, when = new Date('2026-08-01T09:00:00.000Z')) {
  await ChannelOrder().collection.updateMany(
    { externalId: { $in: externalIds } },
    { $set: { updatedAt: when } }
  );
}

test('summary counts sold revenue only inside soldAt range and isolates source', async () => {
  await ChannelOrder().create([
    order({ externalId: 'MED-SOLD', totalAmount: 100_000 }),
    order({ externalId: 'MED-TO', soldAt: TO, totalAmount: 900_000 }),
    order({ externalId: 'MED-LEGACY', soldAt: null, totalAmount: 800_000 }),
    order({ externalId: 'MED-RES', status: 'reserved', soldAt: null, totalAmount: 700_000 }),
    order({ externalId: 'UZ-SOLD', channel: 'uzum', totalAmount: 600_000 }),
    order({ externalId: 'MED-CANCEL', status: 'cancelled', soldAt: null }),
    order({ externalId: 'MED-FAIL', status: 'failed', soldAt: null }),
  ]);
  await placeInWindow(['MED-CANCEL', 'MED-FAIL', 'MED-RES']);

  const summary = await summarizeChannelSales({
    channel: 'medicalka', from: FROM, to: TO, Model: ChannelOrder(),
  });

  assert.deepEqual(summary, {
    grossRevenue: 100_000,
    completedCount: 1,
    averageCheck: 100_000,
    unitsSold: 2,
    returnedAmount: 0,
    cancelledCount: 1,
    failedCount: 1,
    legacyFallbackCount: 0,
  });
});

test('history normalizes lines, masks phone and never exposes address', async () => {
  await ChannelOrder().create(order({ externalId: 'MED-DETAIL', internalOrderId: 'INT-DETAIL' }));
  const result = await listChannelSales({
    channel: 'medicalka', from: FROM, to: TO, page: 1, limit: 25, Model: ChannelOrder(),
  });

  assert.equal(result.total, 1);
  assert.deepEqual(result.rows[0].items, [
    { name: 'OvaBoost', quantity: 2, unitPrice: 50_000, amount: 100_000 },
  ]);
  assert.equal(result.rows[0].itemCount, 2);
  assert.equal(result.rows[0].customer.phoneMasked, '+998 ** *** ** 67');
  assert.equal('address' in result.rows[0].customer, false);
  assert.equal(result.rows[0].occurredAt.toISOString(), '2026-08-01T10:00:00.000Z');
  assert.equal(result.rows[0].billzState, 'posted');
  assert.equal(result.rows[0].legacyTimeFallback, false);
});

test('Medicalka ledger shows sale and reconciliation failure with safe Billz state', async () => {
  await ChannelOrder().create([
    order({
      externalId: 'MED-SOLD-LEDGER',
      internalOrderId: 'INT-SOLD-LEDGER',
      billz: { orderNumber: 'BILLZ-SOLD-42', lastError: '' },
    }),
    order({
      externalId: 'MED-RECONCILE-LEDGER',
      internalOrderId: 'INT-RECONCILE-LEDGER',
      status: 'failed',
      soldAt: null,
      totalAmount: 900_000,
      billz: { orderNumber: '', lastError: 'provider response body must remain private' },
    }),
  ]);
  await placeInWindow(['MED-RECONCILE-LEDGER']);

  const history = await listChannelSales({
    channel: 'medicalka', from: FROM, to: TO, page: 1, limit: 25, Model: ChannelOrder(),
  });
  const sold = history.rows.find((row) => row.externalId === 'MED-SOLD-LEDGER');
  const reconciliation = history.rows.find((row) => row.externalId === 'MED-RECONCILE-LEDGER');

  assert.equal(history.total, 2);
  assert.equal(sold.status, 'sold');
  assert.equal(sold.billzOrderNumber, 'BILLZ-SOLD-42');
  assert.equal(sold.billzState, 'posted');
  assert.equal(reconciliation.status, 'failed');
  assert.equal(reconciliation.billzState, 'error');
  assert.equal('lastError' in reconciliation, false);

  for (const row of [sold, reconciliation]) {
    assert.equal(row.customer.phoneMasked, '+998 ** *** ** 67');
    assert.equal('address' in row.customer, false);
    assert.equal(JSON.stringify(row).includes('+998901234567'), false);
    assert.equal(JSON.stringify(row).includes('private'), false);
  }

  const summary = await summarizeChannelSales({
    channel: 'medicalka', from: FROM, to: TO, Model: ChannelOrder(),
  });
  assert.deepEqual(summary, {
    grossRevenue: 100_000,
    completedCount: 1,
    averageCheck: 100_000,
    unitsSold: 2,
    returnedAmount: 0,
    cancelledCount: 0,
    failedCount: 1,
    legacyFallbackCount: 0,
  });
});

test('backfilled soldAt stays visibly marked as an estimated legacy timestamp', async () => {
  await ChannelOrder().create(order({ externalId: 'MED-LEGACY-TIME', soldAtEstimated: true }));
  const result = await listChannelSales({
    channel: 'medicalka', from: FROM, to: TO, page: 1, limit: 25, Model: ChannelOrder(),
  });

  assert.equal(result.rows[0].legacyTimeFallback, true);
  const summary = await summarizeChannelSales({
    channel: 'medicalka', from: FROM, to: TO, Model: ChannelOrder(),
  });
  assert.equal(summary.legacyFallbackCount, 1);
});

test('history search escapes regex and pagination sort stays stable', async () => {
  await ChannelOrder().create([
    order({ externalId: 'literal.[1]', internalOrderId: 'INT-B', soldAt: new Date('2026-08-01T12:00:00Z') }),
    order({ externalId: 'literalX1', internalOrderId: 'INT-A', soldAt: new Date('2026-08-01T12:00:00Z') }),
    order({ externalId: 'OTHER', internalOrderId: 'INT-C', soldAt: new Date('2026-08-01T11:00:00Z') }),
  ]);

  const escaped = await listChannelSales({
    channel: 'medicalka', from: FROM, to: TO, search: 'literal.[1]',
    page: 1, limit: 25, Model: ChannelOrder(),
  });
  assert.deepEqual(escaped.rows.map((row) => row.externalId), ['literal.[1]']);

  const first = await listChannelSales({
    channel: 'medicalka', from: FROM, to: TO, page: 1, limit: 1, Model: ChannelOrder(),
  });
  const second = await listChannelSales({
    channel: 'medicalka', from: FROM, to: TO, page: 2, limit: 1, Model: ChannelOrder(),
  });
  assert.notEqual(first.rows[0].id, second.rows[0].id);
  assert.equal(first.total, 3);
  assert.equal(second.total, 3);
});

test('status filter returns only requested lifecycle state', async () => {
  await ChannelOrder().create([
    order({ externalId: 'SOLD' }),
    order({ externalId: 'FAILED', status: 'failed', soldAt: null }),
  ]);
  await placeInWindow(['FAILED']);
  const result = await listChannelSales({
    channel: 'medicalka', from: FROM, to: TO, status: 'failed',
    page: 1, limit: 25, Model: ChannelOrder(),
  });
  assert.deepEqual(result.rows.map((row) => row.status), ['failed']);
});
