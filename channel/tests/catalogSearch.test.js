const test = require('node:test');
const assert = require('node:assert/strict');

process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'shop-a';
process.env.MONGO_DB_NAME = 'catalog-search-test';

/**
 * Search has to look wherever the published value came from.
 *
 * A listing publishes `barcode` as `card.barcode || mirror.barcode`, and in the
 * live shop no card carries one — all 25 are blank, while all 28 mirror rows
 * have theirs from Billz. Searching only the card therefore returned nothing
 * for every barcode the API had just published, and the integration guide
 * states barcode is searchable. An integrator matching their own catalogue on
 * barcode would have concluded we stock none of it.
 */

let mongod;
let db;
let ProductCard;
let BillzProduct;
let catalog;

const CHANNEL = 'medicalka';

test.before(async () => {
  const { MongoMemoryServer } = require(
    '/Users/tm/Projects/project vitamin delivery/backend/node_modules/mongodb-memory-server'
  );
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  db = require('../src/db');
  await db.connect();
  ProductCard = require('../src/models/ProductCard');
  BillzProduct = require('../src/models/BillzProduct');
  catalog = require('../src/core/catalog');
});

test.after(async () => {
  await db?.disconnect();
  await mongod?.stop();
});

// `products` belongs to the bot backend; channel-hub holds a read-only facade
// over it with no write methods at all, so fixtures go in through the driver.
const cards = () => db.getConnection().collection('products');

test.beforeEach(async () => {
  await cards().deleteMany({});
  await BillzProduct().deleteMany({});
});

/** A card exactly as the live shop stores one: sku and brand, never a barcode. */
async function publish({ name, sku = '', barcode = '', mirrorBarcode = '', mirrorName = '' }) {
  const billzProductId = `bp-${name}`;
  await cards().insertOne({
    name,
    brand: 'Fairhaven Health',
    sku,
    barcode,
    billzProductId,
    channels: { [CHANNEL]: { enabled: true, price: 352000, forceStatus: 'auto', minStock: 0 } },
  });
  await BillzProduct().create({
    billzProductId,
    name: mirrorName || name,
    barcode: mirrorBarcode,
    stock: 12,
    reservedQty: 0,
    pendingQty: 0,
  });
  return billzProductId;
}

const names = (page) => page.items.map(({ card }) => card.name);

test('a barcode carried only by the mirror is still searchable', async () => {
  await publish({ name: 'BabyDance', sku: 'FH-BD-10', mirrorBarcode: '896593002497' });
  await publish({ name: 'OvaBoost', sku: 'FH-OB-120', mirrorBarcode: '895749000851' });

  const page = await catalog.listForChannel(CHANNEL, { search: '896593002497' });

  assert.deepEqual(names(page), ['BabyDance']);
  assert.equal(page.total, 1);
});

test('the barcode a listing publishes is the one that finds it', async () => {
  const barcode = '896593002497';
  await publish({ name: 'BabyDance', sku: 'FH-BD-10', mirrorBarcode: barcode });

  const listed = await catalog.listForChannel(CHANNEL, {});
  const published = listed.items[0].card.barcode || listed.items[0].mirror.barcode;

  const found = await catalog.listForChannel(CHANNEL, { search: published });
  assert.equal(found.total, 1, `published barcode ${published} found nothing`);
});

test('a barcode on the card still wins and still matches', async () => {
  await publish({ name: 'BabyDance', barcode: '111', mirrorBarcode: '999' });

  assert.equal((await catalog.listForChannel(CHANNEL, { search: '111' })).total, 1);
});

test('search still matches name, brand and sku on the card', async () => {
  await publish({ name: 'BabyDance', sku: 'FH-BD-10', mirrorBarcode: '896593002497' });
  await publish({ name: 'OvaBoost', sku: 'FH-OB-120', mirrorBarcode: '895749000851' });

  assert.deepEqual(names(await catalog.listForChannel(CHANNEL, { search: 'babydance' })), ['BabyDance']);
  assert.deepEqual(names(await catalog.listForChannel(CHANNEL, { search: 'FH-OB' })), ['OvaBoost']);
  assert.equal((await catalog.listForChannel(CHANNEL, { search: 'Fairhaven Health' })).total, 2);
});

test('the Billz name is searchable even when the card is renamed for the shop', async () => {
  // The shop names cards in Russian; Billz holds the English name. A partner
  // searching the manufacturer's own wording found nothing.
  await publish({
    name: 'BabyDance ФЕРТИЛЬНАЯ СМАЗКА (10 одноразовые аппликаторы)',
    sku: 'FH-BD-10',
    mirrorName: 'Fairhaven BabyDance™ (10 applicators) №10',
    mirrorBarcode: '896593002497',
  });

  assert.equal((await catalog.listForChannel(CHANNEL, { search: 'applicators' })).total, 1);
});

test('an unpublished product stays hidden however it is searched for', async () => {
  const billzProductId = 'bp-hidden';
  await cards().insertOne({
    name: 'Secret', brand: 'Fairhaven Health', sku: 'FH-SEC', billzProductId,
    channels: { [CHANNEL]: { enabled: false, price: 352000 } },
  });
  await BillzProduct().create({ billzProductId, name: 'Secret', barcode: '777', stock: 5 });

  for (const term of ['777', 'Secret', 'FH-SEC']) {
    assert.equal((await catalog.listForChannel(CHANNEL, { search: term })).total, 0, `leaked via "${term}"`);
  }
});

test('a regex metacharacter in a barcode search is matched literally', async () => {
  await publish({ name: 'Odd', sku: 'FH-ODD', mirrorBarcode: '123.456' });
  await publish({ name: 'Decoy', sku: 'FH-DEC', mirrorBarcode: '123X456' });

  assert.deepEqual(names(await catalog.listForChannel(CHANNEL, { search: '123.456' })), ['Odd']);
});
