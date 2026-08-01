const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const UPLOADS = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-uploads-'));

process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'shop-a';
process.env.BILLZ_CASHBOX_ID = 'till-1';
process.env.BILLZ_PAYMENT_TYPE_ID = 'pt-transfer';
process.env.MONGO_DB_NAME = 'uzum-test';
process.env.SYNC_ON_BOOT = 'false';
process.env.CHANNEL_TELEGRAM_ENABLED = 'false';
process.env.DISABLE_RATE_LIMIT = 'true';

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
    '/Users/tm/Projects/project vitamin delivery/backend/node_modules/mongodb-memory-server'
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
  sale.reserveOrder = async () => ({ orderId: 'draft-uz', orderNumber: '77' });
  sale.completeSale = async () => ({});
  sale.releaseReservation = async () => ({});

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
  await db.disconnect();
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
  return { status: res.status, body: await res.json().catch(() => null) };
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

async function api(method, pathname, { body, prefix = '/uzum/v1', auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${await token()}`;
  const res = await fetch(`${base}${prefix}${pathname}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: res.status,
    type: res.headers.get('content-type') || '',
    body: await res.json().catch(() => null),
  };
}

/* ── OAuth ───────────────────────────────────────────────────────────────── */

test('valid client credentials produce a bearer token', async () => {
  const res = await tokenRequest({
    grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.token_type, 'bearer');
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
  assert.equal(wrongSecret.body.error, 'invalid_client');
});

test('another grant type is refused', async () => {
  const res = await tokenRequest({
    grant_type: 'password', client_id: clientId, client_secret: clientSecret,
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'unsupported_grant_type');
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
  await db.getConnection().collection('settings')
    .insertOne({ key: 'defaultMxikCode', value: '09999999999999999' });
  SettingView.clearCache();

  const res = await api('GET', '/nomenclature/store-uz-1/composition');
  const fallback = res.body.items.find((i) => i.id === 'bp-2');
  assert.equal(fallback.serviceCodesUz.mxikCodeUz, '09999999999999999');

  await db.getConnection().collection('settings').deleteMany({ key: 'defaultMxikCode' });
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
  assert.equal(row.available, true);
});

test('another store id is refused rather than served our catalogue', async () => {
  const res = await api('GET', '/nomenclature/somebody-else/composition');
  assert.equal(res.status, 404);
  assert.ok(Array.isArray(res.body));
});

/* ── Orders ──────────────────────────────────────────────────────────────── */

const ORDER = {
  eatsId: 'UZ-1001',
  items: [{ id: 'bp-1', quantity: 2, price: 1 }],
  customer: { name: 'Ali', phone: '+998900000000' },
  deliveryAddress: 'Toshkent',
};

test('an order is accepted and answered before Billz is touched', async () => {
  // Uzum cancels an order it has not seen acknowledged within fifteen minutes.
  const res = await api('POST', '/order', { body: ORDER });

  assert.equal(res.status, 200);
  assert.equal(res.body.result, 'OK');
  assert.ok(res.body.orderId);
  assert.match(res.type, /application\/vnd\.eats\.order\.v2\+json/);
});

test('the price comes from our catalogue, never from their payload', async () => {
  await new Promise((r) => setTimeout(r, 200));
  const stored = await ChannelOrder().findOne({ externalId: 'UZ-1001' }).lean();

  assert.equal(stored.items[0].unitPrice, 300000);
  assert.notEqual(stored.items[0].unitPrice, 1);
});

test('a resent order returns the same id and does not reserve twice', async () => {
  const first = await api('POST', '/order', { body: ORDER });
  const second = await api('POST', '/order', { body: { ...ORDER } });

  assert.equal(second.status, 200);
  assert.equal(second.body.orderId, first.body.orderId);
  assert.equal(await ChannelOrder().countDocuments({ externalId: 'UZ-1001' }), 1);
});

test('an order for an unavailable product is refused with a reason', async () => {
  const res = await api('POST', '/order', {
    body: { ...ORDER, eatsId: 'UZ-404', items: [{ id: 'bp-nope', quantity: 1 }] },
  });

  assert.equal(res.status, 404);
  assert.ok(Array.isArray(res.body));
  assert.match(res.body[0].description, /bp-nope/);
});

test('an order with no items is refused', async () => {
  const res = await api('POST', '/order', { body: { eatsId: 'UZ-EMPTY', items: [] } });
  assert.equal(res.status, 400);
});

test('an order with no eatsId is refused — it is the idempotency key', async () => {
  const res = await api('POST', '/order', { body: { items: ORDER.items } });
  assert.equal(res.status, 400);
  assert.match(res.body[0].description, /eatsId/);
});

test('the status reported is the furthest one our record can justify', async () => {
  await new Promise((r) => setTimeout(r, 200));
  const res = await api('GET', '/order/UZ-1001/status');

  assert.equal(res.status, 200);
  // Reserved in Billz — this is the acknowledgement their deadline waits for.
  assert.equal(res.body.status, 'ACCEPTED_BY_RESTAURANT');
});

test('an order can be read back by either id', async () => {
  const byExternal = await api('GET', '/order/UZ-1001');
  const byInternal = await api('GET', `/order/${byExternal.body.orderId}`);

  assert.equal(byExternal.status, 200);
  assert.equal(byInternal.body.eatsId, 'UZ-1001');
  assert.equal(byInternal.body.items[0].id, 'bp-1');
});

test('an unknown status is refused rather than treated as an acknowledgement', async () => {
  // Silently accepting it would swallow a real state change.
  const res = await api('PUT', '/order/UZ-1001', { body: { status: 'ON_FIRE' } });
  assert.equal(res.status, 400);
  assert.match(res.body[0].description, /ON_FIRE/);
});

test('courier states are acknowledged without touching stock', async () => {
  const before = (await BillzProduct().findOne({ billzProductId: 'bp-1' }).lean()).reservedQty;
  const res = await api('PUT', '/order/UZ-1001', { body: { status: 'TAKEN_BY_COURIER' } });
  const after = (await BillzProduct().findOne({ billzProductId: 'bp-1' }).lean()).reservedQty;

  assert.equal(res.status, 200);
  assert.equal(after, before);
});

test('DELIVERED completes the sale and hands the reservation back', async () => {
  const held = (await BillzProduct().findOne({ billzProductId: 'bp-1' }).lean()).reservedQty;
  assert.equal(held, 2);

  const res = await api('PUT', '/order/UZ-1001', { body: { status: 'DELIVERED' } });

  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'DELIVERED');
  const after = (await BillzProduct().findOne({ billzProductId: 'bp-1' }).lean()).reservedQty;
  assert.equal(after, 0, 'Billz takes the stock at payment — holding it too would double-count');
});

test('cancelling a delivered order is refused, not silently accepted', async () => {
  const res = await api('DELETE', '/order/UZ-1001', { body: { comment: 'changed mind' } });
  assert.equal(res.status, 409);
  assert.match(res.body[0].description, /already sold/i);
});

test('DELETE cancels an open order and returns its units', async () => {
  await api('POST', '/order', { body: { ...ORDER, eatsId: 'UZ-1002' } });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal((await BillzProduct().findOne({ billzProductId: 'bp-1' }).lean()).reservedQty, 2);

  const res = await api('DELETE', '/order/UZ-1002', { body: { comment: 'out of area' } });

  assert.equal(res.status, 200);
  assert.equal(res.body.result, 'OK');
  assert.equal((await BillzProduct().findOne({ billzProductId: 'bp-1' }).lean()).reservedQty, 0);
});

test('a cancelled order reports CANCELLED', async () => {
  const res = await api('GET', '/order/UZ-1002/status');
  assert.equal(res.body.status, 'CANCELLED');
});

test('an unknown endpoint answers in their error shape, not an HTML page', async () => {
  const res = await api('GET', '/nonsense');
  assert.equal(res.status, 404);
  assert.ok(Array.isArray(res.body));
  assert.equal(res.body[0].code, 404);
});
