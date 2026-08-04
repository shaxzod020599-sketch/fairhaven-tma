const assert = require('node:assert/strict');
const test = require('node:test');

process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'shop-a';
process.env.MONGO_DB_NAME = 'mk-tax-test';
process.env.SYNC_ON_BOOT = 'false';
process.env.CHANNEL_TELEGRAM_ENABLED = 'false';
process.env.DISABLE_RATE_LIMIT = 'true';

let mongod;
let db;
let server;
let base;
let token;

/**
 * The fiscal codes over HTTP, not just through the serialiser.
 *
 * Medicalka needs `ikpu` and `package_code` on every product they read, and
 * those values come from three places that have to line up: the product's own
 * fields, the operator's defaults in the `settings` collection the admin panel
 * writes, and the build-time constants. A unit test on the serialiser proves
 * the shape; only the route proves the wiring.
 */
test.before(async () => {
  const { MongoMemoryServer } = require(
    '../../backend/node_modules/mongodb-memory-server'
  );
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();

  db = require('../src/db');
  await db.connect();

  const BillzProduct = require('../src/models/BillzProduct');
  const ChannelKey = require('../src/models/ChannelKey');

  const key = ChannelKey.generateKey('medicalka', 'token');
  const shape = ChannelKey.describeKey(key);
  await ChannelKey().create({
    channel: 'medicalka', kind: 'token', hash: ChannelKey.hashKey(key),
    prefix: shape.prefix, last4: shape.last4, active: true,
  });
  token = key;

  await BillzProduct().create({
    billzProductId: 'bp-own', name: 'Со своими кодами', stock: 10,
    reservedQty: 0, pendingQty: 0, medicalkaId: 601,
  });
  await BillzProduct().create({
    billzProductId: 'bp-default', name: 'Без своих кодов', stock: 10,
    reservedQty: 0, pendingQty: 0, medicalkaId: 602,
  });

  const products = db.getConnection().collection('products');
  await products.insertOne({
    name: 'Со своими кодами', category: 'vitamins', billzProductId: 'bp-own',
    mxikCode: '02106999028000001', packageCode: '1490780',
    channels: { medicalka: { enabled: true, price: 300000, forceStatus: 'auto', minStock: 0 } },
  });
  await products.insertOne({
    name: 'Без своих кодов', category: 'vitamins', billzProductId: 'bp-default',
    mxikCode: '', packageCode: '',
    channels: { medicalka: { enabled: true, price: 400000, forceStatus: 'auto', minStock: 0 } },
  });

  // What the admin panel writes when an operator saves the shop-wide defaults.
  await db.getConnection().collection('settings').insertMany([
    { key: 'channels.defaultMxikCode', value: '02106999028000000' },
    { key: 'channels.defaultPackageCode', value: '1490779' },
  ]);

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

const get = async (path) => {
  const url = `${base}${path}${path.includes('?') ? '&' : '?'}token=${token}`;
  const res = await fetch(url);
  return { status: res.status, body: await res.json().catch(() => null) };
};

const byId = (items, id) => items.find((item) => item.id === id);

test('GET /products carries both fiscal codes on every row', async () => {
  const res = await get('/products');

  assert.equal(res.status, 200);
  assert.equal(res.body.items.length, 2);

  const own = byId(res.body.items, 601);
  assert.equal(own.ikpu, '02106999028000001');
  assert.equal(own.package_code, '1490780');

  const fallback = byId(res.body.items, 602);
  assert.equal(fallback.ikpu, '02106999028000000');
  assert.equal(fallback.package_code, '1490779');
});

test('GET /products/search carries them too', async () => {
  const res = await get('/products/search?q=кодов');

  assert.equal(res.status, 200);
  assert.equal(res.body.items.length > 0, true);
  for (const item of res.body.items) {
    assert.match(item.ikpu, /^\d+$/);
    assert.match(item.package_code, /^\d+$/);
  }
});

test('GET /products/{id} carries them too', async () => {
  const res = await get('/products/601');

  assert.equal(res.status, 200);
  assert.equal(res.body.ikpu, '02106999028000001');
  assert.equal(res.body.package_code, '1490780');
});

test('an unreadable settings collection does not take the catalogue down', async () => {
  // `settings` belongs to the bot backend. A blip there used to be invisible to
  // Medicalka; after fiscal codes it must stay that way — the feed falls back
  // to the compiled codes rather than returning 500 to a partner poll.
  const SettingView = require('../src/models/SettingView');
  SettingView.clearCache();
  const real = SettingView.readSettings;
  SettingView.readSettings = async () => { throw new Error('settings unavailable'); };

  try {
    const list = await get('/products');
    assert.equal(list.status, 200);
    assert.equal(list.body.items.length, 2);
    // The product with its own codes is unaffected either way.
    assert.equal(byId(list.body.items, 601).ikpu, '02106999028000001');
    // The one relying on the shop default gets the compiled constants.
    assert.equal(byId(list.body.items, 602).ikpu, '02106999028000000');
    assert.equal(byId(list.body.items, 602).package_code, '1490779');

    assert.equal((await get('/products/601')).status, 200);
    assert.equal((await get('/products/search?q=кодов')).status, 200);
    assert.equal((await get('/inventory')).status, 200);
  } finally {
    SettingView.readSettings = real;
    SettingView.clearCache();
  }
});

test('changing the default in the panel changes what the feed sends', async () => {
  await db.getConnection().collection('settings').updateOne(
    { key: 'channels.defaultPackageCode' },
    { $set: { value: '1490999' } }
  );
  // The settings view caches for 30s so a feed poll is not a query per product.
  require('../src/models/SettingView').clearCache();

  const res = await get('/products');

  assert.equal(byId(res.body.items, 602).package_code, '1490999');
  // A product with its own code is unaffected by the default.
  assert.equal(byId(res.body.items, 601).package_code, '1490780');
});
