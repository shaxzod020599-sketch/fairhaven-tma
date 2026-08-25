const assert = require('node:assert/strict');
const test = require('node:test');

process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'shop-a';
process.env.BILLZ_CASHBOX_ID = 'till-1';
process.env.BILLZ_PAYMENT_TYPE_ID = 'pt-transfer';
process.env.BILLZ_WRITE_ENABLED = 'true';
process.env.MONGO_DB_NAME = 'mk-orders-test';
process.env.SYNC_ON_BOOT = 'false';
process.env.CHANNEL_TELEGRAM_ENABLED = 'false';
process.env.DISABLE_RATE_LIMIT = 'true';

let mongod;
let db;
let server;
let base;
let ChannelOrder;
let BillzProduct;
let MedicalkaSubOrder;
let orders;
let sale;
let config;
let secret;
let token;
let billzCalls;
let originalReserveOrder;
let originalCompleteSale;

test.before(async () => {
  const { MongoMemoryServer } = require('../../backend/node_modules/mongodb-memory-server');
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  db = require('../src/db');
  await db.connect();

  ChannelOrder = require('../src/models/ChannelOrder');
  BillzProduct = require('../src/models/BillzProduct');
  MedicalkaSubOrder = require('../src/models/MedicalkaSubOrder');
  const ChannelKey = require('../src/models/ChannelKey');
  orders = require('../src/core/orders');
  sale = require('../src/billz/sale');
  config = require('../src/config');
  await ChannelOrder().init();

  originalReserveOrder = sale.reserveOrder;
  originalCompleteSale = sale.completeSale;
  sale.reserveOrder = async (args) => {
    billzCalls.push({ fn: 'reserveOrder', args });
    return { orderId: 'draft-mk', orderNumber: '77' };
  };
  sale.completeSale = async (id, args) => {
    billzCalls.push({ fn: 'completeSale', id, args });
    return {};
  };
  sale.releaseReservation = async () => ({});
  sale.deleteDraft = async () => ({});

  for (const kind of ['token', 'secret']) {
    const key = ChannelKey.generateKey('medicalka', kind);
    const shape = ChannelKey.describeKey(key);
    await ChannelKey().create({
      channel: 'medicalka', kind, hash: ChannelKey.hashKey(key),
      prefix: shape.prefix, last4: shape.last4, active: true,
    });
    if (kind === 'token') token = key; else secret = key;
  }

  await BillzProduct().create({
    billzProductId: 'bp-mk', name: 'Тестовый товар', stock: 40,
    reservedQty: 0, pendingQty: 0, medicalkaId: 501,
  });
  await db.getConnection().collection('products').insertOne({
    name: 'Тестовый товар', category: 'vitamins', billzProductId: 'bp-mk',
    imageUrl: '/uploads/x.jpg',
    channels: {
      medicalka: { enabled: true, price: 300000, forceStatus: 'auto', minStock: 0 },
    },
  });

  const { app } = require('../src/server');
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/medicalka/v1`;
});

test.beforeEach(async () => {
  billzCalls = [];
  config.billzWriteEnabled = true;
  config.medicalkaPartner.legacyOrdersEnabled = true;
  await Promise.all([
    ChannelOrder().deleteMany({ channel: 'medicalka' }),
    MedicalkaSubOrder().deleteMany({}),
  ]);
});

test.after(async () => {
  if (sale) {
    sale.reserveOrder = originalReserveOrder;
    sale.completeSale = originalCompleteSale;
  }
  server?.close();
  await db?.disconnect();
  await mongod?.stop();
});

const post = async (path, body, key = secret) => {
  const res = await fetch(`${base}${path}?secret=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const get = async (path, key = token) => {
  const separator = path.includes('?') ? '&' : '?';
  const res = await fetch(`${base}${path}${separator}token=${key}`);
  return { status: res.status, body: await res.json().catch(() => null) };
};

const newOrder = (orderId) => ({
  order_id: orderId,
  order_number: 'MK-2026-005821',
  customer: { first_name: 'Иван', last_name: 'Иванов', phone: '+998900000000' },
  delivery_type: 'delivery',
  delivery_address: 'г. Ташкент',
  items: [{ product_id: 501, name: 'Тестовый товар', quantity: 1, unit_price: 749000 }],
});

test('legacy order creation records receipt without touching Billz', async () => {
  const response = await post('/orders', newOrder('MK-RECEIVED'));

  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'accepted');
  assert.equal(typeof response.body.wc_order_id, 'number');
  assert.equal(billzCalls.length, 0);
  const stored = await ChannelOrder().findOne({ externalId: 'MK-RECEIVED' }).lean();
  assert.equal(stored.status, 'received');
});

test('duplicate creation returns one stable public id without a sale', async () => {
  const first = await post('/orders', newOrder('MK-DUPE'));
  const second = await post('/orders', newOrder('MK-DUPE'));

  assert.deepEqual(second, first);
  assert.equal(await ChannelOrder().countDocuments({ externalId: 'MK-DUPE' }), 1);
  assert.equal(billzCalls.length, 0);
});

test('paid status performs the first sale and payment_confirmed stays idempotent', async () => {
  const created = await post('/orders', newOrder('MK-PAID'));
  const paid = await post('/orders/MK-PAID/status', { status: 'paid' });
  const confirmed = await post('/orders/MK-PAID/status', { status: 'payment_confirmed' });

  assert.equal(paid.status, 200);
  assert.equal(paid.body.status, 'processing');
  assert.equal(paid.body.wc_order_id, created.body.wc_order_id);
  assert.deepEqual(confirmed, paid);
  assert.equal(billzCalls.filter((call) => call.fn === 'reserveOrder').length, 1);
  assert.equal(billzCalls.filter((call) => call.fn === 'completeSale').length, 1);
  assert.equal((await ChannelOrder().findOne({ externalId: 'MK-PAID' }).lean()).status, 'sold');
});

test('cancellation before payment closes receipt without Billz', async () => {
  await post('/orders', newOrder('MK-CANCEL-BEFORE-PAID'));
  const response = await post('/orders/MK-CANCEL-BEFORE-PAID/status', {
    status: 'cancelled_by_buyer',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'cancelled');
  assert.equal(billzCalls.length, 0);
});

test('cancellation after sale is rejected as return-required', async () => {
  await post('/orders', newOrder('MK-SOLD-CANCEL'));
  await post('/orders/MK-SOLD-CANCEL/status', { status: 'paid' });
  const response = await post('/orders/MK-SOLD-CANCEL/status', {
    status: 'cancelled_by_buyer',
  });

  assert.equal(response.status, 422);
  assert.match(response.body.detail, /return/i);
  assert.equal((await ChannelOrder().findOne({ externalId: 'MK-SOLD-CANCEL' }).lean()).status, 'sold');
});

test('global Billz gate blocks paid status without misreporting a sale', async () => {
  await post('/orders', newOrder('MK-WRITES-OFF'));
  config.billzWriteEnabled = false;
  const response = await post('/orders/MK-WRITES-OFF/status', { status: 'paid' });

  assert.equal(response.status, 503);
  assert.notEqual(response.body?.status, 'processing');
  assert.equal(billzCalls.length, 0);
  assert.notEqual((await ChannelOrder().findOne({ externalId: 'MK-WRITES-OFF' }).lean()).status, 'sold');
});

test('partner paid sub-order and legacy paid callback converge on parent order id', async () => {
  await post('/orders', newOrder('MK-CONVERGE'));
  const { createSubOrderService } = require('../src/medicalka/subOrders');
  const service = createSubOrderService({
    client: {},
    ProductModel: BillzProduct(),
    orderService: orders,
    environment: 'production',
    processingMode: 'live',
    billzWriteEnabled: () => true,
  });

  await service.ingest({
    id: 'sub-converge', order_id: 'MK-CONVERGE', payment_status: 'paid',
    status: 'processing', delivery_type: 'pickup', subtotal: 300000,
    items: [{
      id: 'line-1', product_external_id: 501, product_name: 'Тестовый товар',
      quantity: 1, unit_price: 300000, line_total: 300000,
    }],
  });
  await post('/orders/MK-CONVERGE/status', { status: 'paid' });

  assert.equal(await ChannelOrder().countDocuments({
    channel: 'medicalka', externalId: 'MK-CONVERGE',
  }), 1);
  assert.equal(billzCalls.filter((call) => call.fn === 'reserveOrder').length, 1);
  assert.equal(billzCalls.filter((call) => call.fn === 'completeSale').length, 1);
});

test('legacy disable and existing key permissions remain unchanged', async () => {
  config.medicalkaPartner.legacyOrdersEnabled = false;
  const disabled = await post('/orders', newOrder('MK-LEGACY-OFF'));
  assert.equal(disabled.status, 503);
  assert.equal(disabled.body.code, 'mk_legacy_orders_disabled');

  config.medicalkaPartner.legacyOrdersEnabled = true;
  const wrongKey = await post('/orders', newOrder('MK-WRONGKEY'), token);
  assert.equal(wrongKey.status, 401);
  assert.equal(wrongKey.body.code, 'mk_unauthorized');

  const catalogue = await get('/products?limit=1');
  assert.equal(catalogue.status, 200);
  assert.equal(catalogue.body.items[0].id, 501);
});
