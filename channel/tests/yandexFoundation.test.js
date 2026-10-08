const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'test-shop';
process.env.CHANNEL_TELEGRAM_ENABLED = 'false';
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.YANDEX_ENABLED = 'true';
process.env.YANDEX_PLACE_ID = 'place-one';
process.env.YANDEX_TOKEN_SIGNING_KEY = 'local-yandex-test-signing-key-32-characters';
process.env.UZUM_ENABLED = 'true';
process.env.UZUM_STORE_ID = 'uzum-place';
process.env.UZUM_TOKEN_SIGNING_KEY = 'local-uzum-test-signing-key-32-characters';
process.env.PUBLIC_IMAGE_BASE_URL = 'https://images.example.test';
process.env.CHANNEL_INTERNAL_TOKEN = 'local-internal-test-token-32-characters';
let mongod; let db; let config; let server; let base; let uploads;
let Key; let Order; let Mirror; let cards; let keys; let token;

async function listen() {
  const { app } = require('../src/server');
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
}
async function closeServer() {
  if (server) await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
}
async function restart() {
  await closeServer(); await db.disconnect();
  for (const file of Object.keys(require.cache)) if (file.startsWith(path.resolve(__dirname, '../src') + path.sep)) delete require.cache[file];
  db = require('../src/db'); await db.connect(); config = require('../src/config');
  Key = require('../src/models/ChannelKey')(); Order = require('../src/models/ChannelOrder')(); Mirror = require('../src/models/BillzProduct')();
  cards = db.getConnection().collection('products');
  await listen();
}
test.before(async () => {
  const { MongoMemoryServer } = require('../../backend/node_modules/mongodb-memory-server');
  mongod = await MongoMemoryServer.create(); process.env.MONGO_URI = mongod.getUri();
  uploads = await fs.mkdtemp(path.join(os.tmpdir(), 'yandex-images-'));
  process.env.UPLOADS_DIR = uploads;
  db = require('../src/db'); await db.connect(); config = require('../src/config');
  Key = require('../src/models/ChannelKey')();
  Order = require('../src/models/ChannelOrder')();
  Mirror = require('../src/models/BillzProduct')();
  cards = db.getConnection().collection('products');
  await Promise.all([Key.init(), Order.init(), Mirror.init()]);
  await listen();
});
test.after(async () => {
  await closeServer(); await db?.disconnect(); await mongod?.stop();
  if (uploads) await fs.rm(uploads, { recursive: true, force: true });
});
test.beforeEach(async () => {
  await Promise.all([Key.deleteMany({}), Order.deleteMany({}), Mirror.deleteMany({}), cards.deleteMany({}),
    db.getConnection().collection('yandexpublisheditems').deleteMany({})]);
  await fs.writeFile(path.join(uploads, 'item.jpg'), 'local-image-fixture');
  keys = {};
  for (const channel of ['yandex', 'uzum', 'medicalka']) {
    keys[channel] = await Key.create({ channel, kind: channel === 'medicalka' ? 'token' : 'oauth',
      clientId: `${channel}-test-client`, hash: require('../src/models/ChannelKey').hashKey(`${channel}-test-secret`) });
  }
  token = signed(keys.yandex._id);
});

function signed(keyId, { channel = 'yandex', audience = 'fairhaven-yandex', expiresAt = Math.floor(Date.now() / 1000) + 3600 } = {}) {
  const payload = Buffer.from(JSON.stringify({ c: channel, a: audience, k: String(keyId), e: expiresAt })).toString('base64url');
  return `${payload}.${crypto.createHmac('sha256', process.env.YANDEX_TOKEN_SIGNING_KEY).update(payload).digest('base64url')}`;
}
async function call(method, route, { body, raw, type = 'application/json', bearer = token, internal = false } = {}) {
  const res = await fetch(`${base}${route}`, { method, headers: {
    'Content-Type': type, ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    ...(internal ? { 'X-Internal-Token': process.env.CHANNEL_INTERNAL_TOKEN } : {}),
  }, ...(body !== undefined || raw !== undefined ? { body: raw ?? JSON.stringify(body) } : {}) });
  return { status: res.status, body: await res.json().catch(() => null), type: res.headers.get('content-type'), cache: res.headers.get('cache-control') };
}
async function oauth(channel = 'yandex', overrides = {}) {
  const form = new URLSearchParams({ client_id: `${channel}-test-client`, client_secret: `${channel}-test-secret`, grant_type: 'client_credentials', scope: 'read write', ...overrides });
  return call('POST', '/yandex/security/oauth/token', { raw: form.toString(), type: 'application/x-www-form-urlencoded', bearer: null });
}
function incoming(overrides = {}) {
  return { discriminator: 'yandex', eatsId: '260908-1234567', comment: 'Courier code 1234',
    deliveryInfo: { courierArrivementDate: '2026-09-08T18:30:00.123+05:00', clientName: 'Local fixture' },
    items: [{ id: 'unknown', price: 123.5, quantity: 2 }], paymentInfo: { itemsCost: 247, paymentType: 'CARD' }, ...overrides };
}
async function seed(id = 'sku-one', { card = {}, mirror = {}, yandex = {} } = {}) {
  await Mirror.create({ billzProductId: id, name: id, measurementUnit: 'шт', stock: 10, reservedQty: 2, pendingQty: 1, ...mirror });
  await cards.insertOne({ name: id, nameUz: `UZ ${id}`, descriptionUz: 'SKU description', category: 'vitamins',
    billzProductId: id, sku: `vendor-${id}`, barcode: '4601234567893', imageUrl: '/uploads/item.jpg',
    mxikCode: '03049990001000000', packageCode: '1234567', price: 999,
    channels: { uzum: { enabled: true, price: 70 }, medicalka: { enabled: true, price: 80 },
      yandex: { enabled: true, price: 120.5, minStock: 2, forceStatus: 'auto', barcodeType: 'ean13', measure: { unit: 'GRM', value: 250 }, ...yandex } }, ...card });
}
const composition = () => call('GET', '/yandex/nomenclature/place-one/composition');
const availability = () => call('GET', '/yandex/nomenclature/place-one/availability');
function error(res, status) {
  assert.equal(res.status, status);
  assert.ok(Array.isArray(res.body)); assert.equal(res.body.length, 1);
  assert.equal(typeof res.body[0].code, 'number');
  assert.equal(typeof res.body[0].description, 'string');
  assert.ok(res.body[0].description.length < 180);
}

test('internal key UI issues independent fhy OAuth credentials without revoking other channels', async () => {
  const issued = await call('POST', '/internal/keys', { internal: true, body: { channel: 'yandex', kind: 'oauth', label: 'Yandex fixture' } });
  assert.equal(issued.status, 200);
  assert.match(issued.body.clientId, /^fhy_id_[\w-]{16}$/);
  assert.match(issued.body.clientSecret, /^fhy_o_[\w-]{43}$/);
  const record = await Key.findById(issued.body.id).lean();
  assert.equal(record.hash, require('../src/models/ChannelKey').hashKey(issued.body.clientSecret));
  const listed = await call('GET', '/internal/keys', { internal: true });
  assert.equal(JSON.stringify(listed.body).includes(issued.body.clientSecret), false);
  assert.equal(await Key.countDocuments({ active: true }), 4);
});

test('Yandex form OAuth authenticates only its own active credentials and returns JSON', async () => {
  const result = await oauth();
  assert.equal(result.status, 200); assert.match(result.type, /^application\/json/);
  assert.deepEqual(Object.keys(result.body).sort(), ['access_token', 'expires_in']);
  assert.ok(result.body.expires_in > 0); assert.equal(result.cache, 'no-store');
  assert.equal((await call('GET', '/yandex/nomenclature/place-one/composition', { bearer: result.body.access_token })).status, 200);
  for (const other of ['uzum', 'medicalka']) {
    const bad = await oauth(other); assert.equal(bad.status, 401); assert.equal(typeof bad.body.reason, 'string');
  }
  await call('POST', `/internal/keys/${keys.yandex._id}/revoke`, { internal: true });
  assert.equal((await oauth()).status, 401);
  assert.equal((await call('GET', '/yandex/nomenclature/place-one/composition', { bearer: result.body.access_token })).status, 401);
  assert.equal((await Key.findById(keys.uzum._id)).active, true);
});

test('Yandex rejects malformed, expired, wrong-audience, wrong-channel and wrong-kind tokens', async () => {
  for (const bearer of [null, 'malformed', `${token}x`, signed(keys.yandex._id, { expiresAt: 1 }),
    signed(keys.yandex._id, { audience: 'fairhaven-uzum' }), signed(keys.yandex._id, { channel: 'uzum' }),
    signed(keys.uzum._id), signed(keys.medicalka._id), signed('bad-object-id')]) {
    const res = await call('GET', '/yandex/order/unknown/status', { bearer });
    assert.equal(res.status, 401); assert.deepEqual(Object.keys(res.body), ['reason']);
  }
  await Key.updateOne({ _id: keys.yandex._id }, { $set: { kind: 'token' } });
  assert.equal((await availability()).status, 401);
});

test('Yandex credential fields, grant and scope are required and runtime signing failures are bounded', async () => {
  for (const overrides of [{ client_id: '' }, { client_secret: '' }, { grant_type: '' }, { grant_type: 'password' }, { scope: '' }, { scope: 'admin' }]) error(await oauth('yandex', overrides), 400);
  const saved = config.yandex.tokenSigningKey;
  try {
    config.yandex.tokenSigningKey = '';
    error(await oauth(), 500); error(await availability(), 500);
  } finally { config.yandex.tokenSigningKey = saved; }
});

test('composition serializes mandatory Yandex fields with independent SKU prices and regional fiscal data', async () => {
  await seed(); await seed('sku-two', { yandex: { price: 345, measure: { unit: 'MLT', value: 100 } } });
  const res = await composition(); assert.equal(res.status, 200); assert.match(res.type, /^application\/json/);
  assert.deepEqual(res.body.categories, [{ id: 'vitamins', name: 'Vitaminlar' }]);
  assert.deepEqual(res.body.items[0], { id: 'sku-one', categoryId: 'vitamins', name: 'UZ sku-one',
    description: { general: 'SKU description' }, price: 120.5, vendorCode: 'vendor-sku-one',
    barcode: { type: 'ean13', value: '4601234567893', weightEncoding: 'none' }, measure: { unit: 'GRM', value: 250 },
    isCatchWeight: false, images: [{ url: 'https://images.example.test/uploads/item.jpg', order: 0 }],
    serviceCodesUz: { mxikCodeUz: '03049990001000000', packageCodeUz: '1234567' } });
  assert.equal(res.body.items[1].price, 345); assert.deepEqual(res.body.items[1].measure, { unit: 'MLT', value: 100 });
  assert.deepEqual((await availability()).body.items, [{ id: 'sku-one', stock: 5 }, { id: 'sku-two', stock: 5 }]);
  assert.equal(await db.getConnection().collection('yandexpublisheditems').countDocuments({ placeId: 'place-one' }), 2);
});

test('prices report the published assortment with its prices and the configured VAT', async () => {
  await seed(); await seed('sku-two', { yandex: { price: 345, oldPrice: 400 } }); await seed('hidden', { yandex: { enabled: false } });
  const res = await call('GET', '/yandex/nomenclature/place-one/prices');
  assert.equal(res.status, 200); assert.match(res.type, /^application\/json/);
  assert.deepEqual(res.body, { items: [{ id: 'sku-one', price: 120.5, vat: -1 }, { id: 'sku-two', price: 345, vat: -1, oldPrice: 400 }] });
  error(await call('GET', '/yandex/nomenclature/other-place/prices'), 404);
  assert.equal((await call('GET', '/yandex/nomenclature/place-one/prices', { bearer: '' })).status, 401);
  const saved = config.yandex.vat;
  try {
    for (const vat of [0, 13, NaN]) { config.yandex.vat = vat; error(await call('GET', '/yandex/nomenclature/place-one/prices'), 500); }
    config.yandex.vat = 12; assert.equal((await call('GET', '/yandex/nomenclature/place-one/prices')).body.items[0].vat, 12);
  } finally { config.yandex.vat = saved; }
});

test('every Yandex response declares exactly application/json, as partner acceptance checks', async () => {
  await seed();
  const created = await call('POST', '/yandex/order', { body: incoming(), type: 'application/vnd.eats.order.v2+json' });
  const id = created.body.orderId;
  const responses = [await oauth(), await oauth('yandex', { client_secret: 'wrong' }), created, await composition(), await availability(),
    await call('GET', '/yandex/nomenclature/place-one/prices'), await call('GET', `/yandex/order/${id}`), await call('GET', `/yandex/order/${id}/status`),
    await call('GET', '/yandex/order/unknown/status'), await call('GET', '/yandex/order/unknown/status', { bearer: '' }),
    await call('POST', '/yandex/order', { raw: '{bad json' })];
  assert.deepEqual(responses.map((res) => res.status), [200, 401, 200, 200, 200, 200, 200, 200, 404, 401, 400]);
  responses.forEach((res, index) => assert.equal(res.type, 'application/json', `response ${index}`));
});

test('composition pagination reports totalCount and rejects ambiguous or invalid limits', async () => {
  await seed(); await seed('sku-two');
  const res = await call('GET', '/yandex/nomenclature/place-one/composition?limit=1&offset=1');
  assert.equal(res.status, 200); assert.equal(res.body.totalCount, 2); assert.deepEqual(res.body.items.map((item) => item.id), ['sku-two']);
  for (const query of ['limit=0', 'offset=-1', 'limit=1.5', 'limit=1&limit=2', 'offset=word']) error(await call('GET', `/yandex/nomenclature/place-one/composition?${query}`), 400);
  error(await call('GET', '/yandex/nomenclature/other-place/composition'), 404);
});

for (const [label, change] of [
  ['disabled', { 'channels.yandex.enabled': false }], ['unlinked', { billzProductId: '' }],
  ['missing image', { imageUrl: '' }], ['stale price', { 'channels.yandex.price': 0 }],
  ['invalid measure', { 'channels.yandex.measure.value': 1.5 }], ['missing barcode', { barcode: '' }],
  ['invalid barcode type', { 'channels.yandex.barcodeType': 'made-up' }],
]) {
  test(`ledger emits explicit zero for ${label}, including forced-in products`, async () => {
    await seed('sku-one', { yandex: { forceStatus: 'in' } });
    assert.equal((await composition()).status, 200);
    await cards.updateOne({ billzProductId: 'sku-one' }, { $set: change });
    assert.deepEqual((await composition()).body.items, []);
    assert.deepEqual((await availability()).body.items, [{ id: 'sku-one', stock: 0 }]);
  });
}

test('missing measure, barcode type and fiscal codes fall back to the shop defaults', async () => {
  const SettingView = require('../src/models/SettingView');
  const bare = { yandex: { measure: null, barcodeType: '' }, card: { mxikCode: '', packageCode: '' } };
  await seed('sku-one', { ...bare, card: { ...bare.card, name: 'PROTEIN 432 ГР' } });
  await seed('sku-two', { ...bare, card: { ...bare.card, barcode: '12345670' } });
  await db.getConnection().collection('settings').insertOne({ key: 'channels.defaultMxikCode', value: '09999999999999999' });
  SettingView.clearCache();
  try {
    const [one, two] = (await composition()).body.items;
    assert.deepEqual([one.measure, one.barcode.type, one.serviceCodesUz], [{ unit: 'GRM', value: 432 }, 'ean13',
      { mxikCodeUz: '09999999999999999', packageCodeUz: config.defaultPackageCode }]);
    assert.deepEqual([two.measure, two.barcode.type], [{ unit: 'GRM', value: 100 }, 'eanx']);
  } finally {
    await db.getConnection().collection('settings').deleteMany({}); SettingView.clearCache();
  }
});

test('barcode type and package measure are derived from the product itself', () => {
  const { barcodeTypeFor, measureFor } = require('../src/adapters/yandex/serializers');
  assert.deepEqual(['4601234567893', '12345670', '012345678905', '14601234567890', 'ABC-1', '1234567890'].map(barcodeTypeFor),
    ['ean13', 'eanx', 'upca', 'itf14', 'code128', 'code128']);
  assert.deepEqual(measureFor({}, 'КРЕМ ДЛЯ РУК 50 МЛ'), { unit: 'MLT', value: 50 });
  assert.deepEqual(measureFor({}, 'Tea 20g'), { unit: 'GRM', value: 20 });
  for (const name of ['ОМЕГА-3 1000МГ 60 КАПС', 'B12 1000 МКГ', 'D3 5000 IU', '']) assert.deepEqual(measureFor({}, name), { unit: 'GRM', value: 100 });
  assert.deepEqual(measureFor({ measure: { unit: 'MLT', value: 7 } }, 'Tea 20g'), { unit: 'MLT', value: 7 });
});

for (const reason of ['card deleted', 'mirror deleted', 'upstream tombstone', 'weighted', 'image file removed']) {
  test(`historical availability survives ${reason}`, async () => {
    await seed(); assert.equal((await availability()).status, 200);
    if (reason === 'card deleted') await cards.deleteMany({});
    if (reason === 'mirror deleted') await Mirror.deleteMany({});
    if (reason === 'upstream tombstone') await Mirror.updateMany({}, { $set: { deletedInBillz: true } });
    if (reason === 'weighted') await Mirror.updateMany({}, { $set: { measurementUnit: 'kg' } });
    if (reason === 'image file removed') await fs.unlink(path.join(uploads, 'item.jpg'));
    assert.deepEqual((await composition()).body.items, []);
    assert.deepEqual((await availability()).body.items, [{ id: 'sku-one', stock: 0 }]);
  });
}

test('eligible forced-in and minStock conventions remain intact', async () => {
  await seed('forced', { mirror: { stock: 0 }, yandex: { forceStatus: 'in' } });
  await seed('out', { yandex: { forceStatus: 'out' } });
  await seed('cushion', { yandex: { minStock: 7 } });
  assert.deepEqual((await availability()).body.items, [{ id: 'cushion', stock: 0 }, { id: 'forced', stock: 1 }, { id: 'out', stock: 0 }]);
});

test('ledger writes complete before successful composition or stock response and failures fail closed', async (t) => {
  await seed();
  assert.equal((await composition()).status, 200);
  const Ledger = require('../src/models/YandexPublishedItem')();
  t.mock.method(Ledger, 'bulkWrite', async () => { throw new Error('private database diagnostics'); });
  error(await composition(), 500); error(await availability(), 500);
});

test('valid unknown and unavailable receipt persists NEW without reservation, payment or notification', async (t) => {
  const billz = require('../src/billz/client');
  const notify = require('../src/notify/telegram');
  for (const name of Object.keys(billz).filter((key) => typeof billz[key] === 'function')) t.mock.method(billz, name, () => { throw new Error('Billz must never be called by receipt'); });
  t.mock.method(notify, 'announceOrder', () => { throw new Error('Telegram must never be called by receipt'); });
  await seed('unavailable', { yandex: { enabled: false } });
  const body = incoming({ items: [{ id: 'unknown', price: 0, quantity: 0.5 }, { id: 'unavailable', price: 99, quantity: 3 }] });
  const res = await call('POST', '/yandex/order', { body, type: 'application/vnd.eats.order.v2+json' });
  assert.equal(res.status, 200); assert.equal(res.body.result, 'OK');
  assert.match(res.body.orderId, /^[0-9a-f-]{36}$/); assert.notEqual(res.body.orderId, body.eatsId);
  const record = await Order.findOne({ channel: 'yandex' }).lean();
  assert.deepEqual(record.rawIn, body); assert.equal(record.status, 'received');
  assert.equal(record.billz.attempts, 0); assert.equal(record.billz.pendingApplied, false); assert.equal(record.billz.reservationApplied, false);
  assert.equal(record.telegramMessageId, null);
  assert.deepEqual(record.items.map(({ billzProductId, quantity, unitPrice }) => ({ billzProductId, quantity, unitPrice })), [
    { billzProductId: 'unknown', quantity: 0.5, unitPrice: 0 }, { billzProductId: 'unavailable', quantity: 3, unitPrice: 99 }]);
  const stock = await Mirror.findOne({ billzProductId: 'unavailable' }).lean();
  assert.equal(stock.stock, 10); assert.equal(stock.reservedQty, 2); assert.equal(stock.pendingQty, 1);
  const status = await call('GET', `/yandex/order/${res.body.orderId}/status`);
  assert.equal(status.body.status, 'NEW'); assert.deepEqual(Object.keys(status.body).sort(), ['status', 'updatedAt']);
});

test('concurrent exact retries keep one durable random order ID; changed retry returns bounded 400', async () => {
  const body = incoming();
  const responses = await Promise.all(Array.from({ length: 12 }, () => call('POST', '/yandex/order', { body })));
  for (const res of responses) assert.equal(res.status, 200);
  assert.equal(new Set(responses.map((res) => res.body.orderId)).size, 1);
  assert.equal(await Order.countDocuments({ channel: 'yandex' }), 1);
  for (const changed of [{ comment: 'changed' }, { paymentInfo: { itemsCost: 1, paymentType: 'CARD' } }, { items: [{ id: 'unknown', price: 124, quantity: 2 }] }]) error(await call('POST', '/yandex/order', { body: incoming(changed) }), 400);
});

test('GET projects actual items while retry compares immutable receipt and excludes cross-channel/external lookup', async () => {
  const body = incoming(); const created = await call('POST', '/yandex/order', { body }); assert.equal(created.status, 200);
  const id = created.body.orderId;
  await Order.updateOne({ internalOrderId: id }, { $set: { items: [{ billzProductId: 'replacement', quantity: 1, unitPrice: 20 }], 'billz.lastError': 'private Billz details' } });
  assert.deepEqual((await call('GET', `/yandex/order/${id}`)).body, { discriminator: 'yandex', eatsId: body.eatsId, items: [{ id: 'replacement', price: 20, quantity: 1 }] });
  assert.deepEqual((await call('POST', '/yandex/order', { body })).body, created.body);
  error(await call('GET', `/yandex/order/${body.eatsId}`), 404);
  await Order.create({ channel: 'uzum', internalOrderId: 'other-order', externalId: body.eatsId });
  error(await call('GET', '/yandex/order/other-order'), 404); error(await call('GET', '/yandex/order/other-order/status'), 404);
  assert.equal((await call('PUT', `/yandex/order/${id}/status`, { body: { status: 'CANCELLED' }, type: 'application/vnd.eats.order.status.v1+json' })).status, 204);
  assert.equal((await Order.findOne({ internalOrderId: id })).status, 'received');
  assert.equal((await call('GET', `/yandex/order/${id}/status`)).body.status, 'CANCELLED');
});

test('receipt snapshots survive actual-item edits without mutating raw input', async () => {
  const body = incoming(); const created = await call('POST', '/yandex/order', { body }); assert.equal(created.status, 200);
  const record = await Order.findOne({ internalOrderId: created.body.orderId });
  record.rawIn = incoming({ comment: 'overwritten' });
  record.yandex.requestSnapshot = incoming({ comment: 'overwritten', restaurantId: 'place-one' });
  record.items = [];
  await record.save();
  const saved = await Order.findById(record._id).lean();
  assert.deepEqual(saved.rawIn, body);
  assert.equal(saved.yandex.requestSnapshot.comment, body.comment);
  assert.deepEqual((await call('GET', `/yandex/order/${created.body.orderId}`)).body.items, []);
  assert.deepEqual((await call('POST', '/yandex/order', { body })).body, created.body);
});

test('restart retains both receipt identity and historical per-place zero rows', async () => {
  await seed(); assert.equal((await composition()).status, 200);
  const body = incoming(); const created = await call('POST', '/yandex/order', { body }); assert.equal(created.status, 200);
  await cards.deleteMany({});
  // A fresh application/connection uses persisted Mongo state, not process caches.
  await restart();
  assert.deepEqual((await availability()).body.items, [{ id: 'sku-one', stock: 0 }]);
  assert.deepEqual((await call('POST', '/yandex/order', { body })).body, created.body);
  config.yandex.placeId = 'place-two';
  assert.deepEqual((await call('GET', '/yandex/nomenclature/place-two/availability')).body.items, []);
  config.yandex.placeId = 'place-one';
});

test('receipt requires documented types and yandex delivery without catalog validation', async () => {
  for (const key of ['comment', 'deliveryInfo', 'discriminator', 'eatsId', 'items', 'paymentInfo']) {
    const body = incoming(); delete body[key]; error(await call('POST', '/yandex/order', { body }), 400);
  }
  for (const override of [{ discriminator: 'pickup' }, { discriminator: 'marketplace' }, { deliveryInfo: {} }, { deliveryInfo: { courierArrivementDate: 'yesterday' } },
    { restaurantId: 'wrong' }, { eatsId: { $ne: '' } }, { items: [{ id: 'x', price: '12', quantity: 1 }] },
    { items: [{ id: 'x', price: 1, quantity: -1 }] }, { paymentInfo: { itemsCost: 1, paymentType: 'BITCOIN' } }]) error(await call('POST', '/yandex/order', { body: incoming(override) }), 400);
  assert.equal(await Order.countDocuments({ channel: 'yandex' }), 0);
  const omitted = await call('POST', '/yandex/order', { body: incoming() }); assert.equal(omitted.status, 200);
  assert.deepEqual((await call('POST', '/yandex/order', { body: incoming({ restaurantId: 'place-one' }) })).body, omitted.body);
});

for (const key of ['__proto__', 'constructor', 'prototype']) {
  for (const location of ['root', 'nested', 'array']) {
    test(`receipt rejects own ${key} key at ${location} before recording an order`, async () => {
      // JSON.parse preserves an own __proto__ key instead of setting a prototype.
      const unsafe = JSON.parse(`{"${key}":{"marker":"private-object-key-value"}}`);
      const body = incoming(location === 'root' ? unsafe : location === 'nested'
        ? { deliveryInfo: { ...incoming().deliveryInfo, metadata: { receipt: unsafe } } }
        : { metadata: [{}, [null, { receipt: unsafe }]] });
      for (const type of ['application/json', 'application/vnd.eats.order.v2+json']) {
        const result = await call('POST', '/yandex/order', { body, type });
        const retry = await call('POST', '/yandex/order', { body, type });
        assert.equal(await Order.countDocuments({}), 0);
        for (const response of [result, retry]) {
          error(response, 400);
          assert.deepEqual(response.body, [{ code: 400, description: 'Invalid order object keys' }]);
        }
      }
    });
  }
}

test('schema-valid empty optional objects and unknown metadata remain intact across receipt and retry', async () => {
  const body = incoming({ brand: '', promos: [], deliveryInfo: {
    courierArrivementDate: '2026-09-08T18:30:00Z', deliveryAddress: {},
  }, metadata: { empty: {}, values: [{}, [], null, false, 0, '__proto__'],
    nested: { toString: 'metadata', hasOwnProperty: 'value' } } });
  const result = await call('POST', '/yandex/order', { body });
  assert.equal(result.status, 200);
  const record = await Order.findOne({ internalOrderId: result.body.orderId }).lean();
  assert.deepEqual(record.rawIn, body);
  assert.deepEqual(record.yandex.requestSnapshot, { ...body, restaurantId: 'place-one' });
  assert.deepEqual((await call('POST', '/yandex/order', { body })).body, result.body);
  assert.equal(await Order.countDocuments({ channel: 'yandex' }), 1);
});

test('invalid calendar dates fail schema validation without recording orders', async () => {
  error(await call('POST', '/yandex/order', { body: incoming({ deliveryInfo: { courierArrivementDate: '2026-02-30T10:00:00Z' } }) }), 400);
  assert.equal(await Order.countDocuments({ channel: 'yandex' }), 0);
});

test('receipt retry and initial status survive a fresh application and database connection', async () => {
  const body = incoming(); const result = await call('POST', '/yandex/order', { body }); assert.equal(result.status, 200);
  await restart();
  assert.deepEqual((await call('POST', '/yandex/order', { body })).body, result.body);
  assert.equal((await call('GET', `/yandex/order/${result.body.orderId}/status`)).body.status, 'NEW');
  assert.deepEqual((await Order.findOne({ channel: 'yandex' }).lean()).rawIn, body);
});
