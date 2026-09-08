require('./helpers/isolatedChannelEnv');
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.BILLZ_SECRET_TOKEN = 'test-secret'; process.env.BILLZ_SHOP_ID = 'shop';
process.env.BILLZ_PAYMENT_TYPE_ID = 'test-payment'; process.env.CHANNEL_TELEGRAM_ENABLED = 'false';
let mongod; let db; let Order; let Mirror; let core; let sale;
const stock = require('../src/uzum/stock');
test.before(async () => {
  const { MongoMemoryServer } = require('../../backend/node_modules/mongodb-memory-server');
  mongod = await MongoMemoryServer.create(); process.env.MONGO_URI = mongod.getUri();
  db = require('../src/db'); await db.connect();
  Order = require('../src/models/ChannelOrder')(); Mirror = require('../src/models/BillzProduct')();
  core = require('../src/core/orders'); sale = require('../src/billz/sale');
  await Promise.all([Order.init(), Mirror.init()]);
});
test.after(async () => { await db?.disconnect(); await mongod?.stop(); });
test.beforeEach(async () => { await Promise.all([Order.deleteMany({}), Mirror.deleteMany({})]); });
async function seed(id) {
  await Mirror.create({ billzProductId: id, stock: 2, reservedQty: 1 });
  await Order.create({ channel: 'uzum', externalId: id, internalOrderId: id, status: 'reserved', totalAmount: 100,
    items: [{ billzProductId: id, quantity: 1, unitPrice: 100 }], uzum: { version: 1, acceptedAt: new Date() },
    billz: { draftOrderId: `draft-${id}`, reservationApplied: true } });
}

for (const channel of ['medicalka', 'fairhaven-bot', 'uzum']) {
  for (const priorSoldAt of [null, '2026-09-07T10:00:00.000Z']) {
    test(`${channel} soldAt ${priorSoldAt ? 'with a prior timestamp' : 'without a prior timestamp'} follows channel completion timing`, async (t) => {
      const id = `timing-${channel}-${priorSoldAt ? 'prior' : 'new'}`;
      await seed(id);
      await Mirror.updateOne({ billzProductId: id }, { $set: { pendingQty: 1 } });
      await Order.updateOne({ internalOrderId: id }, { $set: {
        channel, soldAt: priorSoldAt, soldAtEstimated: true,
        'billz.pendingApplied': true, holdExpiresAt: new Date('2026-09-08T12:00:00Z'),
      } });

      t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-08T10:00:00Z') });
      t.mock.method(sale, 'completeSale', async () => {
        t.mock.timers.setTime(Date.parse('2026-09-08T10:00:10Z'));
      });
      const bulkWrite = Mirror.bulkWrite;
      t.mock.method(Mirror, 'bulkWrite', async function (operations, options) {
        const result = await bulkWrite.call(this, operations, options);
        const pendingRelease = operations[0].updateOne.update.$inc.pendingQty === -1;
        t.mock.timers.setTime(Date.parse(pendingRelease
          ? '2026-09-08T10:00:30Z' : '2026-09-08T10:00:20Z'));
        return result;
      });
      if (channel === 'uzum') {
        const transferSoldHold = stock.transferSoldHold;
        t.mock.method(stock, 'transferSoldHold', async (...args) => {
          t.mock.timers.setTime(Date.parse('2026-09-08T10:00:20Z'));
          return transferSoldHold(...args);
        });
      }

      const result = await core.completeOrder(id);
      const row = await Order.findOne({ internalOrderId: id }).lean();
      const mirror = await Mirror.findOne({ billzProductId: id }).lean();
      const expected = channel === 'uzum'
        ? '2026-09-08T10:00:10.000Z'
        : priorSoldAt || '2026-09-08T10:00:30.000Z';
      assert.equal(result.soldAt.toISOString(), expected);
      assert.equal(row.soldAt.toISOString(), expected);
      assert.equal(row.soldAtEstimated, false);
      assert.equal(row.status, 'sold');
      assert.equal(row.billz.reservationApplied, false);
      assert.equal(row.billz.pendingApplied, false);
      assert.equal(row.billz.operationToken, '');
      assert.equal(row.holdExpiresAt, null);
      assert.equal(mirror.reservedQty, 0);
      assert.equal(mirror.pendingQty, 0);
      if (channel === 'uzum') {
        assert.equal(mirror.uzumSoldHolds.length, 1);
        assert.equal(mirror.uzumSoldHolds[0].soldAt.toISOString(), '2026-09-08T10:00:10.000Z');
        assert.equal(mirror.uzumSoldHolds[0].quantity, 1);
      } else {
        assert.deepEqual(mirror.uzumSoldHolds, []);
      }
    });
  }
}

test('actual core retry-safe cancellation failure leaves reservation held until successful cleanup', async () => {
  await seed('cancel');
  sale.releaseReservation = async () => { throw Object.assign(new Error('refused'), { retrySafe: true, outcomeUnknown: false }); };
  sale.deleteDraft = async () => ({});
  await assert.rejects(core.cancelOrder('cancel'));
  assert.equal((await Order.findOne({ internalOrderId: 'cancel' }).lean()).status, 'failed');
  assert.equal((await Mirror.findOne({ billzProductId: 'cancel' }).lean()).reservedQty, 1);
  sale.releaseReservation = async () => ({});
  await core.cancelOrder('cancel');
  assert.equal((await Order.findOne({ internalOrderId: 'cancel' }).lean()).status, 'cancelled');
  assert.equal((await Mirror.findOne({ billzProductId: 'cancel' }).lean()).reservedQty, 0);
});
test('actual core partial marker transfer remains fenced and never retries payment', async () => {
  await seed('partial');
  await Mirror.updateOne({ billzProductId: 'partial' }, { $set: { stock: 4, reservedQty: 2 } });
  await Order.updateOne({ internalOrderId: 'partial' }, { $push: { items: { billzProductId: 'missing', quantity: 1, unitPrice: 100 } } });
  let payments = 0; sale.completeSale = async () => { payments += 1; };
  await assert.rejects(core.completeOrder('partial'));
  const row = await Order.findOne({ internalOrderId: 'partial' }).lean();
  assert.equal(row.billz.reconciliationRequired, true); assert.ok(row.billz.operationToken);
  assert.equal(row.billz.reservationApplied, true, 'partial transfer cannot finalize the entire order');
  const partial = await Mirror.findOne({ billzProductId: 'partial' }).lean();
  assert.equal(partial.uzumSoldHolds.length, 1);
  await assertStock('partial', 1, 1, 2);
  await snapshot('partial', 3, new Date(partial.uzumSoldHolds[0].soldAt.getTime() + 1));
  await stock.cleanupSoldHolds(Mirror, Order);
  await assertStock('partial', 1, 0, 2);
  assert.equal((await Mirror.findOne({ billzProductId: 'partial' })).uzumSoldHolds.length, 1);
  await assert.rejects(core.completeOrder('partial')); assert.equal(payments, 1);
});
test('mongoose executes snapshot pipeline with upsert defaults and monotonic deletion tombstone', async () => {
  const { snapshotUpdate, transferSoldHold } = require('../src/uzum/stock');
  const at = new Date('2026-09-08T10:00:00Z');
  await Mirror.bulkWrite([{ updateOne: { filter: { billzProductId: 'pipeline' }, update: snapshotUpdate({ name: '$literal-name', stock: 3, deletedInBillz: false }, at, at), upsert: true } }]);
  let row = await Mirror.findOne({ billzProductId: 'pipeline' }).lean();
  assert.equal(row.name, '$literal-name'); assert.equal(row.reservedQty, 0); assert.equal(row.pendingQty, 0); assert.deepEqual(row.uzumSoldHolds, []);
  await Mirror.updateOne({ billzProductId: 'pipeline' }, { $set: { reservedQty: 1 } });
  const order = await Order.create({ channel: 'uzum', externalId: 'pipeline-sale', internalOrderId: 'pipeline-sale', status: 'reserved',
    items: [{ billzProductId: 'pipeline', quantity: 1, unitPrice: 100 }],
    billz: { reservationApplied: true, operationAction: 'complete', operationToken: 'owner' } });
  await transferSoldHold(order, at, Mirror, Order);
  const later = new Date(at.getTime() + 10);
  await Mirror.updateMany({ billzProductId: 'pipeline' }, snapshotUpdate({ deletedInBillz: true }, later, later));
  await Mirror.updateOne({ billzProductId: 'pipeline' }, snapshotUpdate({ stock: 3, deletedInBillz: false }, at, later));
  row = await Mirror.findOne({ billzProductId: 'pipeline' }).lean();
  assert.equal(row.deletedInBillz, true); assert.equal(stock.soldHoldQuantity(row), 0);
  assert.equal(row.uzumSoldHolds.length, 1, 'unfinished settlement retains its replay guard');
});

async function snapshot(id, quantity, at) {
  await Mirror.updateOne({ billzProductId: id }, stock.snapshotUpdate({ stock: quantity }, at, at));
}
async function assertStock(id, reserved, sold, available) {
  const row = await Mirror.findOne({ billzProductId: id });
  assert.equal(row.reservedQty, reserved, `${id}: reservations`);
  assert.equal(stock.soldHoldQuantity(row), sold, `${id}: sold protection`);
  assert.equal(row.availableStock(), available, `${id}: availability`);
  return row;
}
function ownershipLost(err) { return err.code === 'BILLZ_OPERATION_OWNERSHIP_LOST'; }
async function ownedOrder(id) {
  await seed(id);
  return Order.findOneAndUpdate({ internalOrderId: id }, { $set: {
    'billz.operationAction': 'complete', 'billz.operationToken': `owner-${id}`,
  } }, { new: true });
}

test('fresh snapshot before first transfer releases the paid reservation exactly once', async (t) => {
  await seed('fresh-first');
  let payments = 0;
  t.mock.method(sale, 'completeSale', async () => { payments += 1; });
  const transfer = stock.transferSoldHold;
  t.mock.method(stock, 'transferSoldHold', async (order, soldAt) => {
    await snapshot('fresh-first', 1, new Date(soldAt.getTime() + 1));
    return transfer(order, soldAt);
  });
  const result = await core.completeOrder('fresh-first');
  assert.equal(result.status, 'sold');
  assert.equal(result.billz.reservationApplied, false);
  await assertStock('fresh-first', 0, 0, 1);
  await core.completeOrder('fresh-first');
  assert.equal(payments, 1);
});

test('snapshot between transfer and finalization keeps a replay guard and other reservations', async (t) => {
  await seed('between');
  await Mirror.updateOne({ billzProductId: 'between' }, { $set: { stock: 4, reservedQty: 2 } });
  t.mock.method(sale, 'completeSale', async () => {});
  const transfer = stock.transferSoldHold;
  t.mock.method(stock, 'transferSoldHold', async (order, soldAt) => {
    await transfer(order, soldAt);
    await assertStock('between', 1, 1, 2);
    await snapshot('between', 3, new Date(soldAt.getTime() + 1));
    const row = await assertStock('between', 1, 0, 2);
    assert.equal(row.uzumSoldHolds.length, 1);
    await assert.rejects(transfer(order, soldAt), ownershipLost);
    await stock.cleanupSoldHolds(Mirror, Order);
    assert.equal((await Mirror.findOne({ billzProductId: 'between' })).uzumSoldHolds.length, 1);
  });
  await core.completeOrder('between');
  await assertStock('between', 1, 0, 2);
  await stock.cleanupSoldHolds(Mirror, Order);
  assert.equal((await Mirror.findOne({ billzProductId: 'between' })).uzumSoldHolds.length, 0);
});

test('stale snapshot preserves sold protection until a strictly newer snapshot', async (t) => {
  await seed('stale');
  t.mock.method(sale, 'completeSale', async () => {});
  const result = await core.completeOrder('stale');
  await snapshot('stale', 2, result.soldAt);
  await assertStock('stale', 0, 1, 1);
  await stock.cleanupSoldHolds(Mirror, Order);
  assert.equal((await Mirror.findOne({ billzProductId: 'stale' })).uzumSoldHolds.length, 1);
  const later = new Date(result.soldAt.getTime() + 1);
  await snapshot('stale', 1, later);
  await snapshot('stale', 2, result.soldAt);
  await stock.cleanupSoldHolds(Mirror, Order);
  const row = await assertStock('stale', 0, 0, 1);
  assert.equal(row.uzumSoldHolds.length, 0);
});

test('persisted ownership rejects stale callers and uses stored quantities', async () => {
  const owner = await ownedOrder('ownership');
  const stale = owner.toObject();
  stale.items[0].quantity = 20;
  await Mirror.updateOne({ billzProductId: 'ownership' }, { $set: { stock: 4, reservedQty: 2 } });
  const soldAt = new Date();
  await stock.transferSoldHold(stale, soldAt, Mirror, Order);
  await assertStock('ownership', 1, 1, 2);
  await assert.rejects(stock.transferSoldHold(stale, soldAt, Mirror, Order), ownershipLost);
  await Order.updateOne({ _id: owner._id }, { $set: {
    status: 'sold', 'billz.reservationApplied': false, 'billz.operationToken': '', 'billz.operationAction': '',
  } });
  await snapshot('ownership', 3, new Date(soldAt.getTime() + 1));
  await stock.cleanupSoldHolds(Mirror, Order);
  await assert.rejects(stock.transferSoldHold(stale, new Date(soldAt.getTime() + 100), Mirror, Order), ownershipLost);
  const row = await assertStock('ownership', 1, 0, 2);
  assert.equal(row.uzumSoldHolds.length, 0);
});

test('a delayed duplicate cannot enter settlement after finalization and marker cleanup', { timeout: 5000 }, async (t) => {
  const owner = await ownedOrder('delayed');
  await Mirror.updateOne({ billzProductId: 'delayed' }, { $set: { stock: 4, reservedQty: 2 } });
  const soldAt = new Date();
  let resume;
  let entered;
  const gate = new Promise((resolve) => { resume = resolve; });
  const waiting = new Promise((resolve) => { entered = resolve; });
  const update = Order.findOneAndUpdate;
  let delay = true;
  t.mock.method(Order, 'findOneAndUpdate', async function (...args) {
    if (delay) { delay = false; entered(); await gate; }
    return update.apply(this, args);
  });
  // Observe rejection immediately so a failure cannot become unhandled.
  const delayed = assert.rejects(stock.transferSoldHold(owner, soldAt, Mirror, Order), ownershipLost);
  try {
    await waiting;
    await stock.transferSoldHold(owner, soldAt, Mirror, Order);
    await Order.updateOne({ _id: owner._id }, { $set: {
      status: 'sold', 'billz.reservationApplied': false, 'billz.operationToken': '', 'billz.operationAction': '',
    } });
    await snapshot('delayed', 3, new Date(soldAt.getTime() + 1));
    await stock.cleanupSoldHolds(Mirror, Order);
  } finally { resume(); }
  await delayed;
  await assertStock('delayed', 1, 0, 2);
});

for (const outcome of ['refused', 'uncertain']) {
  test(`payment ${outcome} keeps the reservation through a new snapshot`, async (t) => {
    await seed(outcome);
    let payments = 0;
    t.mock.method(sale, 'completeSale', async () => {
      payments += 1;
      await snapshot(outcome, 2, new Date());
      await assertStock(outcome, 1, 0, 1);
      throw Object.assign(new Error(outcome), { retrySafe: outcome === 'refused', outcomeUnknown: outcome === 'uncertain' });
    });
    await assert.rejects(core.completeOrder(outcome), new RegExp(outcome));
    const order = await Order.findOne({ internalOrderId: outcome });
    assert.equal(order.status, outcome === 'refused' ? 'reserved' : 'failed');
    assert.equal(order.billz.reconciliationRequired, outcome === 'uncertain');
    assert.equal(order.billz.reservationApplied, true);
    const row = await assertStock(outcome, 1, 0, 1);
    assert.equal(row.uzumSoldHolds.length, 0);
    if (outcome === 'uncertain') {
      await assert.rejects(core.completeOrder(outcome), (err) => err.code === 'BILLZ_RECONCILIATION_REQUIRED');
    }
    assert.equal(payments, 1);
  });
}

test('lost persisted operation ownership blocks transfer before any counter update', async () => {
  const owner = await ownedOrder('fenced');
  await Order.updateOne({ _id: owner._id }, { $set: { 'billz.reconciliationRequired': true } });
  await assert.rejects(stock.transferSoldHold(owner, new Date(), Mirror, Order), ownershipLost);
  const row = await assertStock('fenced', 1, 0, 1);
  assert.equal(row.uzumSoldHolds.length, 0);
});

test('ownership lost between products preserves the untouched reservation', async (t) => {
  const owner = await ownedOrder('first');
  await Mirror.create({ billzProductId: 'second', stock: 4, reservedQty: 2 });
  await Order.updateOne({ _id: owner._id }, { $push: { items: { billzProductId: 'second', quantity: 1, unitPrice: 100 } } });
  const update = Mirror.updateOne;
  t.mock.method(Mirror, 'updateOne', async function (...args) {
    const result = await update.apply(this, args);
    await Order.updateOne({ _id: owner._id }, { $set: { 'billz.reconciliationRequired': true } });
    return result;
  });
  await assert.rejects(stock.transferSoldHold(owner, new Date(), Mirror, Order), ownershipLost);
  await assertStock('first', 0, 1, 1);
  const second = await assertStock('second', 2, 0, 2);
  assert.equal(second.uzumSoldHolds.length, 0);
});

test('missing first mirror fails closed after payment without clearing reservation or retrying payment', async (t) => {
  await seed('missing-first');
  await Mirror.deleteOne({ billzProductId: 'missing-first' });
  let payments = 0;
  t.mock.method(sale, 'completeSale', async () => { payments += 1; });
  await assert.rejects(core.completeOrder('missing-first'), /uzum_stock_mirror_missing/);
  const order = await Order.findOne({ internalOrderId: 'missing-first' });
  assert.equal(order.status, 'failed');
  assert.equal(order.billz.reservationApplied, true);
  assert.equal(order.billz.reconciliationRequired, true);
  await assert.rejects(core.completeOrder('missing-first'), (err) => err.code === 'BILLZ_RECONCILIATION_REQUIRED');
  assert.equal(payments, 1);
});

test('cleanup requires each persisted finalization gate and preserves other orders on the product', async () => {
  const at = new Date();
  for (const [id, fields] of [
    ['eligible', {}],
    ['still-reserved', { billz: { reservationApplied: true, operationToken: '' } }],
    ['not-sold', { status: 'reserved' }],
    ['owned', { billz: { reservationApplied: false, operationToken: 'active-owner' } }],
    ['uncertain', { billz: { reservationApplied: false, operationToken: '', reconciliationRequired: true } }],
    ['other-channel', { channel: 'medicalka' }],
  ]) {
    await Order.create({ channel: 'uzum', status: 'sold', internalOrderId: id, externalId: id,
      items: [{ billzProductId: 'shared', quantity: 1, unitPrice: 100 }],
      billz: { reservationApplied: false, operationToken: '' }, ...fields });
  }
  await Mirror.create({ billzProductId: 'shared', stock: 4, reservedQty: 1, uzumSoldHolds:
    ['eligible', 'still-reserved', 'not-sold', 'owned', 'uncertain', 'other-channel', 'missing-order']
      .map((orderId) => ({ orderId, quantity: 0, soldAt: at })) });
  await stock.cleanupSoldHolds(Mirror, Order);
  const row = await assertStock('shared', 1, 0, 3);
  assert.deepEqual(row.uzumSoldHolds.map((hold) => hold.orderId),
    ['still-reserved', 'not-sold', 'owned', 'uncertain', 'other-channel', 'missing-order']);
});

test('catalogue retries interrupted cleanup only for durably sold unreserved orders', async (t) => {
  await seed('cleanup');
  await seed('unfinished');
  let payments = 0;
  t.mock.method(sale, 'completeSale', async () => { payments += 1; });
  const sold = await core.completeOrder('cleanup');
  // Simulate a crash before durable order finalization for another paid order.
  const unfinished = await Order.findOneAndUpdate({ internalOrderId: 'unfinished' }, { $set: {
    'billz.operationAction': 'complete', 'billz.operationToken': 'unfinished-owner',
  } }, { new: true });
  await stock.transferSoldHold(unfinished, sold.soldAt, Mirror, Order);
  const covered = new Date(sold.soldAt.getTime() + 1);
  await snapshot('cleanup', 1, covered);
  await snapshot('unfinished', 1, covered);
  // A different order reserves the remaining unit before the cleanup retry.
  await Mirror.updateOne({ billzProductId: 'cleanup' }, { $inc: { reservedQty: 1 } });
  const update = Mirror.updateOne;
  let crash = true;
  t.mock.method(Mirror, 'updateOne', async function (filter, mutation, ...args) {
    if (mutation.$pull && crash) { crash = false; throw new Error('cleanup interrupted'); }
    return update.call(this, filter, mutation, ...args);
  });
  const billz = require('../src/billz/client');
  t.mock.method(billz, 'listProducts', async () => ({ total: 0, products: [] }));
  const { runCatalogSync } = require('../src/sync/catalog');
  const failed = await runCatalogSync({ force: true });
  assert.equal(failed.ok, false);
  assert.equal(failed.error, 'cleanup interrupted');
  const retried = await runCatalogSync({ force: true });
  assert.equal(retried.ok, true, retried.error);
  assert.equal((await Mirror.findOne({ billzProductId: 'cleanup' })).uzumSoldHolds.length, 0);
  assert.equal((await Mirror.findOne({ billzProductId: 'unfinished' })).uzumSoldHolds.length, 1);
  await assertStock('cleanup', 1, 0, 0);
  await assertStock('unfinished', 0, 0, 1);
  await core.completeOrder('cleanup');
  assert.equal(payments, 1);
});
