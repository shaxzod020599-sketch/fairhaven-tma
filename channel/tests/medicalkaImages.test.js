const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const UPLOADS = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-mk-uploads-'));

process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'shop-a';
process.env.MONGO_DB_NAME = 'mk-images-test';
process.env.SYNC_ON_BOOT = 'false';
process.env.CHANNEL_TELEGRAM_ENABLED = 'false';
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.UPLOADS_DIR = UPLOADS;
process.env.PUBLIC_IMAGE_BASE_URL = 'https://mini.fairhaven.uz';

let mongod;
let db;
let server;
let base;
let token;

const PHOTO = Buffer.from('a-real-jpeg-would-go-here');
const PHOTO_SHA1 = crypto.createHash('sha1').update(PHOTO).digest('hex');
const SECOND = Buffer.from('a-second-picture');
const SECOND_SHA1 = crypto.createHash('sha1').update(SECOND).digest('hex');

/** A real file on disk — the hash has to come from the bytes, not the name. */
function writeImage(name, contents) {
  fs.writeFileSync(path.join(UPLOADS, name), contents);
  return `/uploads/${name}`;
}

/**
 * Product pictures over the Medicalka wire.
 *
 * Their catalogue call carried no image at all, so a pharmacy listing had a
 * name and a price and nothing to show. The pictures are ours (Billz forbids
 * serving from their CDN), they are the same files the shop uses, and each
 * carries the SHA-1 of its bytes so a consumer that caches can skip a download
 * it already has.
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

  for (const [id, mkId] of [['bp-photo', 801], ['bp-two', 802], ['bp-none', 803]]) {
    await BillzProduct().create({
      billzProductId: id, name: id, stock: 5,
      reservedQty: 0, pendingQty: 0, medicalkaId: mkId,
    });
  }

  const main = writeImage('main.jpg', PHOTO);
  const extra = writeImage('extra.jpg', SECOND);
  const channel = { medicalka: { enabled: true, price: 100000, forceStatus: 'auto', minStock: 0 } };
  const products = db.getConnection().collection('products');

  await products.insertOne({
    name: 'С фотографией', category: 'vitamins', billzProductId: 'bp-photo',
    imageUrl: main, images: [], channels: channel,
  });
  await products.insertOne({
    name: 'С двумя фотографиями', category: 'vitamins', billzProductId: 'bp-two',
    imageUrl: main, images: [extra], channels: channel,
  });
  await products.insertOne({
    name: 'Без фотографии', category: 'vitamins', billzProductId: 'bp-none',
    imageUrl: '', images: [], channels: channel,
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
  fs.rmSync(UPLOADS, { recursive: true, force: true });
});

const get = async (path) => {
  const url = `${base}${path}${path.includes('?') ? '&' : '?'}token=${token}`;
  const res = await fetch(url);
  return { status: res.status, body: await res.json().catch(() => null) };
};

const byId = (items, id) => items.find((item) => item.id === id);

test('a product carries an absolute image URL and the SHA-1 of its bytes', async () => {
  const res = await get('/products');
  assert.equal(res.status, 200);

  const item = byId(res.body.items, 801);
  assert.equal(item.images.length, 1);
  assert.equal(item.images[0].url, 'https://mini.fairhaven.uz/uploads/main.jpg');
  assert.equal(item.images[0].hash, PHOTO_SHA1);
});

test('the main image comes first, then the rest, with no duplicates', async () => {
  const item = byId((await get('/products')).body.items, 802);

  assert.deepEqual(item.images.map((i) => i.hash), [PHOTO_SHA1, SECOND_SHA1]);
});

test('a product with no picture reports an empty list, not a broken URL', async () => {
  const item = byId((await get('/products')).body.items, 803);

  assert.deepEqual(item.images, []);
});

test('search and the single-product call carry images too', async () => {
  const searched = await get('/products/search?q=фотографией');
  assert.equal(searched.status, 200);
  assert.equal(searched.body.items.every((i) => Array.isArray(i.images)), true);

  const one = await get('/products/801');
  assert.equal(one.status, 200);
  assert.equal(one.body.images[0].hash, PHOTO_SHA1);
});

test('no image URL ever points at Billz', async () => {
  // Billz forbids serving media from their CDN; every URL we publish is ours.
  const items = (await get('/products')).body.items;
  for (const item of items) {
    for (const image of item.images) {
      assert.match(image.url, /^https:\/\/mini\.fairhaven\.uz\/uploads\//);
    }
  }
});
