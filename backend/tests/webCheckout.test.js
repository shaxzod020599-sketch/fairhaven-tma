const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const mongoose = require('mongoose');

/**
 * Web checkout prices and filters the cart on the server. A product withdrawn
 * from the shop (approved: false) must not be orderable through a stale cart,
 * and the free-delivery threshold is the one the admin set, not a constant.
 */

process.env.NODE_ENV = 'test';

let mongod;
let server;
let base;
let Product;
let Setting;
let ids;

const GUEST = {
  location: { addressString: 'Ташкент, Чиланзар 1' },
  customerName: 'Test Guest',
  customerPhone: '+998901234567',
};

async function order(items) {
  const res = await fetch(`${base}/order`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...GUEST, items }),
  });
  return { status: res.status, body: await res.json() };
}

test.before(async () => {
  const { MongoMemoryServer } = require('mongodb-memory-server');
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'web-checkout-test' });
  Product = require('../models/Product');
  Setting = require('../models/Setting');

  const listed = await Product.create({ name: 'Listed', price: 200_000, category: 'vitamins' });
  const withdrawn = await Product.create({ name: 'Withdrawn', price: 100_000, category: 'vitamins', approved: false });
  ids = { listed: String(listed._id), withdrawn: String(withdrawn._id) };

  const app = express();
  app.use(express.json());
  const webOrders = require('../controllers/webOrderController');
  const { webAuthOptional } = require('../middleware/webAuth');
  app.post('/order', webOrders.create);
  app.get('/order/:id', webAuthOptional, webOrders.getById);
  app.get('/me', webAuthOptional, require('../controllers/webAuthController').me);
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await mongoose.disconnect();
  await mongod?.stop();
});

test('a cart holding a withdrawn product is refused with a clear reason', async () => {
  const { status, body } = await order([
    { productId: ids.listed, quantity: 1 },
    { productId: ids.withdrawn, quantity: 1 },
  ]);
  assert.equal(status, 400);
  assert.equal(body.error, 'unavailable_product');
  assert.deepEqual(body.productIds, [ids.withdrawn]);
  assert.match(body.message, /больше нет в продаже/);
});

test('without a setting, delivery is free from 500 000 and costs 25 000 below it', async () => {
  await Setting.deleteMany({ key: 'free_delivery_threshold' });
  const below = await order([{ productId: ids.listed, quantity: 2 }]);
  assert.equal(below.status, 201);
  assert.equal(below.body.data.deliveryFee, 25_000);

  const above = await order([{ productId: ids.listed, quantity: 3 }]);
  assert.equal(above.body.data.deliveryFee, 0);
});

test('the free-delivery threshold follows the admin setting', async () => {
  await Setting.findOneAndUpdate(
    { key: 'free_delivery_threshold' },
    { key: 'free_delivery_threshold', value: 300_000 },
    { upsert: true },
  );
  try {
    const freed = await order([{ productId: ids.listed, quantity: 2 }]);
    assert.equal(freed.body.data.deliveryFee, 0, '400 000 now clears the threshold');

    const charged = await order([{ productId: ids.listed, quantity: 1 }]);
    assert.equal(charged.body.data.deliveryFee, 25_000);
  } finally {
    await Setting.deleteMany({ key: 'free_delivery_threshold' });
  }
});

test('the customer sees only customer-facing order fields', async () => {
  const created = await order([{ productId: ids.listed, quantity: 1 }]);
  assert.equal(created.status, 201);
  const { _id, accessToken } = created.body.data;
  assert.ok(accessToken, 'the creator gets the token once');

  const Order = require('../models/Order');
  await Order.updateOne({ _id }, {
    $push: {
      internalNotes: { text: 'звонил, не ответил', by: { telegramId: 1, name: 'Оператор' } },
      statusHistory: { status: 'confirmed', by: { telegramId: 1, name: 'Оператор' } },
    },
    $set: { claimedBy: { telegramId: 1, name: 'Оператор' }, 'billzSync.lastError': 'timeout' },
  });

  const res = await fetch(`${base}/order/${_id}?t=${accessToken}`);
  assert.equal(res.status, 200);
  const { data } = await res.json();
  const allowed = new Set([
    '_id', 'items', 'subtotal', 'deliveryFee', 'discount', 'promoCode', 'totalAmount', 'status',
    'location', 'customerName', 'customerPhone', 'email', 'paymentMethod', 'notes', 'source',
    'createdAt', 'updatedAt',
  ]);
  for (const key of Object.keys(data)) assert.ok(allowed.has(key), `leaked field: ${key}`);
  assert.equal(data.totalAmount, 225_000);
  assert.equal(data.items.length, 1);
});

test('a guest asking who they are gets 200 with no user, not a 401', async () => {
  const res = await fetch(`${base}/me`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true, data: null });
});
