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

const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
};

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
  let remote = paid({
    delivery_type: 'delivery',
    items: [{
      id: 'line-a', product_external_id: 501, quantity: 1,
      is_marking_required: true, labels: [],
    }],
  });
  const client = {
    updateSubOrderStatus: async (id, status) => { calls.push(['status', id, status]); return {}; },
    addFiscalLabel: async (id, body) => { calls.push(['label', id, body]); return {}; },
    getSubOrder: async () => remote,
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
  remote = paid();
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

test('poll loads full detail and never trusts partial marking data from list rows', async () => {
  const receivedStatuses = [];
  const detail = paid({
    delivery_type: 'delivery',
    items: [{
      id: 'line-a', product_external_id: 501, product_name: 'OvaBoost',
      quantity: 1, unit_price: '15000.00', line_total: '15000.00',
      is_marking_required: true, labels: [],
    }],
  });
  const client = {
    getPharmacies: async () => [{ id: 'pharmacy-a' }],
    listSubOrders: async (query) => {
      receivedStatuses.push(query.status);
      return { items: query.status === 'processing' ? [paid({
        delivery_type: 'delivery',
        items: [{ id: 'line-a', product_external_id: 501, quantity: 1 }],
      })] : [], total: query.status === 'processing' ? 1 : 0 };
    },
    getSubOrder: async () => detail,
  };
  const service = createSubOrderService({
    client, ProductModel: products(),
    orderService: {
      acceptOrder: async () => ({ order: { internalOrderId: 'internal-a' } }),
      completeIncomingSale: async () => ({ kind: 'sold' }),
    },
  });

  await service.pollOnce();

  assert.deepEqual(receivedStatuses, ['processing', 'shipped']);
  const stored = await MedicalkaSubOrder().findOne({ externalId: 'sub-a' }).lean();
  assert.equal(stored.items[0].markingRequired, true);
  await assert.rejects(
    () => service.transition('sub-a', 'shipped'),
    (err) => err.code === 'medicalka_labels_incomplete'
  );
});

test('external cancellation of a sold sub-order is reconciled from polling', async () => {
  const row = normalizeSubOrder(paid(), new Date());
  await MedicalkaSubOrder().create({
    ...row, sale: { state: 'sold', channelOrderId: 'internal-a' },
  });
  const cancelled = paid({ status: 'cancelled' });
  const service = createSubOrderService({
    client: {
      getPharmacies: async () => [{ id: 'pharmacy-a' }],
      listSubOrders: async () => ({ items: [], total: 0 }),
      getSubOrder: async () => cancelled,
    },
    ProductModel: products(), orderService: {},
  });

  await service.pollOnce();

  const stored = await MedicalkaSubOrder().findOne({ externalId: 'sub-a' }).lean();
  assert.equal(stored.status, 'cancelled');
  assert.equal(stored.sale.reconciliationRequired, true);
  assert.equal(stored.sale.lastError, 'medicalka_billz_refund_required');
});

test('ambiguous fiscal label write reconciles detail and never sends twice', async () => {
  let applied = false;
  let writes = 0;
  const label = '0104780012960092217Jh';
  const remote = () => paid({
    delivery_type: 'delivery',
    items: [{
      id: 'line-a', product_external_id: 501, quantity: 1,
      is_marking_required: true, labels: applied ? [label] : [],
    }],
  });
  await MedicalkaSubOrder().create(normalizeSubOrder(remote(), new Date()));
  const ambiguous = Object.assign(new Error('lost response'), {
    code: 'medicalka_network_error', retrySafe: false,
  });
  const service = createSubOrderService({
    client: {
      getSubOrder: async () => remote(),
      addFiscalLabel: async () => { writes += 1; applied = true; throw ambiguous; },
    },
    ProductModel: products(), orderService: {},
  });

  const first = await service.addLabel('sub-a', { itemId: 'line-a', label });
  const second = await service.addLabel('sub-a', { itemId: 'line-a', label });

  assert.equal(writes, 1);
  assert.equal(first.items[0].labels.length, 1);
  assert.equal(second.items[0].labels.length, 1);
  assert.equal(second.operation.reconciliationRequired, false);
});

test('one lifecycle operation blocks a concurrent conflicting action', async () => {
  const entered = deferred();
  const release = deferred();
  const client = {
    getSubOrder: async () => paid(),
    updateSubOrderStatus: async () => {
      entered.resolve();
      await release.promise;
      return {};
    },
    cancelSubOrder: async () => ({}),
  };
  await MedicalkaSubOrder().create(normalizeSubOrder(paid(), new Date()));
  const service = createSubOrderService({ client, ProductModel: products(), orderService: {} });

  const first = service.transition('sub-a', 'delivered');
  await entered.promise;
  await assert.rejects(
    () => service.cancel('sub-a', 'Out of stock'),
    (err) => err.code === 'medicalka_suborder_action_in_progress'
  );
  release.resolve();
  await first;
});

test('unresolved ambiguous lifecycle write is fenced from a blind retry', async () => {
  let writes = 0;
  const ambiguous = Object.assign(new Error('lost response'), {
    code: 'medicalka_network_error', retrySafe: false,
  });
  const service = createSubOrderService({
    client: {
      getSubOrder: async () => paid(),
      updateSubOrderStatus: async () => { writes += 1; throw ambiguous; },
    },
    ProductModel: products(), orderService: {},
  });
  await MedicalkaSubOrder().create(normalizeSubOrder(paid(), new Date()));

  await assert.rejects(
    () => service.transition('sub-a', 'delivered'),
    (err) => err.code === 'medicalka_suborder_reconciliation_required'
  );
  await assert.rejects(
    () => service.transition('sub-a', 'delivered'),
    (err) => err.code === 'medicalka_suborder_reconciliation_required'
  );

  assert.equal(writes, 1);
  const stored = await MedicalkaSubOrder().findOne({ externalId: 'sub-a' }).lean();
  assert.equal(stored.operation.reconciliationRequired, true);
});
