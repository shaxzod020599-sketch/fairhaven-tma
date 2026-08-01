const assert = require('node:assert/strict');
const test = require('node:test');

process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'shop-a';
process.env.BILLZ_CASHBOX_ID = 'till-1';
process.env.BILLZ_PAYMENT_TYPE_ID = 'pt-transfer';
process.env.MONGO_DB_NAME = 'bot-orders-test';
// Nothing here should reach Telegram.
process.env.CHANNEL_TELEGRAM_ENABLED = 'false';

let mongod;
let db;
let botOrders;
let orders;
let ChannelOrder;
let BillzProduct;
let sale;

/**
 * The bridge between the bot backend and Billz.
 *
 * These run against a real MongoDB because the properties under test are
 * enforced by the database — the unique index that makes a resent goal
 * idempotent, and the `$inc` counters that must never be applied twice. A stub
 * would prove nothing about either.
 */
test.before(async () => {
  const { MongoMemoryServer } = require(
    '/Users/tm/Projects/project vitamin delivery/backend/node_modules/mongodb-memory-server'
  );
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();

  db = require('../src/db');
  await db.connect();

  botOrders = require('../src/core/botOrders');
  orders = require('../src/core/orders');
  ChannelOrder = require('../src/models/ChannelOrder');
  BillzProduct = require('../src/models/BillzProduct');
  sale = require('../src/billz/sale');
  await ChannelOrder().init();
});

test.after(async () => {
  await db.disconnect();
  await mongod?.stop();
});

function stubSale(overrides = {}) {
  const original = { ...sale };
  const calls = [];
  sale.reserveOrder = async (args) => {
    calls.push({ fn: 'reserveOrder', args });
    if (overrides.reserveOrder) return overrides.reserveOrder(args);
    return { orderId: `draft-${calls.length}`, orderNumber: '900' };
  };
  sale.completeSale = async (id, args) => {
    calls.push({ fn: 'completeSale', id, args });
    if (overrides.completeSale) return overrides.completeSale(id, args);
    return {};
  };
  sale.releaseReservation = async (id) => {
    calls.push({ fn: 'releaseReservation', id });
    if (overrides.releaseReservation) return overrides.releaseReservation(id);
    return {};
  };
  return {
    calls,
    restore: () => {
      sale.reserveOrder = original.reserveOrder;
      sale.completeSale = original.completeSale;
      sale.releaseReservation = original.releaseReservation;
    },
  };
}

let seq = 0;
async function product({ stock = 20 } = {}) {
  seq += 1;
  const billzProductId = `bp-${seq}`;
  await BillzProduct().create({
    billzProductId, name: `Product ${seq}`, stock, reservedQty: 0, pendingQty: 0,
  });
  return billzProductId;
}

function goal(externalId, target, billzProductId, extra = {}) {
  return {
    externalId,
    target,
    items: [{ billzProductId, name: 'Product', quantity: 2, unitPrice: 150000 }],
    totalAmount: 300000,
    customer: { name: 'Tester', phone: '+998900000000', address: 'Tashkent' },
    ...extra,
  };
}

const counters = async (billzProductId) => {
  const m = await BillzProduct().findOne({ billzProductId }).lean();
  return { reserved: m.reservedQty, pending: m.pendingQty };
};

/* ── The local hold ──────────────────────────────────────────────────────── */

test('a new order holds stock locally without writing anything to Billz', async () => {
  // The whole point of the bot flow: an operator confirms in Telegram before
  // Billz hears about the order. Until then the units must still leave the
  // marketplaces, or the first confirmation finds the stock sold elsewhere.
  const stub = stubSale();
  const bp = await product();

  const result = await botOrders.ensureState(goal('BOT-1', 'hold', bp));

  assert.equal(result.applied, true);
  assert.deepEqual(await counters(bp), { reserved: 0, pending: 2 });
  assert.equal(stub.calls.length, 0, 'nothing may be written to Billz before confirmation');
  stub.restore();
});

test('re-sending the same goal does not hold the units twice', async () => {
  const stub = stubSale();
  const bp = await product();

  await botOrders.ensureState(goal('BOT-2', 'hold', bp));
  const again = await botOrders.ensureState(goal('BOT-2', 'hold', bp));

  assert.equal(again.applied, false);
  assert.deepEqual(await counters(bp), { reserved: 0, pending: 2 });
  stub.restore();
});

test('confirming converts the local hold into a Billz reservation', async () => {
  // Both counters are subtracted from sellable stock, so leaving the hold in
  // place alongside the reservation would take twice the inventory off sale.
  const stub = stubSale();
  const bp = await product();

  await botOrders.ensureState(goal('BOT-3', 'hold', bp));
  const reserved = await botOrders.ensureState(goal('BOT-3', 'reserve', bp));

  assert.equal(reserved.status, 'reserved');
  assert.deepEqual(await counters(bp), { reserved: 2, pending: 0 });
  assert.equal(stub.calls.filter((c) => c.fn === 'reserveOrder').length, 1);
  stub.restore();
});

test('an expired hold is released, and confirming afterwards still reserves', async () => {
  const stub = stubSale();
  const bp = await product();

  await botOrders.ensureState(goal('BOT-4', 'hold', bp));
  await ChannelOrder().updateOne(
    { externalId: 'BOT-4' },
    { $set: { holdExpiresAt: new Date(Date.now() - 1000) } }
  );

  const swept = await botOrders.sweepExpiredHolds();
  assert.equal(swept.released, 1);
  assert.deepEqual(await counters(bp), { reserved: 0, pending: 0 });

  // The order is still open — expiry drops the protection, not the order.
  const reserved = await botOrders.ensureState(goal('BOT-4', 'reserve', bp));
  assert.equal(reserved.status, 'reserved');
  assert.deepEqual(await counters(bp), { reserved: 2, pending: 0 });
  stub.restore();
});

test('the sweeper leaves holds that have not expired alone', async () => {
  const stub = stubSale();
  const bp = await product();

  await botOrders.ensureState(goal('BOT-5', 'hold', bp));
  const swept = await botOrders.sweepExpiredHolds();

  assert.equal(swept.released, 0);
  assert.deepEqual(await counters(bp), { reserved: 0, pending: 2 });
  stub.restore();
});

/* ── Walking to a goal ───────────────────────────────────────────────────── */

test('a status that skips ahead still reserves before it sells', async () => {
  // An order marked delivered without ever passing through confirmed would
  // otherwise post a payment against a draft that was never postponed.
  const stub = stubSale();
  const bp = await product();

  const sold = await botOrders.ensureState(goal('BOT-6', 'sell', bp));

  assert.equal(sold.status, 'sold');
  const order = stub.calls.map((c) => c.fn);
  assert.deepEqual(order, ['reserveOrder', 'completeSale']);
  assert.deepEqual(await counters(bp), { reserved: 0, pending: 0 });
  stub.restore();
});

test('selling twice posts one payment', async () => {
  const stub = stubSale();
  const bp = await product();

  await botOrders.ensureState(goal('BOT-7', 'sell', bp));
  const again = await botOrders.ensureState(goal('BOT-7', 'sell', bp));

  assert.equal(again.applied, false);
  assert.equal(stub.calls.filter((c) => c.fn === 'completeSale').length, 1);
  stub.restore();
});

test('cancelling releases both the local hold and the Billz reservation', async () => {
  const stub = stubSale();
  const bp = await product();

  await botOrders.ensureState(goal('BOT-8', 'reserve', bp));
  assert.deepEqual(await counters(bp), { reserved: 2, pending: 0 });

  const cancelled = await botOrders.ensureState(goal('BOT-8', 'cancel', bp));
  assert.equal(cancelled.status, 'cancelled');
  assert.deepEqual(await counters(bp), { reserved: 0, pending: 0 });
  assert.equal(stub.calls.filter((c) => c.fn === 'releaseReservation').length, 1);
  stub.restore();
});

test('cancelling an order that never reached Billz gives back its hold', async () => {
  const stub = stubSale();
  const bp = await product();

  await botOrders.ensureState(goal('BOT-9', 'hold', bp));
  await botOrders.ensureState(goal('BOT-9', 'cancel', bp));

  assert.deepEqual(await counters(bp), { reserved: 0, pending: 0 });
  assert.equal(stub.calls.length, 0);
  stub.restore();
});

/* ── Conflicts ───────────────────────────────────────────────────────────── */

test('cancelling a delivered order is reported as a conflict, not applied', async () => {
  // A delivered order is returned, which is different accounting. Silently
  // "cancelling" it would put the stock back without any money moving.
  const stub = stubSale();
  const bp = await product();

  await botOrders.ensureState(goal('BOT-10', 'sell', bp));
  const late = await botOrders.ensureState(goal('BOT-10', 'cancel', bp));

  assert.equal(late.applied, false);
  assert.match(late.conflict, /already_sold/);
  assert.equal(
    (await ChannelOrder().findOne({ externalId: 'BOT-10' }).lean()).status,
    'sold'
  );
  stub.restore();
});

test('reserving a cancelled order is refused rather than silently reopened', async () => {
  const stub = stubSale();
  const bp = await product();

  await botOrders.ensureState(goal('BOT-11', 'hold', bp));
  await botOrders.ensureState(goal('BOT-11', 'cancel', bp));
  const revived = await botOrders.ensureState(goal('BOT-11', 'reserve', bp));

  assert.equal(revived.applied, false);
  assert.match(revived.conflict, /already_cancelled/);
  stub.restore();
});

test('an unknown goal is refused outright', async () => {
  const bp = await product();
  await assert.rejects(
    () => botOrders.ensureState(goal('BOT-12', 'refund', bp)),
    /unknown goal/
  );
});

/* ── Lines with no Billz counterpart ─────────────────────────────────────── */

test('an order of hand-managed products writes nothing and reports done', async () => {
  // Products with no Billz link are a deliberate part of the catalogue. The
  // order is real, there is simply no stock record to move.
  const stub = stubSale();
  const result = await botOrders.ensureState({
    externalId: 'BOT-13',
    target: 'reserve',
    items: [{ billzProductId: '', name: 'Handmade', quantity: 1, unitPrice: 50000 }],
    totalAmount: 50000,
  });

  assert.equal(result.status, 'not_applicable');
  assert.equal(result.applied, false);
  assert.equal(await ChannelOrder().countDocuments({ externalId: 'BOT-13' }), 0);
  assert.equal(stub.calls.length, 0);
  stub.restore();
});

test('a mixed order reserves only the lines Billz knows about', async () => {
  const stub = stubSale();
  const bp = await product();

  await botOrders.ensureState({
    externalId: 'BOT-14',
    target: 'reserve',
    items: [
      { billzProductId: bp, name: 'Linked', quantity: 2, unitPrice: 150000 },
      { billzProductId: '', name: 'Handmade', quantity: 5, unitPrice: 10000 },
    ],
    totalAmount: 350000,
  });

  const stored = await ChannelOrder().findOne({ externalId: 'BOT-14' }).lean();
  assert.equal(stored.items.length, 1);
  assert.equal(stored.items[0].billzProductId, bp);
  assert.deepEqual(await counters(bp), { reserved: 2, pending: 0 });
  stub.restore();
});

/* ── Failure handling ────────────────────────────────────────────────────── */

test('a reservation Billz refuses leaves the order retryable and holds nothing', async () => {
  const stub = stubSale({
    reserveOrder: async () => { throw new Error('billz said no'); },
  });
  const bp = await product();

  await assert.rejects(() => botOrders.ensureState(goal('BOT-15', 'reserve', bp)));

  const stored = await ChannelOrder().findOne({ externalId: 'BOT-15' }).lean();
  assert.equal(stored.status, 'failed');
  assert.match(stored.billz.lastError, /billz said no/);
  assert.deepEqual(await counters(bp), { reserved: 0, pending: 0 });
  stub.restore();
});

test('a failed order can be retried and reserves exactly once', async () => {
  let calls = 0;
  const stub = stubSale({
    reserveOrder: async () => {
      calls += 1;
      if (calls === 1) throw new Error('transient');
      return { orderId: 'draft-retry', orderNumber: '901' };
    },
  });
  const bp = await product();

  await assert.rejects(() => botOrders.ensureState(goal('BOT-16', 'reserve', bp)));
  const retried = await botOrders.ensureState(goal('BOT-16', 'reserve', bp));

  assert.equal(retried.status, 'reserved');
  assert.deepEqual(await counters(bp), { reserved: 2, pending: 0 });
  stub.restore();
});

test('a hold taken before a failed reservation is not lost', async () => {
  // The units must stay protected: the order is still live and an operator will
  // retry it.
  const stub = stubSale({
    reserveOrder: async () => { throw new Error('billz down'); },
  });
  const bp = await product();

  await botOrders.ensureState(goal('BOT-17', 'hold', bp));
  await assert.rejects(() => botOrders.ensureState(goal('BOT-17', 'reserve', bp)));

  assert.deepEqual(await counters(bp), { reserved: 0, pending: 2 });
  stub.restore();
});
