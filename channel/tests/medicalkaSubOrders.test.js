const assert = require('node:assert/strict');
const test = require('node:test');

process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'shop-a';
process.env.MONGO_DB_NAME = 'medicalka-suborders-test';

let mongod;
let db;
let MedicalkaSubOrder;
let ChannelOrder;
let createSubOrderService;
let normalizeSubOrder;

const paid = (over = {}) => ({
  id: 'sub-a', order_id: 'order-a', order_number: 'ORD-1',
  sub_order_number: 'ORD-1-1', pharmacy_id: 'pharmacy-a',
  pharmacy_name: 'FAIRHAVEN HEALTH', customer_first_name: 'Ali',
  customer_last_name: 'Valiyev', customer_phone: '+998901234567',
  payment_status: 'paid', payment_method: 'click', subtotal: '30000.00',
  status: 'processing', delivery_type: 'pickup',
  delivery_provider: 'noor', courier_status: 'searching',
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
  ChannelOrder = require('../src/models/ChannelOrder');
  ({ createSubOrderService, normalizeSubOrder } = require('../src/medicalka/subOrders'));
});

test.beforeEach(async () => {
  await Promise.all([
    MedicalkaSubOrder().deleteMany({}),
    ChannelOrder().deleteMany({ channel: 'medicalka' }),
  ]);
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
    deliveryProvider: row.deliveryProvider,
    courierStatus: row.courierStatus,
    subtotal: row.subtotal,
    productExternalId: row.items[0].productExternalId,
  }, {
    externalId: 'sub-a', orderId: 'order-a', paymentStatus: 'paid',
    status: 'processing', deliveryType: 'pickup', deliveryProvider: 'noor',
    courierStatus: 'searching', subtotal: 30000,
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
    environment: 'production', processingMode: 'live', billzWriteEnabled: () => true,
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

test('observe mode stores paid lifecycle without mapping or Billz calls', async () => {
  let writes = 0;
  const service = createSubOrderService({
    client: {}, ProductModel: products([]),
    orderService: {
      acceptOrder: async () => { writes += 1; },
      completeIncomingSale: async () => { writes += 1; },
    },
    environment: 'production', processingMode: 'observe', billzWriteEnabled: () => true,
  });

  await service.ingest(paid());

  const stored = await MedicalkaSubOrder().findOne({ externalId: 'sub-a' }).lean();
  assert.equal(writes, 0);
  assert.equal(stored.mapping.state, 'not_evaluated');
  assert.equal(stored.sale.state, 'observed');
  assert.equal(stored.sale.reconciliationRequired, false);
});

test('staging and global Billz gate both block a live-mode sale', async () => {
  for (const options of [
    { environment: 'staging', processingMode: 'live', billzWriteEnabled: () => true },
    { environment: 'production', processingMode: 'live', billzWriteEnabled: () => false },
  ]) {
    await MedicalkaSubOrder().deleteMany({});
    let writes = 0;
    const service = createSubOrderService({
      client: {}, ProductModel: products(),
      orderService: {
        acceptOrder: async () => { writes += 1; },
        completeIncomingSale: async () => { writes += 1; },
      },
      ...options,
    });
    await service.ingest(paid());
    assert.equal(writes, 0);
    assert.equal(
      (await MedicalkaSubOrder().findOne({ externalId: 'sub-a' }).lean()).sale.state,
      'observed'
    );
  }
});

test('detail payment state wins when list row disagrees', async () => {
  const service = createSubOrderService({
    client: {
      getSubOrder: async () => paid({ status: 'cancelled', payment_status: 'paid' }),
    },
    ProductModel: products(), orderService: {},
    environment: 'production', processingMode: 'observe', billzWriteEnabled: () => false,
  });

  await service.ingest(paid({ status: 'cancelled', payment_status: 'cancelled' }));

  const stored = await MedicalkaSubOrder().findOne({ externalId: 'sub-a' }).lean();
  assert.equal(stored.paymentStatus, 'paid');
  assert.equal(stored.status, 'cancelled');
  assert.equal(stored.sale.state, 'observed');
});

test('unknown external product blocks sale and exposes reconciliation', async () => {
  let writes = 0;
  const service = createSubOrderService({
    client: {}, ProductModel: products([]),
    orderService: {
      acceptOrder: async () => { writes += 1; },
      completeIncomingSale: async () => { writes += 1; },
    }, environment: 'production', processingMode: 'live', billzWriteEnabled: () => true,
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

test('delivery status belongs to courier while pickup completion stays available', async () => {
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
    (err) => err.code === 'medicalka_delivery_status_managed_by_courier'
  );
  await assert.rejects(
    () => service.transition('sub-a', 'shipped'),
    (err) => err.code === 'medicalka_delivery_status_managed_by_courier'
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

  assert.deepEqual(receivedStatuses, [
    'pending', 'waiting_payment', 'processing', 'shipped', 'delivered',
    'cancelled', 'rejected', 'refunded', 'failed', 'returned', 'completed',
  ]);
  const stored = await MedicalkaSubOrder().findOne({ externalId: 'sub-a' }).lean();
  assert.equal(stored.items[0].markingRequired, true);
  await assert.rejects(
    () => service.transition('sub-a', 'shipped'),
    (err) => err.code === 'medicalka_delivery_status_managed_by_courier'
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

test('late refund of a locally delivered sale is discovered from status polling', async () => {
  await MedicalkaSubOrder().create({
    ...normalizeSubOrder(paid({ status: 'delivered' }), new Date()),
    sale: { state: 'sold', channelOrderId: 'internal-a' },
  });
  const returned = paid({ status: 'returned' });
  const seenStatuses = [];
  const service = createSubOrderService({
    client: {
      getPharmacies: async () => [{ id: 'pharmacy-a' }],
      listSubOrders: async ({ status }) => {
        seenStatuses.push(status);
        return {
          items: status === 'returned' ? [{ id: 'sub-a', status: 'returned' }] : [],
          total: status === 'returned' ? 1 : 0,
        };
      },
      getSubOrder: async () => returned,
    },
    ProductModel: products(), orderService: {},
  });

  await service.pollOnce();

  const stored = await MedicalkaSubOrder().findOne({ externalId: 'sub-a' }).lean();
  assert.ok(seenStatuses.includes('returned'));
  assert.equal(stored.status, 'returned');
  assert.equal(stored.sale.reconciliationRequired, true);
});

test('terminal history uses a bounded cadence instead of every active poll', async () => {
  const statuses = [];
  const fixed = new Date('2026-08-22T05:00:00.000Z');
  const service = createSubOrderService({
    client: {
      getPharmacies: async () => [{ id: 'pharmacy-a' }],
      listSubOrders: async (query) => {
        statuses.push(query);
        return { items: [], total: 0 };
      },
    },
    ProductModel: products(), orderService: {}, now: () => fixed,
    historyPollMs: 300000, historyWindowDays: 180,
  });

  await service.pollOnce();
  const firstCount = statuses.length;
  await service.pollOnce();
  const second = statuses.slice(firstCount);

  assert.equal(firstCount, 11);
  assert.deepEqual(second.map((row) => row.status), [
    'pending', 'waiting_payment', 'processing', 'shipped',
  ]);
  assert.ok(statuses
    .filter((row) => !['pending', 'waiting_payment', 'processing', 'shipped'].includes(row.status))
    .every((row) => row.date_from === '2026-02-23'));
});

test('authoritative sold ChannelOrder recovers projection before late refund', async () => {
  await MedicalkaSubOrder().create({
    ...normalizeSubOrder(paid({ status: 'delivered' }), new Date()),
    sale: { state: 'processing', channelOrderId: '' },
  });
  await ChannelOrder().create({
    channel: 'medicalka', externalId: 'sub-a', internalOrderId: 'internal-a',
    items: [{ billzProductId: 'billz-a', name: 'OvaBoost', quantity: 2, unitPrice: 15000 }],
    totalAmount: 30000, status: 'sold', soldAt: new Date(),
  });
  const service = createSubOrderService({
    client: {}, ProductModel: products(), orderService: {},
  });

  await service.ingest(paid({ status: 'returned' }));

  const stored = await MedicalkaSubOrder().findOne({ externalId: 'sub-a' }).lean();
  assert.equal(stored.sale.channelOrderId, 'internal-a');
  assert.equal(stored.sale.state, 'sold');
  assert.equal(stored.sale.reconciliationRequired, true);
  assert.equal(stored.sale.lastError, 'medicalka_billz_refund_required');
});

test('terminal polling repairs a stale sale projection from authoritative ChannelOrder', async () => {
  await MedicalkaSubOrder().create({
    ...normalizeSubOrder(paid({ status: 'returned' }), new Date()),
    sale: { state: 'processing', channelOrderId: 'internal-a' },
  });
  await ChannelOrder().create({
    channel: 'medicalka', externalId: 'sub-a', internalOrderId: 'internal-a',
    items: [{ billzProductId: 'billz-a', name: 'OvaBoost', quantity: 2, unitPrice: 15000 }],
    totalAmount: 30000, status: 'sold', soldAt: new Date(),
  });
  const service = createSubOrderService({
    client: {
      getPharmacies: async () => [{ id: 'pharmacy-a' }],
      listSubOrders: async ({ status }) => ({
        items: status === 'returned' ? [{ id: 'sub-a', status: 'returned' }] : [],
        total: status === 'returned' ? 1 : 0,
      }),
    },
    ProductModel: products(), orderService: {},
  });

  await service.pollOnce();

  const stored = await MedicalkaSubOrder().findOne({ externalId: 'sub-a' }).lean();
  assert.equal(stored.sale.channelOrderId, 'internal-a');
  assert.equal(stored.sale.state, 'sold');
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

test('remote label success followed by local commit failure is fenced from retry', async () => {
  const label = '0104780012960092217Jh';
  const remote = paid({
    delivery_type: 'delivery',
    items: [{
      id: 'line-a', product_external_id: 501, quantity: 1,
      is_marking_required: true, labels: [],
    }],
  });
  await MedicalkaSubOrder().create(normalizeSubOrder(remote, new Date()));
  let writes = 0;
  let failCommit = true;
  const Model = MedicalkaSubOrder();
  const original = Model.findOneAndUpdate.bind(Model);
  Model.findOneAndUpdate = (...args) => {
    const [filter, update] = args;
    if (failCommit && filter?.['operation.token'] && update?.$set?.['lastAction.kind']) {
      failCommit = false;
      throw new Error('local commit failed');
    }
    return original(...args);
  };
  const service = createSubOrderService({
    client: {
      getSubOrder: async () => remote,
      addFiscalLabel: async () => { writes += 1; return {}; },
    },
    ProductModel: products(), orderService: {},
  });

  try {
    await assert.rejects(
      () => service.addLabel('sub-a', { itemId: 'line-a', label }),
      (err) => err.code === 'medicalka_suborder_reconciliation_required'
    );
    await assert.rejects(
      () => service.addLabel('sub-a', { itemId: 'line-a', label }),
      (err) => err.code === 'medicalka_suborder_reconciliation_required'
    );
    assert.equal(writes, 1);
  } finally {
    Model.findOneAndUpdate = original;
  }
});
