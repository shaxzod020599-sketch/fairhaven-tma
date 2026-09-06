const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { response, schema } = require('./uzumSchema');
let reserveCalls = 0;
let saleCalls = 0;
let deleteCalls = 0;

const UPLOADS = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-uploads-'));

process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'shop-a';
process.env.BILLZ_CASHBOX_ID = 'till-1';
process.env.BILLZ_PAYMENT_TYPE_ID = 'pt-transfer';
process.env.MONGO_DB_NAME = 'uzum-test';
process.env.SYNC_ON_BOOT = 'false';
process.env.CHANNEL_TELEGRAM_ENABLED = 'false';
process.env.DISABLE_RATE_LIMIT = 'true';

process.env.CHANNEL_INTERNAL_TOKEN = 'uzum-test-internal-token-0123456789';
process.env.UZUM_ENABLED = 'true';
process.env.UZUM_STORE_ID = 'store-uz-1';
process.env.UZUM_TOKEN_SIGNING_KEY = 'a'.repeat(48);
process.env.PUBLIC_IMAGE_BASE_URL = 'https://cdn.fairhaven.test';
process.env.UPLOADS_DIR = UPLOADS;
process.env.DEFAULT_MXIK_CODE = '02106999028000000';

let mongod;
let db;
let server;
let base;
let ChannelKey;
let ChannelOrder;
let BillzProduct;
let sale;
let SettingView;
let clientId;
let clientSecret;

/**
 * The Uzum Tezkor surface, exercised over real HTTP against a real database.
 *
 * Uzum inherits the Yandex Eats contract, and the parts of it that break an
 * integration are not the happy path: the versioned content types, the error
 * array, the requirement that every route answer with and without `/v1`, and
 * the rule that a resent order returns the same id with a 200. Each of those is
 * asserted here because each of them is invisible in a unit test of a handler.
 */
test.before(async () => {
  const { MongoMemoryServer } = require(
    '../../backend/node_modules/mongodb-memory-server'
  );
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();

  db = require('../src/db');
  await db.connect();

  ChannelKey = require('../src/models/ChannelKey');
  ChannelOrder = require('../src/models/ChannelOrder');
  BillzProduct = require('../src/models/BillzProduct');
  SettingView = require('../src/models/SettingView');
  sale = require('../src/billz/sale');
  await ChannelOrder().init();

  // Billz order methods are not enabled on the integration key yet, so the
  // reserve/sell calls are recorded rather than made.
  sale.reserveOrder = async () => { reserveCalls++; return { orderId: 'draft-uz', orderNumber: '77' }; };
  sale.completeSale = async () => { saleCalls++; return {}; };
  require('../src/notify/telegram').announceOrder = async () => {};
  sale.releaseReservation = async () => ({});
  sale.deleteDraft = async () => { deleteCalls++; return {}; };

  const { app } = require('../src/server');
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  clientId = ChannelKey.generateClientId('uzum');
  clientSecret = ChannelKey.generateKey('uzum', 'oauth');
  const shape = ChannelKey.describeKey(clientSecret);
  await ChannelKey().create({
    channel: 'uzum',
    kind: 'oauth',
    clientId,
    hash: ChannelKey.hashKey(clientSecret),
    prefix: shape.prefix,
    last4: shape.last4,
    active: true,
  });

  await seedCatalogue();
});

test.after(async () => {
  server?.close();
  await db?.disconnect();
  await mongod?.stop();
  fs.rmSync(UPLOADS, { recursive: true, force: true });
});

/** A real file on disk — the image hash is computed from the bytes. */
function writeImage(name, contents) {
  fs.writeFileSync(path.join(UPLOADS, name), contents);
  return `/uploads/${name}`;
}

const PHOTO = Buffer.from('a-real-jpeg-would-go-here');
const PHOTO_SHA1 = crypto.createHash('sha1').update(PHOTO).digest('hex');

async function seedCatalogue() {
  const cards = db.getConnection().collection('products');

  await BillzProduct().insertMany([
    { billzProductId: 'bp-1', name: 'Fertilaid', sku: 'SKU-1', barcode: '111', stock: 10, reservedQty: 0, pendingQty: 0, measurementUnit: 'шт' },
    { billzProductId: 'bp-2', name: 'MotilityBoost', sku: 'SKU-2', barcode: '222', stock: 4, reservedQty: 0, pendingQty: 0, measurementUnit: 'шт' },
    { billzProductId: 'bp-3', name: 'No photo', sku: 'SKU-3', barcode: '333', stock: 7, reservedQty: 0, pendingQty: 0, measurementUnit: 'шт' },
  ]);

  const image = writeImage('one.jpg', PHOTO);

  await cards.insertMany([
    {
      name: 'Fertilaid', category: 'Erkaklar', sku: 'SKU-1', barcode: '111',
      billzProductId: 'bp-1', imageUrl: image, images: [],
      mxikCode: '01234567890123456',
      channels: { uzum: { enabled: true, price: 300000, oldPrice: 350000, forceStatus: 'auto', minStock: 0 } },
    },
    {
      name: 'MotilityBoost', category: 'Erkaklar', sku: 'SKU-2', barcode: '222',
      billzProductId: 'bp-2', imageUrl: image, images: [],
      channels: { uzum: { enabled: true, price: 250000, forceStatus: 'auto', minStock: 1 } },
    },
    {
      // No image: Uzum renders a picture per line, so this must be held back.
      name: 'No photo', category: 'Ayollar', sku: 'SKU-3', barcode: '333',
      billzProductId: 'bp-3', imageUrl: '', images: [],
      channels: { uzum: { enabled: true, price: 100000, forceStatus: 'auto', minStock: 0 } },
    },
  ]);
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

async function tokenRequest(body, headers = {}) {
  const res = await fetch(`${base}/uzum/security/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(body).toString(),
  });
  const result = { status: res.status, type: res.headers.get('content-type'), body: await res.json().catch(() => null) };
  response('/security/oauth/token', 'post', result);
  return result;
}

let bearer = null;
async function token() {
  if (bearer) return bearer;
  const res = await tokenRequest({
    grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret,
  });
  bearer = res.body.access_token;
  return bearer;
}

async function api(method, pathname, { body, prefix = '/uzum/v1', auth = true, contentType = 'application/json', raw } = {}) {
  const headers = { 'Content-Type': contentType };
  if (auth) headers.Authorization = `Bearer ${await token()}`;
  const res = await fetch(`${base}${prefix}${pathname}`, {
    method,
    headers,
    ...(raw !== undefined ? { body: raw } : body ? { body: JSON.stringify(body) } : {}),
  });
  const responseText = await res.text();
  const result = {
    status: res.status,
    type: res.headers.get('content-type') || '',
    body: responseText === '' ? null : JSON.parse(responseText),
    raw: responseText,
  };
  const route = pathname.startsWith('/nomenclature/') ? pathname.replace(/^\/nomenclature\/[^/]+/, '/v1/nomenclature/{storeId}') : pathname.replace(/^\/order\/[^/]+/, '/order/{orderId}');
  if (route.startsWith('/order') || route.startsWith('/v1/nomenclature')) response(route, method, result);
  return result;
}

/* ── OAuth ───────────────────────────────────────────────────────────────── */

test('valid client credentials produce a bearer token', async () => {
  const res = await tokenRequest({
    grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.token_type, 'bearer');
  assert.equal(res.body.scope, 'read write');
  assert.ok(res.body.expires_in > 0);
  assert.match(res.body.access_token, /^[\w-]+\.[\w-]+$/);
});

test('HTTP Basic works as well as form fields', async () => {
  // The OAuth2 spec allows both and Uzum's examples use Basic. Rejecting one
  // fails an integrator for a reason no error message explains.
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await tokenRequest(
    { grant_type: 'client_credentials' },
    { Authorization: `Basic ${basic}` }
  );

  assert.equal(res.status, 200);
  assert.ok(res.body.access_token);
});

test('a wrong secret and an unknown client id fail identically', async () => {
  // Distinguishing them tells an attacker which client ids exist.
  const wrongSecret = await tokenRequest({
    grant_type: 'client_credentials', client_id: clientId, client_secret: 'fhu_o_' + 'x'.repeat(43),
  });
  const unknownClient = await tokenRequest({
    grant_type: 'client_credentials', client_id: 'fhu_id_nope', client_secret: clientSecret,
  });

  assert.equal(wrongSecret.status, 401);
  assert.equal(unknownClient.status, 401);
  assert.deepEqual(wrongSecret.body, unknownClient.body);
  schema('ErrorListV1', wrongSecret.body);
});

test('another grant type is refused', async () => {
  const res = await tokenRequest({
    grant_type: 'password', client_id: clientId, client_secret: clientSecret,
  });
  assert.equal(res.status, 400);
  schema('ErrorListV1', res.body);
});

test('catalogue endpoints refuse an unauthenticated caller', async () => {
  const res = await api('GET', '/nomenclature/store-uz-1/composition', { auth: false });
  assert.equal(res.status, 401);
  assert.ok(Array.isArray(res.body), 'errors are an array, not an object');
  assert.equal(res.body[0].code, 401);
});

test('a tampered token is refused', async () => {
  const good = await token();
  const [payload] = good.split('.');
  const forged = `${payload}.${'x'.repeat(43)}`;

  const res = await fetch(`${base}/uzum/v1/nomenclature/store-uz-1/composition`, {
    headers: { Authorization: `Bearer ${forged}` },
  });
  assert.equal(res.status, 401);
});

test('revoking the key kills tokens already issued', async () => {
  // The token carries no server-side session, so it is re-checked against the
  // key on every call. A token store would keep working until it expired.
  const secret = ChannelKey.generateKey('uzum', 'oauth');
  const id = ChannelKey.generateClientId('uzum');
  const shape = ChannelKey.describeKey(secret);
  const record = await ChannelKey().create({
    channel: 'uzum', kind: 'oauth', clientId: id, hash: ChannelKey.hashKey(secret),
    prefix: shape.prefix, last4: shape.last4, active: true,
  });

  const issued = await tokenRequest({
    grant_type: 'client_credentials', client_id: id, client_secret: secret,
  });
  const live = await fetch(`${base}/uzum/v1/restaurants`, {
    headers: { Authorization: `Bearer ${issued.body.access_token}` },
  });
  assert.equal(live.status, 200);

  await ChannelKey().updateOne({ _id: record._id }, { $set: { active: false } });

  const dead = await fetch(`${base}/uzum/v1/restaurants`, {
    headers: { Authorization: `Bearer ${issued.body.access_token}` },
  });
  assert.equal(dead.status, 401, 'a revoked key must not keep working until expiry');
});

/* ── Both prefixes ───────────────────────────────────────────────────────── */

test('every route answers with and without the /v1 prefix', async () => {
  const withV1 = await api('GET', '/nomenclature/store-uz-1/composition', { prefix: '/uzum/v1' });
  const without = await api('GET', '/nomenclature/store-uz-1/composition', { prefix: '/uzum' });

  assert.equal(withV1.status, 200);
  assert.equal(without.status, 200);
  assert.deepEqual(withV1.body, without.body);
});

/* ── Nomenclature ────────────────────────────────────────────────────────── */

test('the composition carries the versioned content type their client expects', async () => {
  const res = await api('GET', '/nomenclature/store-uz-1/composition');
  assert.equal(res.status, 200);
  assert.match(res.type, /application\/vnd\.eda\.picker\.nomenclature\.v1\+json/);
});

test('a product without a usable image is held back', async () => {
  // Uzum renders a picture per line. Sending an empty images array shows a
  // customer an empty tile.
  const res = await api('GET', '/nomenclature/store-uz-1/composition');
  const ids = res.body.items.map((i) => i.id);

  assert.deepEqual(ids.sort(), ['bp-1', 'bp-2']);
});

test('images carry a SHA-1 of the actual bytes and an absolute URL', async () => {
  const res = await api('GET', '/nomenclature/store-uz-1/composition');
  const item = res.body.items.find((i) => i.id === 'bp-1');

  assert.equal(item.images.length, 1);
  assert.equal(item.images[0].hash, PHOTO_SHA1);
  assert.equal(item.images[0].url, 'https://cdn.fairhaven.test/uploads/one.jpg');
});

test('a product uses its own MXIK code, and falls back to the default', async () => {
  const res = await api('GET', '/nomenclature/store-uz-1/composition');
  const own = res.body.items.find((i) => i.id === 'bp-1');
  const fallback = res.body.items.find((i) => i.id === 'bp-2');

  assert.equal(own.serviceCodesUz.mxikCodeUz, '01234567890123456');
  assert.equal(fallback.serviceCodesUz.mxikCodeUz, '02106999028000000');
});

test('the MXIK default can be changed from the panel without a deploy', async () => {
  // The literal key the admin panel writes. Asserting the same near-miss the
  // reader makes would prove nothing — this is the whole point of the test.
  const PANEL_KEY = 'channels.defaultMxikCode';
  await db.getConnection().collection('settings')
    .insertOne({ key: PANEL_KEY, value: '09999999999999999' });
  SettingView.clearCache();

  const res = await api('GET', '/nomenclature/store-uz-1/composition');
  const fallback = res.body.items.find((i) => i.id === 'bp-2');
  assert.equal(fallback.serviceCodesUz.mxikCodeUz, '09999999999999999');

  await db.getConnection().collection('settings').deleteMany({ key: PANEL_KEY });
  SettingView.clearCache();
});

test('an old price is only sent when it is genuinely higher', async () => {
  const res = await api('GET', '/nomenclature/store-uz-1/composition');
  const withOld = res.body.items.find((i) => i.id === 'bp-1');
  const without = res.body.items.find((i) => i.id === 'bp-2');

  assert.equal(withOld.oldPrice, 350000);
  assert.equal('oldPrice' in without, false);
});

test('categories come from the shop, and every item points at one', async () => {
  const res = await api('GET', '/nomenclature/store-uz-1/composition');
  const ids = new Set(res.body.categories.map((c) => c.id));

  assert.ok(res.body.categories.length > 0);
  assert.ok(res.body.items.every((item) => ids.has(item.categoryId)));
});

test('availability publishes stock minus the cushion held back', async () => {
  const res = await api('GET', '/nomenclature/store-uz-1/availability');

  assert.match(res.type, /application\/vnd\.eda\.picker\.availability\.v1\+json/);
  const row = res.body.items.find((i) => i.id === 'bp-2');
  // 4 in Billz, minStock 1 → 3 sellable.
  assert.equal(row.stock, 3);
  assert.equal(Object.hasOwn(row, 'available'), false);
});

test('another store id is refused rather than served our catalogue', async () => {
  const res = await api('GET', '/nomenclature/somebody-else/composition');
  assert.equal(res.status, 404);
  assert.ok(Array.isArray(res.body));
});

test('weighted listings are excluded consistently from both catalogue feeds', async () => {
  await BillzProduct().updateOne({ billzProductId: 'bp-2' }, { $set: { measurementUnit: 'kg' } });
  try {
    for (const endpoint of ['composition', 'availability']) {
      const res = await api('GET', `/nomenclature/store-uz-1/${endpoint}`);
      assert.equal(res.status, 200);
      assert.ok(!res.body.items.some((item) => item.id === 'bp-2'));
    }
  } finally { await BillzProduct().updateOne({ billzProductId: 'bp-2' }, { $set: { measurementUnit: 'шт' } }); }
});

/* ── Orders ──────────────────────────────────────────────────────────────── */

const ORDER = {
  eatsId: 'UZ-1001', comment: 'Leave sealed', promos: [], restaurantId: 'store-uz-1',
  items: [{ id: 'bp-1', quantity: 2, price: 300000, modifications: [], promos: [], labelCodes: [] }],
  paymentInfo: { paymentType: 'CARD', itemsCost: 600000 },
  deliveryInfo: { clientName: 'Ali', clientPhoneNumber: '+998900000000', phoneNumber: '+998911111111', courierArrivementDate: '2026-09-06T10:00:00.000Z' },
};
const settle = () => new Promise((r) => setTimeout(r, 150));

test('vendor JSON works on both mounts; GET preserves documented snapshot and buyer phone', async () => {
  for (const prefix of ['/uzum', '/uzum/v1']) {
    const res = await api('POST', '/order', { prefix, body: ORDER, contentType: 'application/vnd.eats.order.v2+json' });
    assert.equal(res.status, 200);
    assert.match(res.type, /^application\/json/);
    const read = await api('GET', `/order/${res.body.orderId}`, { prefix });
    assert.equal(read.status, 200);
    schema('YGroceryOrderV2', read.body);
    assert.deepEqual(read.body, ORDER);
  }
  await settle();
  const stored = await ChannelOrder().findOne({ externalId: ORDER.eatsId }).lean();
  assert.equal(stored.customer.phone, ORDER.deliveryInfo.clientPhoneNumber);
  assert.equal(stored.customer.name, 'Ali');
  assert.equal(reserveCalls, 1);
});

test('duplicate after delisting keeps original id without another reservation', async () => {
  const first = await api('POST', '/order', { body: ORDER });
  const cards = db.getConnection().collection('products');
  await cards.updateOne({ billzProductId: 'bp-1' }, { $set: { 'channels.uzum.enabled': false } });
  try {
    const again = await api('POST', '/order', { body: ORDER });
    assert.equal(again.status, 200);
    assert.equal(again.body.orderId, first.body.orderId);
    assert.equal(reserveCalls, 1);
  } finally { await cards.updateOne({ billzProductId: 'bp-1' }, { $set: { 'channels.uzum.enabled': true } }); }
});

test('bad order bodies leave stock and orders untouched', async () => {
  const before = await BillzProduct().findOne({ billzProductId: 'bp-1' }).lean();
  const count = await ChannelOrder().countDocuments();
  const invalid = [
    { ...ORDER, restaurantId: 'other' },
    { ...ORDER, eatsId: { $ne: null } },
    { ...ORDER, eatsId: 'bad-shape', promos: undefined },
    { ...ORDER, eatsId: 'bad-price', items: [{ ...ORDER.items[0], price: 1 }] },
    { ...ORDER, eatsId: 'bad-qty', items: [{ ...ORDER.items[0], quantity: 0.5 }] },
    { ...ORDER, eatsId: 'bad-total', paymentInfo: { paymentType: 'CARD', itemsCost: 1 } },
    { ...ORDER, eatsId: 'bad-promo', promos: [{ type: 'FIXED', discount: 1 }] },
    { ...ORDER, eatsId: 'bad-modifier', items: [{ ...ORDER.items[0], modifications: [{ id: 'extra', price: 1, quantity: 1 }] }] },
    { ...ORDER, eatsId: 'bad-fields', internalOrderId: 'injected' },
  ];
  for (const body of invalid) {
    const res = await api('POST', '/order', { body });
    assert.ok([400, 422].includes(res.status), JSON.stringify(res));
  }
  const malformed = await api('POST', '/order', { raw: '{"eatsId":', contentType: 'application/vnd.eats.order.v2+json' });
  assert.equal(malformed.status, 400);
  assert.equal(await ChannelOrder().countDocuments(), count);
  const after = await BillzProduct().findOne({ billzProductId: 'bp-1' }).lean();
  assert.equal(after.stock, before.stock);
  assert.equal(after.reservedQty, before.reservedQty);
  const config = require('../src/config');
  const store = config.uzum.storeId;
  config.uzum.storeId = '';
  try { assert.equal((await api('POST', '/order', { body: ORDER })).status, 503); }
  finally { config.uzum.storeId = store; }
});

test('order auth uses reason object; catalogue auth uses array', async () => {
  for (const [method, pathname] of [['POST', '/order'], ['GET', '/order/id'], ['GET', '/order/id/status'], ['PUT', '/order/id'], ['DELETE', '/order/id']]) {
    const res = await api(method, pathname, { auth: false, body: method === 'GET' ? undefined : ORDER });
    assert.equal(res.status, 401);
    assert.equal(typeof res.body.reason, 'string');
  }
});

test('PUT rejects both composition and fake status callbacks without stock effects', async () => {
  const before = await BillzProduct().findOne({ billzProductId: 'bp-1' }).lean();
  for (const body of [ORDER, { status: 'DELIVERED' }, { status: 'CANCELLED' }, { status: 'TAKEN_BY_COURIER' }]) {
    assert.equal((await api('PUT', '/order/UZ-1001', { body })).status, 422);
  }
  assert.equal(saleCalls, 0);
  assert.equal(reserveCalls, 1);
  const after = await BillzProduct().findOne({ billzProductId: 'bp-1' }).lean();
  assert.equal(after.reservedQty, before.reservedQty);
  assert.equal((await api('GET', '/order/UZ-1001/status')).body.status, 'ACCEPTED_BY_RESTAURANT');
});

test('DELETE requires matching eatsId and cancels idempotently', async () => {
  const before = (await BillzProduct().findOne({ billzProductId: 'bp-1' }).lean()).reservedQty;
  for (const body of [{}, { eatsId: 'wrong' }, { eatsId: { $ne: null } }]) {
    assert.equal((await api('DELETE', '/order/UZ-1001', { body })).status, 400);
  }
  assert.equal((await BillzProduct().findOne({ billzProductId: 'bp-1' }).lean()).reservedQty, before);
  for (let i = 0; i < 2; i++) {
    const res = await api('DELETE', '/order/UZ-1001', { body: { eatsId: ORDER.eatsId, comment: 'out of area' } });
    assert.equal(res.status, 200);
    assert.equal(res.raw, '');
    assert.equal(res.body, null);
    assert.equal(res.type, '');
  }
  assert.equal(deleteCalls, 1);
  assert.equal((await BillzProduct().findOne({ billzProductId: 'bp-1' }).lean()).reservedQty, 0);
  assert.equal((await api('GET', '/order/UZ-1001/status')).body.status, 'CANCELLED');
});

test('an unknown endpoint answers in their error shape, not an HTML page', async () => {
  const res = await api('GET', '/nonsense');
  assert.equal(res.status, 404);
  assert.ok(Array.isArray(res.body));
  assert.equal(res.body[0].code, 404);
});

/* ── Credentials Uzum issues to us ───────────────────────────────────────── */

async function importCreds(body) {
  const res = await fetch(`${base}/internal/keys/import`, {
    method: 'POST',
    headers: {
      'X-Internal-Token': process.env.CHANNEL_INTERNAL_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test('credentials Uzum sends us authenticate exactly as given', async () => {
  // The direction matters: their manager mails a client_id and client_secret
  // of their own choosing, and their system presents exactly those values.
  // Generating our own pair produces credentials nobody will ever send.
  const theirs = { clientId: 'uzum-partner-4821', clientSecret: 'S3cret-Uzum-Provided-Value-2026' };

  const imported = await importCreds({ channel: 'uzum', ...theirs });
  assert.equal(imported.status, 200);
  assert.equal(imported.body.clientId, theirs.clientId);
  assert.equal('clientSecret' in imported.body, false, 'the secret is never echoed back');

  const token = await tokenRequest({
    grant_type: 'client_credentials',
    client_id: theirs.clientId,
    client_secret: theirs.clientSecret,
  });
  assert.equal(token.status, 200);
  assert.ok(token.body.access_token, 'their pair must mint a bearer token');
});

test('importing the same client_id twice is refused, not shadowed', async () => {
  // A silent second record would survive the revocation of the first.
  const again = await importCreds({
    channel: 'uzum', clientId: 'uzum-partner-4821', clientSecret: 'different-secret-value',
  });
  assert.equal(again.status, 409);
});

test('medicalka credentials cannot be imported — we issue those', async () => {
  const res = await importCreds({
    channel: 'medicalka', clientId: 'x-client', clientSecret: 'x-secret-value',
  });
  assert.equal(res.status, 422);
});

test('concurrent exact and conflicting retries recheck the core acceptance winner', async () => {
  const orders = require('../src/core/orders');
  const originalAccept = orders.acceptOrder;
  for (const conflicting of [false, true]) {
    const eatsId = `UZ-RACE-${conflicting}`;
    const body = { ...ORDER, eatsId, items: [{ ...ORDER.items[0], quantity: 1 }], paymentInfo: { ...ORDER.paymentInfo, itemsCost: 300000 } };
    const before = reserveCalls;
    let arrivals = 0;
    let release;
    const ready = new Promise((resolve) => { release = resolve; });
    const outcomes = [];
    // Both HTTP handlers must pass their initial lookup before core acceptance.
    orders.acceptOrder = async (channel, input) => {
      if (input.externalId !== eatsId) return originalAccept(channel, input);
      arrivals++;
      if (arrivals === 2) release();
      await ready;
      const result = await originalAccept(channel, input);
      outcomes.push(result.created);
      return result;
    };
    try {
      const responses = await Promise.all([
        api('POST', '/order', { body }),
        api('POST', '/order', { body: conflicting ? { ...body, comment: 'different instructions' } : body }),
      ]);
      assert.deepEqual(outcomes.sort(), [false, true]);
      assert.deepEqual(responses.map((res) => res.status).sort(), conflicting ? [200, 422] : [200, 200]);
      if (!conflicting) assert.equal(responses[0].body.orderId, responses[1].body.orderId);
      await settle();
      assert.equal(reserveCalls, before + 1);
      assert.equal(await ChannelOrder().countDocuments({ channel: 'uzum', externalId: eatsId }), 1);
      await api('DELETE', `/order/${eatsId}`, { body: { eatsId } });
    } finally {
      release();
      orders.acceptOrder = originalAccept;
    }
  }
});
