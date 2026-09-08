const test = require('node:test');
const assert = require('node:assert/strict');
process.env.BILLZ_SECRET_TOKEN = 'test-secret'; process.env.BILLZ_SHOP_ID = 'shop';
process.env.BILLZ_PAYMENT_TYPE_ID = 'test-payment'; process.env.CHANNEL_TELEGRAM_ENABLED = 'false';
let mongod; let db; let Order; let Mirror; let core; let sale;
test.before(async () => {
  const { MongoMemoryServer } = require('../../backend/node_modules/mongodb-memory-server');
  mongod = await MongoMemoryServer.create(); process.env.MONGO_URI = mongod.getUri();
  db = require('../src/db'); await db.connect();
  Order = require('../src/models/ChannelOrder')(); Mirror = require('../src/models/BillzProduct')();
  core = require('../src/core/orders'); sale = require('../src/billz/sale');
  await Promise.all([Order.init(), Mirror.init()]);
});
test.after(async () => { await db?.disconnect(); await mongod?.stop(); });
async function seed(id) {
  await Mirror.create({ billzProductId: id, stock: 2, reservedQty: 1 });
  await Order.create({ channel: 'uzum', externalId: id, internalOrderId: id, status: 'reserved', totalAmount: 100,
    items: [{ billzProductId: id, quantity: 1, unitPrice: 100 }], uzum: { version: 1, acceptedAt: new Date() },
    billz: { draftOrderId: `draft-${id}`, reservationApplied: true } });
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
  await Order.updateOne({ internalOrderId: 'partial' }, { $push: { items: { billzProductId: 'missing', quantity: 1, unitPrice: 100 } } });
  let payments = 0; sale.completeSale = async () => { payments += 1; };
  await assert.rejects(core.completeOrder('partial'));
  const row = await Order.findOne({ internalOrderId: 'partial' }).lean();
  assert.equal(row.billz.reconciliationRequired, true); assert.ok(row.billz.operationToken);
  assert.equal((await Mirror.findOne({ billzProductId: 'partial' }).lean()).uzumSoldHolds.length, 1);
  await assert.rejects(core.completeOrder('partial')); assert.equal(payments, 1);
});
test('mongoose executes snapshot pipeline with upsert defaults and monotonic deletion tombstone', async () => {
  const { snapshotUpdate, transferSoldHold } = require('../src/uzum/stock');
  const at = new Date('2026-09-08T10:00:00Z');
  await Mirror.bulkWrite([{ updateOne: { filter: { billzProductId: 'pipeline' }, update: snapshotUpdate({ name: '$literal-name', stock: 3, deletedInBillz: false }, at, at), upsert: true } }]);
  let row = await Mirror.findOne({ billzProductId: 'pipeline' }).lean();
  assert.equal(row.name, '$literal-name'); assert.equal(row.reservedQty, 0); assert.equal(row.pendingQty, 0); assert.deepEqual(row.uzumSoldHolds, []);
  await transferSoldHold({ internalOrderId: 'pipeline-sale', items: [{ billzProductId: 'pipeline', quantity: 1 }] }, at, Mirror);
  const later = new Date(at.getTime() + 10);
  await Mirror.updateMany({ billzProductId: 'pipeline' }, snapshotUpdate({ deletedInBillz: true }, later, later));
  await Mirror.updateOne({ billzProductId: 'pipeline' }, snapshotUpdate({ stock: 3, deletedInBillz: false }, at, later));
  row = await Mirror.findOne({ billzProductId: 'pipeline' }).lean();
  assert.equal(row.deletedInBillz, true); assert.equal(row.uzumSoldHolds.length, 0);
});
