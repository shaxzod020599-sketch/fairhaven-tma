const assert = require('node:assert/strict');
const test = require('node:test');

process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'shop-a';
process.env.BILLZ_CASHBOX_ID = 'till-1';
process.env.BILLZ_PAYMENT_TYPE_ID = 'pt-transfer';
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
let secret;
let token;

/**
 * The order surface, checked against Medicalka's own integration guide rather
 * than against our idea of it.
 *
 * Two things in that guide are easy to read past and both break the
 * integration on its first day: the status call is addressed by the order id
 * THEY generated, not the id we replied with, and `wc_order_id` is an integer.
 */
test.before(async () => {
  const { MongoMemoryServer } = require(
    '/Users/tm/Projects/project vitamin delivery/backend/node_modules/mongodb-memory-server'
  );
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();

  db = require('../src/db');
  await db.connect();

  ChannelOrder = require('../src/models/ChannelOrder');
  BillzProduct = require('../src/models/BillzProduct');
  const ChannelKey = require('../src/models/ChannelKey');
  const sale = require('../src/billz/sale');
  await ChannelOrder().init();

  sale.reserveOrder = async () => ({ orderId: 'draft-mk', orderNumber: '77' });
  sale.completeSale = async () => ({});
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
    channels: { medicalka: { enabled: true, price: 300000, forceStatus: 'auto', minStock: 0 } },
  });

  const { app } = require('../src/server');
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/medicalka/v1`;
});

test.after(async () => {
  server?.close();
  await db.disconnect();
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

const newOrder = (orderId) => ({
  order_id: orderId,
  order_number: 'MK-2026-005821',
  customer: { first_name: 'Иван', last_name: 'Иванов', phone: '+998900000000' },
  delivery_type: 'delivery',
  delivery_address: 'г. Ташкент',
  items: [{ product_id: 501, name: 'Тестовый товар', quantity: 1, unit_price: 749000 }],
});

/* ── wc_order_id is an integer ───────────────────────────────────────────── */

test('wc_order_id comes back as an integer, as their example shows', async () => {
  // Their guide answers `{"wc_order_id": 25545}` unquoted, and states that ids
  // are integers while prices are strings. A uuid there is a type error their
  // client meets on the first order it ever places.
  const res = await post('/orders', newOrder('MK-INT-1'));

  assert.equal(res.status, 200);
  assert.equal(typeof res.body.wc_order_id, 'number');
  assert.ok(Number.isInteger(res.body.wc_order_id));
  assert.equal(res.body.status, 'received');
});

test('a resent order returns the same integer, not a fresh one', async () => {
  const first = await post('/orders', newOrder('MK-INT-2'));
  const second = await post('/orders', newOrder('MK-INT-2'));

  assert.equal(second.body.wc_order_id, first.body.wc_order_id);
  assert.equal(await ChannelOrder().countDocuments({ externalId: 'MK-INT-2' }), 1);
});

/* ── The status call is addressed by THEIR id ────────────────────────────── */

test('status is accepted against the order_id they generated', async () => {
  // "Обращайтесь по тому order_id, который вы сами сгенерировали" — their
  // guide, step 6. Looking up only by our own id meant every status update
  // would have answered 404.
  await post('/orders', newOrder('MK-THEIRS-1'));
  await new Promise((r) => setTimeout(r, 250));

  const res = await post('/orders/MK-THEIRS-1/status', { status: 'paid' });

  assert.equal(res.status, 200, 'their own order_id must resolve');
  assert.equal(typeof res.body.wc_order_id, 'number');
});

test('status is also accepted against the wc_order_id we replied with', async () => {
  // Being liberal costs nothing and removes a class of "which id" support
  // traffic, but their id is the one the contract names.
  const created = await post('/orders', newOrder('MK-OURS-1'));
  await new Promise((r) => setTimeout(r, 250));

  const res = await post(`/orders/${created.body.wc_order_id}/status`, { status: 'paid' });
  assert.equal(res.status, 200);
});

test('an unknown order id is a 404, not a silent success', async () => {
  const res = await post('/orders/NOPE-404/status', { status: 'paid' });
  assert.equal(res.status, 404);
});

/* ── Status vocabulary ───────────────────────────────────────────────────── */

test('the status we report uses their words, not our internal ones', async () => {
  // `reserved` and `sold` are ours. Their guide only ever shows received,
  // accepted and processing — an integrator matching on those would never see
  // a word we invented.
  await post('/orders', newOrder('MK-VOCAB-1'));
  await new Promise((r) => setTimeout(r, 250));

  const paid = await post('/orders/MK-VOCAB-1/status', { status: 'paid' });
  assert.equal(paid.body.status, 'processing');

  await post('/orders', newOrder('MK-VOCAB-2'));
  await new Promise((r) => setTimeout(r, 250));
  const cancelled = await post('/orders/MK-VOCAB-2/status', { status: 'cancelled_by_buyer' });
  assert.equal(cancelled.body.status, 'cancelled');
});

test('every status their guide lists is accepted', async () => {
  for (const status of ['paid', 'payment_confirmed', 'cancelled', 'cancelled_by_buyer']) {
    const id = `MK-ALL-${status}`;
    await post('/orders', newOrder(id));
    await new Promise((r) => setTimeout(r, 200));
    const res = await post(`/orders/${id}/status`, { status });
    assert.equal(res.status, 200, `${status} was refused`);
  }
});

test('a status outside their list is 422, as their guide promises', async () => {
  await post('/orders', newOrder('MK-BAD-1'));
  const res = await post('/orders/MK-BAD-1/status', { status: 'shipped' });
  assert.equal(res.status, 422);
});

/* ── Keys ────────────────────────────────────────────────────────────────── */

test('the read token cannot place an order', async () => {
  const res = await post('/orders', newOrder('MK-WRONGKEY'), token);
  assert.equal(res.status, 401);
  assert.equal(res.body.code, 'mk_unauthorized');
});
