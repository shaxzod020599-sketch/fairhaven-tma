const assert = require('node:assert/strict');
const test = require('node:test');

process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'shop-a';
process.env.MONGO_DB_NAME = 'medicalka-holds-test';

let mongod;
let db;
let Approval;
let SubOrder;
let ChannelOrder;
let BillzProduct;
let orders;
let createHoldService;
let createProductLinks;
let createSubOrderService;

const HOUR = 60 * 60 * 1000;
let clock;
const now = () => new Date(clock);

const approval = (over = {}) => ({
  externalId: 'appr-1', checkoutId: 'chk-1', pharmacyId: 'ph-1', status: 'accepted',
  checkoutStatus: 'pending', checkoutActive: true, orderId: '',
  sourceCreatedAt: now(), firstSeenAt: now(), lastSeenAt: now(), subtotal: 50000,
  customer: { firstName: 'Ali', lastName: 'Valiyev', phone: '+998901234567' },
  items: [{ productId: 'mk-1', stockId: 'st-1', name: 'OvaBoost', externalName: 'OVABOOST (120)', quantity: 2, unitPrice: 25000, lineTotal: 50000 }],
  ...over,
});

const paid = (over = {}) => ({
  id: 'sub-1', order_id: 'order-1', pharmacy_id: 'ph-1', payment_status: 'paid', status: 'processing',
  subtotal: '50000.00', created_at: '2026-10-08T10:00:00.000Z', delivery_type: 'pickup',
  items: [{ stock_id: 'st-1', product: { id: 'mk-1', name: 'OvaBoost' }, quantity: 2, unit_price: '25000.00', line_total: '50000.00' }],
  ...over,
});

// Billz itself is faked: reservations, releases and sales only move the order's status.
function fakeBillz() {
  const calls = [];
  const move = (internalOrderId, from, to) => ChannelOrder().findOneAndUpdate(
    { internalOrderId, status: { $in: from } }, { $set: { status: to } }, { new: true }
  ).lean();
  return {
    calls,
    acceptOrder: (...args) => orders.acceptOrder(...args),
    reserveOrder: async (id) => { calls.push(['reserve', id]); return move(id, ['received', 'failed'], 'reserved'); },
    cancelOrder: async (id) => { calls.push(['cancel', id]); return move(id, ['received', 'reserved', 'failed'], 'cancelled'); },
    completeIncomingSale: async (id) => {
      calls.push(['sell', id]);
      const order = await ChannelOrder().findOne({ internalOrderId: id }).lean();
      if (order.status === 'received') calls.push(['reserve', id]);
      await move(id, ['received', 'reserved'], 'sold');
      return { kind: 'sold' };
    },
  };
}

const links = (missing = []) => ({
  resolve: async (items) => (items.some((item) => missing.includes(item.productId))
    ? { items: [], missing }
    : { items: items.map((item) => ({ billzProductId: `b-${item.productId}`, name: item.name, quantity: item.quantity, unitPrice: item.unitPrice })), missing: [] }),
});

function setup({ billz = fakeBillz(), live = true, missing = [] } = {}) {
  const holds = createHoldService({
    ApprovalModel: Approval(), SubOrderModel: SubOrder(), links: links(missing), orderService: billz,
    placingEnabled: () => live, writesEnabled: () => true, ttlMs: 2 * HOUR, now,
  });
  const products = { find: () => ({ lean: async () => [{ billzProductId: 'b-mk-1', name: 'OvaBoost', medicalkaSourceIds: ['mk-1'] }] }) };
  const subOrders = createSubOrderService({
    client: {}, ProductModel: products, orderService: billz, holds, now,
    environment: 'production', processingMode: 'live', billzWriteEnabled: () => true,
  });
  return { billz, holds, subOrders };
}

const hold = async () => (await Approval().findOne({ externalId: 'appr-1' }).lean()).hold;
const medicalkaOrders = () => ChannelOrder().find({ channel: 'medicalka' }).lean();

test.before(async () => {
  const { MongoMemoryServer } = require('../../backend/node_modules/mongodb-memory-server');
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  db = require('../src/db');
  await db.connect();
  Approval = require('../src/models/MedicalkaApproval');
  SubOrder = require('../src/models/MedicalkaSubOrder');
  ChannelOrder = require('../src/models/ChannelOrder');
  BillzProduct = require('../src/models/BillzProduct');
  orders = require('../src/core/orders');
  ({ createHoldService } = require('../src/medicalka/holds'));
  ({ createProductLinks } = require('../src/medicalka/productLinks'));
  ({ createSubOrderService } = require('../src/medicalka/subOrders'));
});

test.beforeEach(async () => {
  clock = Date.parse('2026-10-08T10:00:00.000Z');
  await Promise.all([
    Approval().deleteMany({}), SubOrder().deleteMany({}), ChannelOrder().deleteMany({}),
    BillzProduct().deleteMany({}), db.getConnection().collection('products').deleteMany({}),
  ]);
});

test.after(async () => {
  await db?.disconnect();
  await mongod?.stop();
});

test('accepting reserves the approval in Billz once, and the paid order sells that same reservation', async () => {
  const { billz, holds, subOrders } = setup();
  await Approval().create(approval());

  await holds.sweepOnce();
  await holds.sweepOnce();
  const reserved = await hold();
  assert.equal(reserved.state, 'reserved');
  const [order] = await medicalkaOrders();
  assert.equal(order.externalId, 'approval:appr-1');
  assert.deepEqual(order.items.map((item) => [item.billzProductId, item.quantity]), [['b-mk-1', 2]]);
  assert.deepEqual(billz.calls, [['reserve', order.internalOrderId]]);

  // The approval sync links the approval to Medicalka's order once paid.
  await Approval().updateOne({ externalId: 'appr-1' }, { $set: { orderId: 'order-1' } });
  clock += 10 * 60 * 1000;
  await subOrders.ingest(paid());
  await subOrders.ingest(paid());

  const all = await medicalkaOrders();
  assert.equal(all.length, 1, 'no second order for the paid sub-order');
  assert.equal(all[0].externalId, 'order-1');
  assert.equal(all[0].status, 'sold');
  assert.deepEqual(billz.calls, [['reserve', order.internalOrderId], ['sell', order.internalOrderId]]);
  const stored = await SubOrder().findOne({ externalId: 'sub-1' }).lean();
  assert.equal(stored.sale.state, 'sold');
  assert.equal(stored.sale.channelOrderId, order.internalOrderId);
  await holds.sweepOnce();
  assert.equal((await hold()).state, 'sold');
});

test('a checkout closed unpaid or left unpaid past the limit gives the stock back', async () => {
  const { billz, holds } = setup();
  await Approval().create(approval());
  await Approval().create(approval({ externalId: 'appr-2', checkoutId: 'chk-2' }));
  await holds.sweepOnce();
  const [first, second] = await Promise.all(['appr-1', 'appr-2'].map((id) => ChannelOrder().findOne({ externalId: `approval:${id}` }).lean()));

  await Approval().updateOne({ externalId: 'appr-1' }, { $set: { status: 'cancelled', checkoutStatus: 'cancelled' } });
  await holds.sweepOnce();
  assert.equal((await hold()).state, 'released');
  assert.deepEqual(billz.calls.filter(([kind]) => kind === 'cancel'), [['cancel', first.internalOrderId]]);

  clock += HOUR;
  await holds.sweepOnce();
  assert.equal((await Approval().findOne({ externalId: 'appr-2' }).lean()).hold.state, 'reserved');
  clock += HOUR;
  await holds.sweepOnce();
  assert.equal((await Approval().findOne({ externalId: 'appr-2' }).lean()).hold.state, 'released');
  assert.equal((await ChannelOrder().findOne({ internalOrderId: second.internalOrderId }).lean()).status, 'cancelled');
});

test('a payment seen before its approval is linked waits briefly instead of selling twice', async () => {
  const { billz, holds, subOrders } = setup();
  await Approval().create(approval());
  await holds.sweepOnce();
  const [order] = await medicalkaOrders();

  await subOrders.ingest(paid());
  assert.equal((await SubOrder().findOne({ externalId: 'sub-1' }).lean()).sale.state, 'waiting_hold');
  assert.equal((await medicalkaOrders()).length, 1);

  await Approval().updateOne({ externalId: 'appr-1' }, { $set: { orderId: 'order-1' } });
  await subOrders.ingest(paid());
  assert.equal((await SubOrder().findOne({ externalId: 'sub-1' }).lean()).sale.state, 'sold');
  assert.deepEqual(billz.calls.map(([kind]) => kind), ['reserve', 'sell']);
  assert.equal((await ChannelOrder().findOne({ internalOrderId: order.internalOrderId }).lean()).status, 'sold');
});

test('an unrelated open reservation stops delaying a payment after a few minutes, and is released if it was this one', async () => {
  const { billz, holds, subOrders } = setup();
  await Approval().create(approval());
  await holds.sweepOnce();
  const [held] = await medicalkaOrders();

  await subOrders.ingest(paid());
  clock += 4 * 60 * 1000;
  await subOrders.ingest(paid());
  const sale = await ChannelOrder().findOne({ externalId: 'order-1' }).lean();
  assert.equal(sale.status, 'sold');
  assert.notEqual(sale.internalOrderId, held.internalOrderId);

  // The late link shows the reservation belonged to the order sold apart.
  await Approval().updateOne({ externalId: 'appr-1' }, { $set: { orderId: 'order-1' } });
  await holds.sweepOnce();
  assert.equal((await hold()).state, 'released');
  assert.ok(billz.calls.some(([kind, id]) => kind === 'cancel' && id === held.internalOrderId));
});

test('a paid order that differs from the accepted one releases the reservation and sells what was paid', async () => {
  const { billz, holds, subOrders } = setup();
  await Approval().create(approval({ orderId: '' }));
  await holds.sweepOnce();
  const [held] = await medicalkaOrders();
  await Approval().updateOne({ externalId: 'appr-1' }, { $set: { orderId: 'order-1' } });

  await subOrders.ingest(paid({ items: [{ stock_id: 'st-1', product: { id: 'mk-1' }, quantity: 1, unit_price: '25000.00', line_total: '25000.00' }] }));

  assert.equal((await hold()).state, 'released');
  const sale = await ChannelOrder().findOne({ externalId: 'order-1' }).lean();
  assert.equal(sale.status, 'sold');
  assert.equal(sale.items[0].quantity, 1);
  assert.ok(billz.calls.some(([kind, id]) => kind === 'cancel' && id === held.internalOrderId));
});

test('nothing is reserved in observe mode, for unlinked products, or for old approvals', async () => {
  const observe = setup({ live: false });
  await Approval().create(approval());
  await observe.holds.sweepOnce();
  assert.equal((await medicalkaOrders()).length, 0);

  const unmapped = setup({ missing: ['mk-1'] });
  await unmapped.holds.sweepOnce();
  assert.equal((await hold()).state, 'unmapped');
  assert.deepEqual((await hold()).missingProductIds, ['mk-1']);
  assert.equal((await medicalkaOrders()).length, 0);

  await Approval().create(approval({ externalId: 'appr-old', checkoutId: 'chk-old', sourceCreatedAt: new Date(clock - 3 * HOUR) }));
  const live = setup();
  await live.holds.sweepOnce();
  assert.equal(live.billz.calls.length, 0);
});

test('a reservation Billz refused is not retried and the empty order is closed', async () => {
  const billz = fakeBillz();
  billz.reserveOrder = async (id) => {
    billz.calls.push(['reserve', id]);
    await ChannelOrder().updateOne({ internalOrderId: id }, { $set: { status: 'failed' } });
    throw Object.assign(new Error('insufficient stock'), { code: 'BILLZ_STOCK' });
  };
  const { holds } = setup({ billz });
  await Approval().create(approval());
  await holds.sweepOnce();
  await holds.sweepOnce();
  assert.equal((await hold()).state, 'failed');
  assert.equal((await hold()).lastError, 'BILLZ_STOCK');
  assert.deepEqual(billz.calls.map(([kind]) => kind), ['reserve', 'cancel']);
  assert.equal((await medicalkaOrders())[0].status, 'cancelled');
});

test('product links come from the exact published name and never from an ambiguous one', async () => {
  await BillzProduct().create([
    { billzProductId: 'b1', name: 'Fairhaven OvaBoost №120', medicalkaId: 1 },
    { billzProductId: 'b2', name: 'Same', medicalkaId: 2 },
    { billzProductId: 'b3', name: 'Same', medicalkaId: 3 },
    { billzProductId: 'b4', name: 'Not published' },
  ]);
  await db.getConnection().collection('products').insertMany([{ billzProductId: 'b1', name: 'OVABOOST (120)' }]);
  const service = createProductLinks();
  const line = (productId, externalName) => ({ productId, externalName, quantity: 1, unitPrice: 10 });

  const found = await service.resolve([line('mk-1', ' ovaboost (120) ')]);
  assert.deepEqual(found, { items: [{ billzProductId: 'b1', name: 'Fairhaven OvaBoost №120', quantity: 1, unitPrice: 10 }], missing: [] });
  assert.deepEqual((await BillzProduct().findOne({ billzProductId: 'b1' }).lean()).medicalkaSourceIds, ['mk-1']);
  // Once linked, a renamed product still resolves.
  assert.equal((await service.resolve([line('mk-1', 'renamed')])).items[0].billzProductId, 'b1');

  assert.deepEqual((await service.resolve([line('mk-2', 'Same')])).missing, ['mk-2']);
  assert.deepEqual((await service.resolve([line('mk-4', 'Not published')])).missing, ['mk-4']);
  await BillzProduct().updateOne({ billzProductId: 'b2' }, { $set: { medicalkaSourceIds: ['mk-1'] } });
  assert.deepEqual((await service.resolve([line('mk-1', 'renamed')])).missing, ['mk-1']);
});
