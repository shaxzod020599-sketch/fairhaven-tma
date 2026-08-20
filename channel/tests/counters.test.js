const assert = require('node:assert/strict');
const test = require('node:test');

process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'shop-a';
process.env.BILLZ_CASHBOX_ID = 'till-1';
process.env.BILLZ_PAYMENT_TYPE_ID = 'pt-transfer';
process.env.MONGO_DB_NAME = 'counters-test';
process.env.CHANNEL_TELEGRAM_ENABLED = 'false';

let mongod;
let db;
let counters;
let orders;
let ChannelOrder;
let BillzProduct;
let sale;

/**
 * The counter repair.
 *
 * `reservedQty` and `pendingQty` are the two fields the catalogue sync never
 * overwrites, which is what makes a drift here permanent — no later sync
 * corrects it, and nothing surfaces until someone counts the shelf. The
 * lifecycle is written so drift cannot happen; this is the net under it, and
 * these tests are as much about it staying *inert* as about it working.
 */
test.before(async () => {
  const { MongoMemoryServer } = require(
    '/Users/tm/Projects/project vitamin delivery/backend/node_modules/mongodb-memory-server'
  );
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();

  db = require('../src/db');
  await db.connect();

  counters = require('../src/core/counters');
  orders = require('../src/core/orders');
  ChannelOrder = require('../src/models/ChannelOrder');
  BillzProduct = require('../src/models/BillzProduct');
  sale = require('../src/billz/sale');
  await ChannelOrder().init();

  sale.reserveOrder = async () => ({ orderId: 'draft-1', orderNumber: '900' });
  sale.completeSale = async () => ({});
  sale.releaseReservation = async () => ({});
  sale.deleteDraft = async () => ({});
});

test.after(async () => {
  await db.disconnect();
  await mongod?.stop();
});

test.beforeEach(async () => {
  await ChannelOrder().deleteMany({});
  await BillzProduct().deleteMany({});
});

let seq = 0;
async function product({ stock = 50, reservedQty = 0, pendingQty = 0 } = {}) {
  seq += 1;
  const billzProductId = `cp-${seq}`;
  await BillzProduct().create({ billzProductId, name: `P${seq}`, stock, reservedQty, pendingQty });
  return billzProductId;
}

/** Ages every order past the quiet window so the repair will act on it. */
async function makeQuiet() {
  await ChannelOrder().collection.updateMany(
    {},
    { $set: { updatedAt: new Date(Date.now() - 10 * 60 * 1000) } }
  );
}

const mirror = async (id) => BillzProduct().findOne({ billzProductId: id }).lean();

/* ── Staying inert ───────────────────────────────────────────────────────── */

test('a healthy system produces no corrections at all', async () => {
  const bp = await product();
  const { order } = await orders.acceptOrder('medicalka', {
    externalId: 'C-1',
    items: [{ billzProductId: bp, quantity: 3, unitPrice: 1000 }],
  });
  await orders.reserveOrder(order.internalOrderId);
  await makeQuiet();

  const result = await counters.reconcileCounters();

  assert.deepEqual(result.corrections, [], 'the repair must not touch a correct system');
  assert.equal((await mirror(bp)).reservedQty, 3);
});

test('an empty system is a no-op', async () => {
  const result = await counters.reconcileCounters();
  assert.deepEqual(result.corrections, []);
});

test('a full lifecycle leaves the counters where it found them', async () => {
  const bp = await product();
  const before = await mirror(bp);

  const { order } = await orders.acceptOrder('medicalka', {
    externalId: 'C-2',
    items: [{ billzProductId: bp, quantity: 4, unitPrice: 1000 }],
  });
  await orders.reserveOrder(order.internalOrderId);
  await orders.completeOrder(order.internalOrderId);
  await makeQuiet();

  const after = await mirror(bp);
  assert.equal(after.reservedQty, before.reservedQty);
  assert.equal(after.pendingQty, before.pendingQty);
  assert.deepEqual((await counters.reconcileCounters()).corrections, []);
});

/* ── Repairing ───────────────────────────────────────────────────────────── */

test('units held by nothing are given back', async () => {
  // The shape a killed process leaves behind: the $inc landed, the flag never
  // did. Nothing releases these — the cancellation path trusts the flag.
  const bp = await product({ reservedQty: 7 });

  const result = await counters.reconcileCounters();

  assert.equal(result.corrections.length, 1);
  assert.deepEqual(result.corrections[0].reserved, [7, 0]);
  assert.equal((await mirror(bp)).reservedQty, 0);
});

test('units an order holds but the mirror forgot are restored', async () => {
  const bp = await product();
  const { order } = await orders.acceptOrder('medicalka', {
    externalId: 'C-3',
    items: [{ billzProductId: bp, quantity: 5, unitPrice: 1000 }],
  });
  await orders.reserveOrder(order.internalOrderId);

  // Simulated drift in the other direction.
  await BillzProduct().updateOne({ billzProductId: bp }, { $set: { reservedQty: 0 } });
  await makeQuiet();

  await counters.reconcileCounters();
  assert.equal((await mirror(bp)).reservedQty, 5, 'a reservation must not be sellable twice');
});

test('local holds are repaired on their own counter, not merged into reservations', async () => {
  const bp = await product();
  const { order } = await orders.acceptOrder('fairhaven-bot', {
    externalId: 'C-4',
    items: [{ billzProductId: bp, quantity: 2, unitPrice: 1000 }],
  });
  await orders.holdOrder(order.internalOrderId);
  await BillzProduct().updateOne(
    { billzProductId: bp },
    { $set: { pendingQty: 99, reservedQty: 4 } }
  );
  await makeQuiet();

  await counters.reconcileCounters();

  const fixed = await mirror(bp);
  assert.equal(fixed.pendingQty, 2);
  assert.equal(fixed.reservedQty, 0);
});

test('several orders on one product are summed, not overwritten', async () => {
  const bp = await product();
  for (const [id, qty] of [['C-5a', 2], ['C-5b', 3], ['C-5c', 1]]) {
    const { order } = await orders.acceptOrder('medicalka', {
      externalId: id,
      items: [{ billzProductId: bp, quantity: qty, unitPrice: 1000 }],
    });
    await orders.reserveOrder(order.internalOrderId);
  }
  await BillzProduct().updateOne({ billzProductId: bp }, { $set: { reservedQty: 0 } });
  await makeQuiet();

  await counters.reconcileCounters();
  assert.equal((await mirror(bp)).reservedQty, 6);
});

test('a cancelled order stops counting towards the total', async () => {
  const bp = await product();
  const { order } = await orders.acceptOrder('medicalka', {
    externalId: 'C-6',
    items: [{ billzProductId: bp, quantity: 3, unitPrice: 1000 }],
  });
  await orders.reserveOrder(order.internalOrderId);
  await orders.cancelOrder(order.internalOrderId);
  await BillzProduct().updateOne({ billzProductId: bp }, { $set: { reservedQty: 3 } });
  await makeQuiet();

  await counters.reconcileCounters();
  assert.equal((await mirror(bp)).reservedQty, 0);
});

/* ── Not racing the lifecycle ────────────────────────────────────────────── */

test('a product whose order just moved is left alone', async () => {
  // The counter update for an in-flight order can land after this pass read the
  // orders. Writing a total computed before it would undo it — so recently
  // touched products are skipped and picked up on the next pass.
  const bp = await product();
  const { order } = await orders.acceptOrder('medicalka', {
    externalId: 'C-7',
    items: [{ billzProductId: bp, quantity: 3, unitPrice: 1000 }],
  });
  await orders.reserveOrder(order.internalOrderId);
  await BillzProduct().updateOne({ billzProductId: bp }, { $set: { reservedQty: 0 } });

  // No makeQuiet(): the order was touched a moment ago.
  const result = await counters.reconcileCounters();

  assert.deepEqual(result.corrections, []);
  assert.ok(result.skipped.includes(bp));
  assert.equal((await mirror(bp)).reservedQty, 0, 'left for the next pass');
});

test('the quiet window expires and the repair then acts', async () => {
  const bp = await product();
  const { order } = await orders.acceptOrder('medicalka', {
    externalId: 'C-8',
    items: [{ billzProductId: bp, quantity: 3, unitPrice: 1000 }],
  });
  await orders.reserveOrder(order.internalOrderId);
  await BillzProduct().updateOne({ billzProductId: bp }, { $set: { reservedQty: 0 } });

  assert.deepEqual((await counters.reconcileCounters()).corrections, []);

  // Same state, later.
  const later = Date.now() + 5 * 60 * 1000;
  const result = await counters.reconcileCounters({ now: later });

  assert.equal(result.corrections.length, 1);
  assert.equal((await mirror(bp)).reservedQty, 3);
});

test('a dry run reports what it would change without changing it', async () => {
  const bp = await product({ reservedQty: 9 });

  const result = await counters.reconcileCounters({ apply: false });

  assert.equal(result.corrections.length, 1);
  assert.equal((await mirror(bp)).reservedQty, 9, 'nothing may be written on a dry run');
});

/* ── The bug this exists for ─────────────────────────────────────────────── */

test('a reservation whose hold release failed still counts as reserved', async () => {
  // The counter and the flag that describes it are set with no await between
  // them, so a failure in any later step cannot save an order claiming to hold
  // nothing while the mirror says otherwise — those units would never come
  // back, because cancellation trusts the flag.
  const bp = await product();
  const { order } = await orders.acceptOrder('fairhaven-bot', {
    externalId: 'C-9',
    items: [{ billzProductId: bp, quantity: 2, unitPrice: 1000 }],
  });
  await orders.holdOrder(order.internalOrderId);

  const realBulkWrite = BillzProduct().bulkWrite.bind(BillzProduct());
  let calls = 0;
  BillzProduct().bulkWrite = async (...args) => {
    calls += 1;
    // First call is the reservation; the second is the hold release.
    if (calls === 2) throw new Error('database went away mid-release');
    return realBulkWrite(...args);
  };

  await assert.rejects(() => orders.reserveOrder(order.internalOrderId));
  BillzProduct().bulkWrite = realBulkWrite;

  const stored = await ChannelOrder().findOne({ externalId: 'C-9' }).lean();
  assert.equal(stored.billz.reservationApplied, true, 'the units are held and the order says so');
  assert.equal(stored.billz.reconciliationRequired, true, 'the partial transition needs review');

  // And the repair settles the hold that never got released.
  await makeQuiet();
  await counters.reconcileCounters();
  const fixed = await mirror(bp);
  assert.equal(fixed.reservedQty, 2);
  assert.equal(fixed.pendingQty, 2, 'the flag still says held, so the repair agrees with it');
});
