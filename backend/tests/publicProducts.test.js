const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const mongoose = require('mongoose');

/**
 * The public product endpoints are readable by anyone, so they must carry
 * only what the shop shows. They used to return whole documents, which put
 * the Billz link, per-channel prices and stock floors, tax codes and the
 * approval flags at https://fairhaven.uz/api/products.
 */

process.env.NODE_ENV = 'test';

const INTERNAL_FIELDS = [
  'billzProductId', 'channels', 'mxikCode', 'packageCode', 'autoStock', 'approved',
  'barcode', 'createdAt', 'updatedAt', '__v', 'orderCount', 'totalQty',
];

let mongod;
let server;
let base;
let PUBLIC_FIELDS;
let Product;
let Collection;
let ids;

async function get(path) {
  const res = await fetch(`${base}${path}`);
  return { status: res.status, body: await res.json() };
}

function assertPublic(product) {
  for (const key of Object.keys(product)) {
    assert.ok(PUBLIC_FIELDS.includes(key), `unexpected public field: ${key}`);
  }
  for (const key of INTERNAL_FIELDS) {
    assert.equal(product[key], undefined, `internal field leaked: ${key}`);
  }
}

test.before(async () => {
  const { MongoMemoryServer } = require('mongodb-memory-server');
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'public-products-test' });
  Product = require('../models/Product');
  Collection = require('../models/Collection');
  ({ PUBLIC_FIELDS } = require('../utils/publicProduct'));

  const linked = await Product.create({
    name: 'Prenatal Multi',
    nameUz: 'Prenatal Multi UZ',
    price: 250_000,
    oldPrice: 300_000,
    category: 'vitamins',
    imageUrl: '/uploads/a.jpg',
    images: ['/uploads/a.jpg', '/uploads/b.jpg'],
    description: 'Описание',
    descriptionUz: 'Тавсиф',
    descriptionUzLat: 'Tavsif',
    brand: 'FairHaven',
    sku: 'FH-001',
    barcode: '4601234567890',
    tags: ['pregnancy'],
    billzProductId: 'billz-uuid-1',
    mxikCode: '03004001001000000',
    packageCode: '1500000',
    autoStock: false,
    channels: {
      medicalka: { enabled: true, price: 240_000, minStock: 2, forceStatus: 'in' },
      uzum: { enabled: true, price: 260_000 },
      yandex: { enabled: true, price: 270_000, measure: { unit: 'GRM', value: 120 } },
    },
  });
  const pending = await Product.create({
    name: 'Awaiting approval',
    price: 100_000,
    category: 'drinks',
    approved: false,
  });
  // Created before `approved` existed: the field is absent, not false.
  const { insertedId: legacy } = await Product.collection.insertOne({
    name: 'Legacy card',
    price: 50_000,
    category: 'hygiene',
    isAvailable: true,
    createdAt: new Date('2025-01-01'),
  });
  const collection = await Collection.create({
    name: 'Pregnancy',
    productIds: [linked._id],
  });

  // Bought most: the unapproved product, so popularity alone would list it.
  await mongoose.connection.collection('orders').insertMany([
    { items: [{ productId: pending._id, name: 'x', price: 1, quantity: 9 }] },
    { items: [{ productId: linked._id, name: 'x', price: 1, quantity: 5 }] },
  ]);

  ids = { linked: String(linked._id), pending: String(pending._id), legacy: String(legacy), collection: String(collection._id) };

  const app = express();
  app.use('/api/products', require('../routes/productRoutes'));
  app.use('/api/public', require('../routes/publicRoutes'));
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await mongoose.disconnect();
  await mongod?.stop();
});

test('the list carries only public fields', async () => {
  const { status, body } = await get('/api/products');
  assert.equal(status, 200);
  body.data.forEach(assertPublic);

  const linked = body.data.find((p) => p._id === ids.linked);
  // What the web site and the mini-app read.
  assert.deepEqual(
    {
      name: linked.name, nameUz: linked.nameUz, price: linked.price, oldPrice: linked.oldPrice,
      category: linked.category, imageUrl: linked.imageUrl, images: linked.images,
      description: linked.description, descriptionUz: linked.descriptionUz,
      descriptionUzLat: linked.descriptionUzLat, isAvailable: linked.isAvailable,
      brand: linked.brand, sku: linked.sku, tags: linked.tags,
    },
    {
      name: 'Prenatal Multi', nameUz: 'Prenatal Multi UZ', price: 250_000, oldPrice: 300_000,
      category: 'vitamins', imageUrl: '/uploads/a.jpg', images: ['/uploads/a.jpg', '/uploads/b.jpg'],
      description: 'Описание', descriptionUz: 'Тавсиф', descriptionUzLat: 'Tavsif',
      isAvailable: true, brand: 'FairHaven', sku: 'FH-001', tags: ['pregnancy'],
    },
  );
});

test('only an explicit approved: false hides a product from the list', async () => {
  const listed = (await get('/api/products')).body.data.map((p) => p._id);
  assert.ok(listed.includes(ids.linked));
  assert.ok(listed.includes(ids.legacy), 'a product without the field stays listed');
  assert.ok(!listed.includes(ids.pending));

  const searched = (await get('/api/products?search=approval')).body.data;
  assert.deepEqual(searched, []);
});

test('a single product carries only public fields; an unapproved one is not found', async () => {
  const ok = await get(`/api/products/${ids.linked}`);
  assert.equal(ok.status, 200);
  assertPublic(ok.body.data);
  assert.equal(ok.body.data.name, 'Prenatal Multi');

  const legacy = await get(`/api/products/${ids.legacy}`);
  assert.equal(legacy.status, 200);

  const hidden = await get(`/api/products/${ids.pending}`);
  assert.equal(hidden.status, 404);
});

test('popular products skip unapproved ones and keep sales counts internal', async () => {
  const { status, body } = await get('/api/products/popular?limit=3');
  assert.equal(status, 200);
  const listed = body.data.map((p) => String(p._id));
  assert.equal(listed[0], ids.linked, 'ordered products come first');
  assert.ok(listed.includes(ids.legacy), 'topped up with the newest listed products');
  assert.ok(!listed.includes(ids.pending));
  body.data.forEach(assertPublic);
});

test('categories come from listed products only', async () => {
  const { body } = await get('/api/products/categories');
  assert.deepEqual(body.data.sort(), ['hygiene', 'vitamins']);
});

test('a public collection carries only public product fields', async () => {
  const { status, body } = await get(`/api/public/collections/${ids.collection}`);
  assert.equal(status, 200);
  assert.equal(body.data.productIds.length, 1);
  body.data.productIds.forEach(assertPublic);
  assert.equal(body.data.productIds[0].name, 'Prenatal Multi');
});
