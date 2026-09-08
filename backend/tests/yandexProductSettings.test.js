const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');
const express = require('express');
const cookieParser = require('cookie-parser');
const http = require('node:http');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.ADMIN_ORIGIN = 'http://admin.localhost';
process.env.TMA_ORIGIN = 'http://mini.localhost';
const Product = require('../models/Product');
const User = require('../models/User');
const session = require('../services/adminSession');
const hub = require('../utils/channelHub');

let mongod;
let server;
let base;
let auth;
let product;
const otherChannels = {
  medicalka: { enabled: true, price: 51000, oldPrice: 55000, minStock: 1, forceStatus: 'in' },
  uzum: { enabled: true, price: 62000, oldPrice: 66000, minStock: 2, forceStatus: 'out' },
};
const defaults = { enabled: false, price: 0, oldPrice: 0, minStock: 0, forceStatus: 'auto' };
const missingMetadata = { measure: null, barcodeType: '' };

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'yandex-product-settings-test' });
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/admin', require('../routes/adminRoutes'));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api/admin`;
});

test.beforeEach(async () => {
  await Promise.all([Product.deleteMany({}), User.deleteMany({})]);
  const admin = await User.create({ telegramId: 901, role: 'admin' });
  let cookie;
  const issued = await session.issueSession({
    admin, req: { hostname: 'admin.localhost', headers: {} },
    res: { cookie(name, value) { cookie = `${name}=${value}`; } },
  });
  auth = { cookie, 'X-FH-CSRF': issued.csrfToken };
  product = await Product.create({ name: 'Local fixture', category: 'vitamins', price: 40000, channels: otherChannels });
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongod?.stop();
});

async function call(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${base}${path}`, {
      method,
      headers: { host: 'admin.localhost', origin: 'http://admin.localhost', ...auth, 'Content-Type': 'application/json', ...headers },
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(text) }); }
        catch (err) { reject(err); }
      });
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

function saveChannel(method, channel, patch, ids = [String(product._id)]) {
  return method === 'PATCH'
    ? call(method, `/channels/products/${ids[0]}/${channel}`, patch)
    : call(method, `/channels/bulk/${channel}`, { ids, ...patch });
}

const legacyCoercions = [
  [{ enabled: 0 }, { enabled: false }],
  [{ enabled: null }, { enabled: false }],
  [{ enabled: 'false' }, { enabled: true }],
  [{ price: '' }, { price: 0 }],
  [{ price: '  ' }, { price: 0 }],
  [{ oldPrice: null }, { oldPrice: 0 }],
  [{ oldPrice: true }, { oldPrice: 1 }],
  [{ minStock: null }, { minStock: 0 }],
];
for (const method of ['PATCH', 'POST']) {
  for (const channel of ['medicalka', 'uzum']) {
    for (const [patch, expected] of legacyCoercions) {
      test(`${method} ${channel} preserves legacy coercion: ${JSON.stringify(patch)}`, async () => {
        const before = await Product.collection.findOne({ _id: product._id });
        const saved = await saveChannel(method, channel, patch);
        assert.equal(saved.status, 200);
        if (method === 'POST') assert.equal(saved.body.data.updated, 1);
        const stored = await Product.collection.findOne({ _id: product._id });
        assert.deepEqual(stored.channels, {
          ...before.channels, [channel]: { ...otherChannels[channel], ...expected },
        });
        assert.equal(stored.price, before.price);
      });
    }
  }

  for (const channel of ['medicalka', 'uzum', 'yandex']) {
    test(`${method} ${channel} accepts numeric strings and keeps numeric/status validation`, async () => {
      const saved = await saveChannel(method, channel, { price: '73000', oldPrice: '79000', minStock: '4' });
      assert.equal(saved.status, 200);
      const before = await Product.collection.findOne({ _id: product._id });
      assert.equal(before.channels[channel].price, 73000);
      assert.equal(before.channels[channel].oldPrice, 79000);
      assert.equal(before.channels[channel].minStock, 4);
      for (const patch of [
        { price: -1 }, { price: 'NaN' }, { price: 'Infinity' },
        { oldPrice: -1 }, { oldPrice: 'NaN' }, { minStock: -1 },
        { minStock: 1.5 }, { minStock: 'NaN' }, { forceStatus: 'ready' },
      ]) {
        const rejected = await saveChannel(method, channel, { enabled: false, ...patch });
        assert.equal(rejected.status, 400, JSON.stringify(patch));
        assert.deepEqual(await Product.collection.findOne({ _id: product._id }), before);
      }
    });
  }
}

test('new and legacy products expose disabled Yandex defaults without copying another assortment', async () => {
  assert.deepEqual(product.toObject().channels.yandex, { ...defaults, ...missingMetadata });
  assert.equal(product.mxikCode, '');
  assert.equal(product.packageCode, '');
  await Product.collection.updateOne({ _id: product._id }, { $unset: { 'channels.yandex': '' } });
  const listed = await call('GET', '/channels/products');
  assert.deepEqual(listed.body.data[0].channels.yandex, { ...defaults, ...missingMetadata, live: false, priceMissing: false });
  const settings = await call('GET', '/channels/settings');
  assert.ok(settings.body.data.channels.includes('yandex'));
  assert.equal(settings.body.data.defaultMxikCode, '');
  const filtered = await call('GET', '/channels/products?channel=yandex');
  assert.equal(filtered.body.meta.total, 0);
});

test('Yandex enable, price and stock controls roundtrip independently, including legacy cards', async () => {
  await Product.collection.updateOne({ _id: product._id }, { $unset: { 'channels.yandex': '' } });
  const patch = { enabled: true, price: 73000, oldPrice: 79000, minStock: 4, forceStatus: 'out' };
  const saved = await call('PATCH', `/channels/products/${product._id}/yandex`, patch);
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.data.channels.yandex, { ...patch, ...missingMetadata, live: false, priceMissing: false });
  const stored = await Product.findById(product._id).lean();
  assert.deepEqual(stored.channels.yandex, patch);
  assert.deepEqual(stored.channels.medicalka, otherChannels.medicalka);
  assert.deepEqual(stored.channels.uzum, otherChannels.uzum);
  assert.equal(stored.price, 40000);
  const listed = await call('GET', '/channels/products?channel=yandex');
  assert.equal(listed.body.meta.total, 1);
  assert.equal(listed.body.data[0].channels.yandex.price, 73000);
  const disabled = await call('PATCH', `/channels/products/${product._id}/yandex`, { enabled: false });
  assert.equal(disabled.body.data.channels.yandex.enabled, false);
  assert.equal(disabled.body.data.channels.yandex.price, 73000);
});

test('Yandex bulk edit changes only selected channel and reports missing price', async () => {
  const saved = await call('POST', '/channels/bulk/yandex', { ids: [String(product._id)], enabled: true, price: 0 });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.data.updated, 1);
  const listed = await call('GET', '/channels/products?filter=no_price');
  assert.equal(listed.body.meta.total, 1);
  assert.equal(listed.body.data[0].channels.yandex.priceMissing, true);
  const stored = await Product.findById(product._id).lean();
  assert.deepEqual(stored.channels.uzum, otherChannels.uzum);
});

for (const unit of ['GRM', 'MLT']) {
  test(`Yandex ${unit} packaging and explicit barcode type survive route, Mongo and document saves`, async () => {
    const metadata = { measure: { unit, value: 250 }, barcodeType: 'ean13' };
    const saved = await call('PATCH', `/channels/products/${product._id}/yandex`, metadata);
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.data.channels.yandex, { ...defaults, ...metadata, live: false, priceMissing: false });
    const hydrated = await Product.findById(product._id);
    hydrated.description = 'Updated locally';
    await hydrated.save();
    const stored = await Product.collection.findOne({ _id: product._id });
    assert.deepEqual(stored.channels.yandex, { ...defaults, ...metadata });
    assert.deepEqual(stored.channels.medicalka, otherChannels.medicalka);
    assert.deepEqual(stored.channels.uzum, otherChannels.uzum);
    const listed = await call('GET', '/channels/products');
    assert.deepEqual(listed.body.data[0].channels.yandex.measure, metadata.measure);
    assert.equal(listed.body.data[0].channels.yandex.barcodeType, 'ean13');
  });
}

test('Yandex partial settings updates preserve metadata and null deliberately clears measurement', async () => {
  const route = `/channels/products/${product._id}/yandex`;
  assert.equal((await call('PATCH', route, { measure: { unit: 'GRM', value: 120 }, barcodeType: 'code128b' })).status, 200);
  const saved = await call('PATCH', route, { price: 73000, enabled: true });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.data.channels.yandex.measure, { unit: 'GRM', value: 120 });
  assert.equal(saved.body.data.channels.yandex.barcodeType, 'code128b');
  const cleared = await call('PATCH', route, { measure: null });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.data.channels.yandex.measure, null);
  assert.equal(cleared.body.data.channels.yandex.barcodeType, 'code128b');
  assert.equal(cleared.body.data.channels.yandex.price, 73000);
  const stored = await Product.collection.findOne({ _id: product._id });
  assert.equal(stored.channels.yandex.measure, null);
  assert.equal((await call('PATCH', route, { barcodeType: '' })).body.data.channels.yandex.barcodeType, '');
  const listed = await call('GET', '/channels/products');
  assert.equal(listed.body.data[0].channels.yandex.measure, null);
});

test('Yandex bulk metadata roundtrips, survives ordinary edits and clears only when requested', async () => {
  const second = await Product.create({ name: 'Second fixture', category: 'vitamins', price: 41000, channels: otherChannels });
  const untouched = await Product.create({ name: 'Unselected fixture', category: 'vitamins', price: 42000 });
  const untouchedBefore = await Product.collection.findOne({ _id: untouched._id });
  const ids = [String(product._id), String(second._id)];
  const metadata = { measure: { unit: 'GRM', value: 120 }, barcodeType: 'code128b' };
  const saved = await saveChannel('POST', 'yandex', metadata, ids);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.data.updated, 2);
  for (const id of ids) {
    assert.deepEqual((await Product.collection.findOne({ _id: new mongoose.Types.ObjectId(id) })).channels.yandex,
      { ...defaults, ...metadata });
  }
  const secondMetadata = { measure: { unit: 'MLT', value: 250 }, barcodeType: 'ean13' };
  await Product.collection.updateOne({ _id: second._id }, {
    $set: { 'channels.yandex.measure': secondMetadata.measure, 'channels.yandex.barcodeType': secondMetadata.barcodeType },
  });
  assert.equal((await saveChannel('POST', 'yandex', { enabled: true, price: 73000 }, ids)).status, 200);
  for (const [id, expectedMetadata] of [[product._id, metadata], [second._id, secondMetadata]]) {
    const stored = await Product.collection.findOne({ _id: id });
    assert.deepEqual(stored.channels.yandex, { ...defaults, ...expectedMetadata, enabled: true, price: 73000 });
    assert.deepEqual(stored.channels.medicalka, otherChannels.medicalka);
    assert.deepEqual(stored.channels.uzum, otherChannels.uzum);
  }
  assert.equal((await saveChannel('POST', 'yandex', { measure: null }, ids)).status, 200);
  for (const [id, barcodeType] of [[product._id, 'code128b'], [second._id, 'ean13']]) {
    assert.deepEqual((await Product.collection.findOne({ _id: id })).channels.yandex,
      { ...defaults, enabled: true, price: 73000, measure: null, barcodeType });
  }
  assert.equal((await saveChannel('POST', 'yandex', { barcodeType: '' }, ids)).status, 200);
  for (const id of [product._id, second._id]) {
    const stored = await Product.collection.findOne({ _id: id });
    assert.deepEqual(stored.channels.yandex, { ...defaults, ...missingMetadata, enabled: true, price: 73000 });
    assert.deepEqual(stored.channels.medicalka, otherChannels.medicalka);
    assert.deepEqual(stored.channels.uzum, otherChannels.uzum);
  }
  assert.deepEqual(await Product.collection.findOne({ _id: untouched._id }), untouchedBefore);
});

const invalidMetadata = [
  { measure: {} }, { measure: [] }, { measure: '250' }, { measure: true }, { measure: 250 },
  { measure: { unit: 'GRM' } }, { measure: { value: 250 } },
  { measure: { unit: 'PCS', value: 250 } }, { measure: { unit: null, value: 250 } },
  { measure: { unit: 'GRM', value: 0 } }, { measure: { unit: 'GRM', value: -1 } },
  { measure: { unit: 'GRM', value: 1.5 } }, { measure: { unit: 'GRM', value: '250' } },
  { measure: { unit: 'GRM', value: true } }, { measure: { unit: 'GRM', value: null } },
  { measure: { unit: 'GRM', value: 9007199254740992 } },
  { measure: { unit: 'GRM', value: 250, unknown: 1 } },
  { barcodeType: 'none' }, { barcodeType: 'custom' }, { barcodeType: 'EAN13' },
  { barcodeType: null }, { barcodeType: [] }, { barcodeType: 13 },
];
for (const method of ['PATCH', 'POST']) {
  for (const metadata of invalidMetadata) {
    test(`${method} malformed Yandex metadata rejects the whole settings patch: ${JSON.stringify(metadata)}`, async () => {
      const second = await Product.create({ name: 'Second fixture', category: 'vitamins', price: 41000 });
      await Product.collection.updateOne({ _id: product._id }, {
        $set: { 'channels.yandex.measure': { unit: 'MLT', value: 120 }, 'channels.yandex.barcodeType': 'ean13' },
      });
      const before = await Product.collection.find({}).sort({ _id: 1 }).toArray();
      const response = await saveChannel(method, 'yandex', { enabled: true, price: 73000, ...metadata },
        [String(product._id), String(second._id)]);
      assert.equal(response.status, 400);
      assert.equal(response.body.error, 'measure' in metadata ? 'invalid_measure' : 'invalid_barcode_type');
      assert.deepEqual(await Product.collection.find({}).sort({ _id: 1 }).toArray(), before);
    });
  }
}

test('Medicalka and Uzum ignore Yandex metadata without storing it or changing other settings', async () => {
  for (const channel of ['medicalka', 'uzum']) {
    const before = await Product.collection.findOne({ _id: product._id });
    const route = `/channels/products/${product._id}/${channel}`;
    assert.equal((await call('PATCH', route, { measure: { unit: 'GRM', value: 250 }, barcodeType: 'ean13' })).status, 400);
    assert.deepEqual(await Product.collection.findOne({ _id: product._id }), before);
    const saved = await call('PATCH', route, { price: 80000, measure: { invalid: true }, barcodeType: 'custom' });
    assert.equal(saved.status, 200);
    const stored = await Product.collection.findOne({ _id: product._id });
    assert.deepEqual(stored.channels[channel], { ...otherChannels[channel], price: 80000 });
    assert.deepEqual(stored.channels.yandex, before.channels.yandex);
  }
});

test('legacy products can still save with absent metadata and never acquire a fabricated measure', async () => {
  await Product.collection.updateOne({ _id: product._id }, { $unset: { 'channels.yandex': '' } });
  const legacy = await Product.findById(product._id);
  legacy.name = 'Legacy product updated';
  await legacy.save();
  const stored = await Product.collection.findOne({ _id: product._id });
  assert.equal(stored.channels.yandex.measure, null);
  assert.equal(stored.channels.yandex.barcodeType, '');
  assert.deepEqual(stored.channels.medicalka, otherChannels.medicalka);
  assert.deepEqual(stored.channels.uzum, otherChannels.uzum);
});

test('Yandex schema rejects incomplete pairs, nonpositive or fractional values and arbitrary barcode types', async () => {
  for (const metadata of [
    { measure: { unit: 'GRM' } }, { measure: { value: 20 } },
    { measure: { unit: 'PCS', value: 20 } }, { measure: { unit: 'GRM', value: 0 } },
    { measure: { unit: 'GRM', value: 1.5 } }, { barcodeType: 'custom' },
  ]) {
    const invalid = new Product({ name: 'Invalid fixture', category: 'vitamins', price: 1, channels: { yandex: metadata } });
    await assert.rejects(invalid.save(), { name: 'ValidationError' });
  }
});

for (const method of ['PATCH', 'POST']) {
  test(`${method} invalid Yandex settings and unknown channels cannot mutate product data`, async () => {
    const second = await Product.create({ name: 'Second fixture', category: 'vitamins', price: 41000 });
    const ids = [String(product._id), String(second._id)];
    const before = await Product.collection.find({}).sort({ _id: 1 }).toArray();
    for (const body of [
      ...legacyCoercions.map(([patch]) => patch), { enabled: 1 },
      { price: -1 }, { price: 'NaN' }, { price: null }, { price: [] }, { price: true },
      { oldPrice: -1 }, { oldPrice: '' }, { oldPrice: [] },
      { minStock: -1 }, { minStock: 1.5 }, { minStock: '' }, { minStock: [] }, { minStock: true },
      { forceStatus: 'ready' },
    ]) {
      const res = await saveChannel(method, 'yandex', { enabled: true, price: 73000, ...body }, ids);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.deepEqual(await Product.collection.find({}).sort({ _id: 1 }).toArray(), before);
    }
    assert.equal((await saveChannel(method, 'yandex', {}, ids)).status, 400);
    assert.equal((await saveChannel(method, 'unknown', { enabled: true }, ids)).status, 400);
    assert.deepEqual(await Product.collection.find({}).sort({ _id: 1 }).toArray(), before);
  });
}

test('Yandex settings and key issuance keep host, session, CSRF and current-admin guards', async () => {
  for (const [method, path, body] of [
    ['PATCH', `/channels/products/${product._id}/yandex`, { enabled: true }],
    ['POST', '/channels/keys', { channel: 'yandex', kind: 'oauth' }],
  ]) {
    assert.equal((await call(method, path, body, { host: 'mini.localhost' })).status, 421);
    assert.equal((await call(method, path, body, { cookie: '' })).status, 401);
    assert.equal((await call(method, path, body, { 'X-FH-CSRF': '' })).status, 403);
    assert.equal((await call(method, path, body, { origin: 'http://wrong.localhost' })).status, 403);
  }
  await User.updateOne({ telegramId: 901 }, { $set: { role: 'user' } });
  assert.equal((await call('PATCH', `/channels/products/${product._id}/yandex`, { enabled: true })).status, 401);
  assert.equal((await call('POST', '/channels/keys', { channel: 'yandex', kind: 'oauth' })).status, 401);
  assert.equal((await Product.findById(product._id).lean()).channels.yandex.enabled, false);
});

test('Yandex issuance keeps channel association and list responses never repeat credentials', async (t) => {
  const pair = { id: 'test-yandex-key', channel: 'yandex', kind: 'oauth', label: 'Local fixture', fingerprint: 'test…1234', clientId: 'test-client', clientSecret: 'test-only-secret' };
  const logs = [];
  t.mock.method(console, 'log', (...args) => logs.push(args));
  t.mock.method(hub, 'request', async (method, path, options) => {
    if (method === 'POST') {
      assert.equal(path, '/internal/keys');
      assert.deepEqual(options.body, { channel: 'yandex', kind: 'oauth', label: 'Local fixture' });
      return { ok: true, body: pair };
    }
    return { ok: true, body: { keys: [{ ...pair, active: true, hash: 'test-only-hash' }] } };
  });
  const issued = await call('POST', '/channels/keys', { channel: 'yandex', kind: 'oauth', label: 'Local fixture' });
  assert.equal(issued.status, 200);
  assert.deepEqual(issued.body.data, pair);
  const listed = await call('GET', '/channels/keys');
  assert.equal(listed.body.data[0].channel, 'yandex');
  assert.equal(listed.body.data[0].clientSecret, undefined);
  assert.equal(listed.body.data[0].hash, undefined);
  assert.equal(JSON.stringify(logs).includes(pair.clientSecret), false);
});

test('issuance rejects mismatched or malformed success and redacts upstream failure', async (t) => {
  let result;
  t.mock.method(hub, 'request', async () => result);
  for (const response of [
    { ok: false, status: 422, body: { error: 'private upstream credential' } },
    { ok: true, body: { channel: 'uzum', kind: 'oauth', clientId: 'test-id', clientSecret: 'test-secret' } },
    { ok: true, body: { channel: 'yandex', kind: 'oauth', clientId: 'test-id' } },
  ]) {
    result = response;
    const res = await call('POST', '/channels/keys', { channel: 'yandex', kind: 'oauth' });
    assert.ok([400, 502].includes(res.status));
    assert.equal(res.body.error, 'issue_failed');
    assert.equal(res.body.data, undefined);
  }
});

test('invalid channel/key combinations stop before internal issuance', async (t) => {
  const request = t.mock.method(hub, 'request', async () => { throw new Error('unexpected internal request'); });
  for (const body of [{ channel: 'yandex', kind: 'token' }, { channel: 'uzum', kind: 'secret' }, { channel: 'unknown', kind: 'oauth' }]) {
    assert.equal((await call('POST', '/channels/keys', body)).status, 400);
  }
  assert.equal(request.mock.callCount(), 0);
});

test('key revocation redacts failures and refuses a mismatched acknowledgement', async (t) => {
  let result;
  t.mock.method(hub, 'request', async () => result);
  for (const response of [
    { ok: false, status: 500, body: { error: 'private upstream credential' } },
    { ok: true, body: { ok: true, id: 'different-key' } },
    { ok: true, body: {} },
  ]) {
    result = response;
    const res = await call('POST', '/channels/keys/test-yandex-key/revoke');
    assert.equal(res.status, 502);
    assert.deepEqual(res.body, { success: false, error: 'revoke_failed' });
  }
});
