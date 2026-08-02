const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const FROM = new Date('2026-08-01T00:00:00.000Z');
const TO = new Date('2026-08-02T00:00:00.000Z');

let mongod;
let Order;
let summarizeFairhavenSales;
let listFairhavenSales;

function line(name = 'OvaBoost', quantity = 2, price = 50_000) {
  return { productId: new mongoose.Types.ObjectId(), name, quantity, price };
}

function order(overrides = {}) {
  return {
    telegramId: 100,
    items: [line()],
    totalAmount: 100_000,
    status: 'delivered',
    statusHistory: [{ status: 'delivered', at: new Date('2026-08-01T10:00:00Z') }],
    customerName: 'Dilnoza',
    customerPhone: '+998901234567',
    ...overrides,
  };
}

test.before(async () => {
  const { MongoMemoryServer } = require('mongodb-memory-server');
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'sales-analytics-test' });
  Order = require('../models/Order');
  ({ summarizeFairhavenSales, listFairhavenSales } = require('../services/salesAnalytics'));
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test.beforeEach(async () => Order.deleteMany({}));

test('summary uses immutable delivery/return events, not order creation or current status', async () => {
  const delivered = await Order.create(order({ totalAmount: 100_000 }));
  await Order.collection.updateOne({ _id: delivered._id }, { $set: { createdAt: new Date('2026-07-01T00:00:00Z') } });
  await Order.create(order({
    totalAmount: 50_000,
    status: 'returned',
    items: [line('FertilAid', 1, 50_000)],
    statusHistory: [
      { status: 'delivered', at: new Date('2026-08-01T12:00:00Z') },
      { status: 'returned', at: new Date('2026-08-01T18:00:00Z') },
      { status: 'returned', at: new Date('2026-08-01T19:00:00Z') },
    ],
  }));
  await Order.create(order({
    totalAmount: 900_000, status: 'cancelled',
    statusHistory: [{ status: 'cancelled', at: new Date('2026-08-01T13:00:00Z') }],
  }));
  const legacy = await Order.create(order({ totalAmount: 25_000, statusHistory: [] }));
  await Order.collection.updateOne({ _id: legacy._id }, { $set: { createdAt: new Date('2026-08-01T09:00:00Z') } });
  await Order.create(order({
    totalAmount: 700_000,
    statusHistory: [{ status: 'delivered', at: TO }],
  }));

  const result = await summarizeFairhavenSales({ from: FROM, to: TO, Model: Order });
  assert.deepEqual(result, {
    grossRevenue: 175_000,
    returnedAmount: 50_000,
    netRevenue: 125_000,
    completedCount: 3,
    averageCheck: 175_000 / 3,
    unitsSold: 5,
    cancelledCount: 1,
    failedCount: 0,
    legacyFallbackCount: 1,
  });
});

test('history uses current lifecycle event, normalizes items and masks private customer data', async () => {
  await Order.create(order({
    customerName: 'Malika',
    location: { lat: 1, lng: 1, addressString: 'private address' },
    billzSync: { dispatched: 'sell', attempts: 0, lastError: '', conflict: '' },
  }));
  const result = await listFairhavenSales({
    from: FROM, to: TO, page: 1, limit: 25, Model: Order,
  });

  assert.equal(result.total, 1);
  assert.equal(result.rows[0].source, 'fairhaven.uz');
  assert.equal(result.rows[0].occurredAt.toISOString(), '2026-08-01T10:00:00.000Z');
  assert.equal(result.rows[0].customer.phoneMasked, '+998 ** *** ** 67');
  assert.equal(JSON.stringify(result.rows[0]).includes('private address'), false);
  assert.deepEqual(result.rows[0].items, [
    { name: 'OvaBoost', quantity: 2, unitPrice: 50_000, amount: 100_000 },
  ]);
  assert.equal(result.rows[0].itemCount, 2);
  assert.equal(result.rows[0].billzState, 'posted');
  assert.equal(result.rows[0].legacyTimeFallback, false);
});

test('legacy row is visibly flagged and regex search stays literal', async () => {
  const legacy = await Order.create(order({
    statusHistory: [], customerName: 'literal.[1]', customerPhone: '+998900000001',
  }));
  await Order.collection.updateOne({ _id: legacy._id }, { $set: { createdAt: new Date('2026-08-01T08:00:00Z') } });
  await Order.create(order({ customerName: 'literalX1', customerPhone: '+998900000002' }));

  const result = await listFairhavenSales({
    from: FROM, to: TO, search: 'literal.[1]', page: 1, limit: 25, Model: Order,
  });
  assert.equal(result.total, 1);
  assert.equal(result.rows[0].customer.name, 'literal.[1]');
  assert.equal(result.rows[0].legacyTimeFallback, true);
});

test('history status and stable pagination stay bounded', async () => {
  await Order.create([
    order({ customerName: 'A', status: 'cancelled', statusHistory: [{ status: 'cancelled', at: new Date('2026-08-01T12:00:00Z') }] }),
    order({ customerName: 'B', status: 'cancelled', statusHistory: [{ status: 'cancelled', at: new Date('2026-08-01T12:00:00Z') }] }),
    order({ customerName: 'C' }),
  ]);
  const first = await listFairhavenSales({
    from: FROM, to: TO, status: 'cancelled', page: 1, limit: 1, Model: Order,
  });
  const second = await listFairhavenSales({
    from: FROM, to: TO, status: 'cancelled', page: 2, limit: 1, Model: Order,
  });
  assert.equal(first.total, 2);
  assert.equal(second.total, 2);
  assert.notEqual(first.rows[0].id, second.rows[0].id);
});
