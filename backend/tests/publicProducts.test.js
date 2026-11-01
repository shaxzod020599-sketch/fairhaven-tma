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

test('every public product carries the shop-site title, brand and shelves', async () => {
  const { body } = await get('/api/products');
  const linked = body.data.find((p) => p._id === ids.linked);
  assert.equal(linked.title, 'Prenatal Multi');
  assert.equal(linked.brandName, 'Fairhaven Health');
  assert.equal(linked.brandSlug, 'fairhaven-health');
  assert.equal(typeof linked.spec, 'string');
  assert.ok(Array.isArray(linked.needs));
  assert.equal(typeof linked.kind, 'string');
  for (const product of body.data) {
    for (const key of ['title', 'titleUz', 'spec', 'specUz', 'brandName', 'brandSlug', 'needs', 'kind']) {
      assert.notEqual(product[key], undefined, `${key} missing on ${product.name}`);
    }
  }
});

test('stored admin overrides win over the computed values', async () => {
  const custom = await Product.create({
    name: 'МАГНИЙ ЦИТРАТ 200 МГ ТАБЛ. №60 SOLGAR',
    brand: 'SOLGAR',
    price: 90_000,
    category: 'supplements',
    displayName: 'Магний цитрат',
    displayNameUz: 'Magniy sitrat',
    needs: ['bones'],
    kind: 'vitamins',
  });
  const auto = await Product.create({
    name: 'МАГНИЙ ЦИТРАТ 400 МГ ТАБЛ. №60 SOLGAR', brand: 'SOLGAR', price: 90_000, category: 'supplements',
  });
  try {
    const one = (await get(`/api/products/${custom._id}`)).body.data;
    assertPublic(one);
    assert.deepEqual(
      { title: one.title, titleUz: one.titleUz, needs: one.needs, kind: one.kind, brandSlug: one.brandSlug },
      { title: 'Магний цитрат', titleUz: 'Magniy sitrat', needs: ['bones'], kind: 'vitamins', brandSlug: 'solgar' },
    );
    const computed = (await get(`/api/products/${auto._id}`)).body.data;
    assert.equal(computed.kind, 'minerals');
    assert.ok(computed.needs.includes('sleep'));
    assert.ok(!/SOLGAR/i.test(computed.title));
  } finally {
    await Product.deleteMany({ _id: { $in: [custom._id, auto._id] } });
  }
});

test('the taxonomy counts listed products by goal, kind and brand', async () => {
  require('../controllers/productController')._internal.clearTaxonomyCache();
  const { status, body } = await get('/api/products/taxonomy');
  assert.equal(status, 200);
  assert.equal(body.data.total, 2, 'the unapproved product is not counted');
  assert.deepEqual(body.data.needs.map((n) => n.key), [
    'fertility', 'pregnancy', 'women', 'men', 'beauty', 'sleep',
    'immunity', 'heart', 'digestion', 'metabolism', 'kids', 'bones',
  ]);
  assert.deepEqual(body.data.kinds.map((k) => k.key), [
    'vitamins', 'minerals', 'omega', 'collagen', 'inositol', 'herbal', 'enzymes', 'intimate',
  ]);
  assert.equal(body.data.kinds.reduce((sum, k) => sum + k.count, 0), 2);
  assert.deepEqual(body.data.brands, [{ slug: 'fairhaven-health', name: 'Fairhaven Health', count: 1, country: 'US' }]);
});

test('limit=500 returns the whole catalogue', async () => {
  const extra = await Product.insertMany(Array.from({ length: 120 }, (_, i) => ({
    name: `Bulk ${i}`, price: 1000, category: 'vitamins',
  })));
  try {
    const { body } = await get('/api/products?limit=500');
    assert.equal(body.data.length, 122);
  } finally {
    await Product.deleteMany({ _id: { $in: extra.map((p) => p._id) } });
  }
});

test('search treats its text literally', async () => {
  const bad = await get('/api/products?search=(');
  assert.equal(bad.status, 200);
  assert.deepEqual(bad.body.data, []);
  const dot = await get('/api/products?search=.');
  assert.deepEqual(dot.body.data, [], 'a dot is not a wildcard');
});

test('a malformed id is a 404 JSON answer, not a server error', async () => {
  for (const path of ['/api/products/not-an-id', `/api/public/collections/not-an-id`]) {
    const res = await get(path);
    assert.equal(res.status, 404, path);
    assert.equal(res.body.success, false);
  }
});

test('the collection list hides unapproved products and internal fields', async () => {
  const mixed = await Collection.create({ name: 'Mixed', productIds: [ids.linked, ids.pending] });
  try {
    const { status, body } = await get('/api/public/collections');
    assert.equal(status, 200);
    const found = body.data.find((c) => String(c._id) === String(mixed._id));
    assert.deepEqual(found.productIds.map((p) => String(p._id)), [ids.linked]);
    found.productIds.forEach(assertPublic);

    const one = (await get(`/api/public/collections/${mixed._id}`)).body.data;
    assert.deepEqual(one.productIds.map((p) => String(p._id)), [ids.linked]);
  } finally {
    await Collection.deleteOne({ _id: mixed._id });
  }
});
