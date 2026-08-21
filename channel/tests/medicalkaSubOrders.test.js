const assert = require('node:assert/strict');
const test = require('node:test');

process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'shop-a';
process.env.MONGO_DB_NAME = 'medicalka-suborders-test';

let mongod;
let db;
let MedicalkaSubOrder;
let createSubOrderService;
let normalizeSubOrder;

const paid = (over = {}) => ({
  id: 'sub-a', order_id: 'order-a', order_number: 'ORD-1',
  sub_order_number: 'ORD-1-1', pharmacy_id: 'pharmacy-a',
  pharmacy_name: 'FAIRHAVEN HEALTH', customer_first_name: 'Ali',
  customer_last_name: 'Valiyev', customer_phone: '+998901234567',
  payment_status: 'paid', payment_method: 'click', subtotal: '30000.00',
  status: 'processing', delivery_type: 'pickup',
  created_at: '2026-08-22T03:10:00.000Z',
  items: [{
    id: 'line-a', product_external_id: 501, product_name: 'OvaBoost',
    quantity: 2, unit_price: '15000.00', line_total: '30000.00',
    is_marking_required: false, labels: [],
  }],
  ...over,
});

function products(rows = [{ medicalkaId: 501, billzProductId: 'billz-a', name: 'OvaBoost' }]) {
  return {
    find() { return { lean: async () => rows }; },
  };
}

test.before(async () => {
  const { MongoMemoryServer } = require('../../backend/node_modules/mongodb-memory-server');
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  db = require('../src/db');
  await db.connect();
  MedicalkaSubOrder = require('../src/models/MedicalkaSubOrder');
  ({ createSubOrderService, normalizeSubOrder } = require('../src/medicalka/subOrders'));
});

test.beforeEach(async () => {
  await MedicalkaSubOrder().deleteMany({});
});

test.after(async () => {
  await db?.disconnect();
  await mongod?.stop();
});

test('normalizes documented paid sub-order without losing lifecycle fields', () => {
  const row = normalizeSubOrder(paid(), new Date('2026-08-22T03:11:00.000Z'));
  assert.deepEqual({
    externalId: row.externalId,
    orderId: row.orderId,
    paymentStatus: row.paymentStatus,
    status: row.status,
    deliveryType: row.deliveryType,
    subtotal: row.subtotal,
    productExternalId: row.items[0].productExternalId,
  }, {
    externalId: 'sub-a', orderId: 'order-a', paymentStatus: 'paid',
    status: 'processing', deliveryType: 'pickup', subtotal: 30000,
    productExternalId: 501,
  });
});

test('paid sub-order maps stable external product id and enters sale pipeline once', async () => {
  let accepts = 0;
  let completes = 0;
  const orderService = {
    acceptOrder: async (_channel, order) => {
      accepts += 1;
      assert.equal(order.items[0].billzProductId, 'billz-a');
      return { order: { internalOrderId: 'internal-a' } };
    },
    completeIncomingSale: async () => { completes += 1; return { kind: 'sold' }; },
  };
  const service = createSubOrderService({
    client: {}, ProductModel: products(), orderService,
  });

  await service.ingest(paid());
  await service.ingest(paid());

  assert.equal(accepts, 1);
  assert.equal(completes, 1);
  const stored = await MedicalkaSubOrder().findOne({ externalId: 'sub-a' }).lean();
  assert.equal(stored.mapping.state, 'ready');
  assert.equal(stored.sale.state, 'sold');
});

test('unpaid row is mirrored but cannot enter Billz', async () => {
  let writes = 0;
  const service = createSubOrderService({
    client: {}, ProductModel: products(),
    orderService: {
      acceptOrder: async () => { writes += 1; },
      completeIncomingSale: async () => { writes += 1; },
    },
  });

  await service.ingest(paid({ payment_status: 'pending' }));

  assert.equal(writes, 0);
  const stored = await MedicalkaSubOrder().findOne({ externalId: 'sub-a' }).lean();
  assert.equal(stored.sale.state, 'waiting_payment');
});

test('unknown external product blocks sale and exposes reconciliation', async () => {
  let writes = 0;
  const service = createSubOrderService({
    client: {}, ProductModel: products([]),
    orderService: {
      acceptOrder: async () => { writes += 1; },
      completeIncomingSale: async () => { writes += 1; },
    },
  });

  await service.ingest(paid());

  assert.equal(writes, 0);
  const stored = await MedicalkaSubOrder().findOne({ externalId: 'sub-a' }).lean();
  assert.equal(stored.mapping.state, 'reconciliation_required');
  assert.deepEqual(stored.mapping.missingProductIds, ['501']);
});

test('uncertain Billz result is never retried blindly on next poll', async () => {
  await MedicalkaSubOrder().create({
    ...normalizeSubOrder(paid(), new Date()),
    mapping: { state: 'ready' },
    sale: { state: 'failed', reconciliationRequired: true, lastError: 'BILLZ_OPERATION_OWNERSHIP_LOST' },
  });
  let writes = 0;
  const service = createSubOrderService({
    client: {}, ProductModel: products(),
    orderService: {
      acceptOrder: async () => { writes += 1; },
      completeIncomingSale: async () => { writes += 1; },
    },
  });

  await service.ingest(paid());

  assert.equal(writes, 0);
});

test('status actions enforce pickup and delivery rules before Medicalka write', async () => {
  const calls = [];
  const client = {
    updateSubOrderStatus: async (id, status) => { calls.push(['status', id, status]); return {}; },
    addFiscalLabel: async (id, body) => { calls.push(['label', id, body]); return {}; },
    getSubOrder: async () => paid(),
  };
  const service = createSubOrderService({ client, ProductModel: products(), orderService: {} });
  await MedicalkaSubOrder().create(normalizeSubOrder(paid({
    delivery_type: 'delivery',
    items: [{
      id: 'line-a', product_external_id: 501, quantity: 1,
      is_marking_required: true, labels: [],
    }],
  }), new Date()));

  await assert.rejects(
    () => service.transition('sub-a', 'delivered'),
    (err) => err.code === 'medicalka_delivery_delivered_forbidden'
  );
  await assert.rejects(
    () => service.transition('sub-a', 'shipped'),
    (err) => err.code === 'medicalka_labels_incomplete'
  );
  await service.addLabel('sub-a', { itemId: 'line-a', label: 'x'.repeat(21) });
  assert.equal(calls[0][0], 'label');

  await MedicalkaSubOrder().updateOne({ externalId: 'sub-a' }, {
    $set: { deliveryType: 'pickup', items: normalizeSubOrder(paid()).items },
  });
  await service.transition('sub-a', 'delivered');
  assert.deepEqual(calls.at(-1), ['status', 'sub-a', 'delivered']);
});

test('status actions cannot move a final or cancelled sub-order backwards', async () => {
  let writes = 0;
  const service = createSubOrderService({
    client: { updateSubOrderStatus: async () => { writes += 1; } },
    ProductModel: products(), orderService: {},
  });
  await MedicalkaSubOrder().create(normalizeSubOrder(paid({
    status: 'cancelled', delivery_type: 'pickup',
  }), new Date()));

  await assert.rejects(
    () => service.transition('sub-a', 'completed'),
    (err) => err.code === 'medicalka_invalid_suborder_transition'
  );
  assert.equal(writes, 0);
});

test('pharmacy cancellation records paid Billz reconciliation instead of blind reversal', async () => {
  const calls = [];
  const client = {
    cancelSubOrder: async (id, reason) => { calls.push([id, reason]); return { status: 'cancelled' }; },
  };
  const service = createSubOrderService({ client, ProductModel: products(), orderService: {} });
  const row = normalizeSubOrder(paid(), new Date());
  await MedicalkaSubOrder().create({
    ...row,
    sale: { state: 'sold', channelOrderId: 'internal-a' },
  });

  const cancelled = await service.cancel('sub-a', 'Out of stock');

  assert.deepEqual(calls, [['sub-a', 'Out of stock']]);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.sale.reconciliationRequired, true);
  assert.equal(cancelled.sale.lastError, 'medicalka_billz_refund_required');
});
