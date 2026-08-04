const assert = require('node:assert/strict');
const test = require('node:test');

process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
process.env.BILLZ_SECRET_TOKEN = process.env.BILLZ_SECRET_TOKEN || 'test-secret';
process.env.BILLZ_SHOP_ID = process.env.BILLZ_SHOP_ID || 'shop-a';

const S = require('../src/adapters/medicalka/serializers');
const catalog = require('../src/core/catalog');
const { generateKey, describeKey, hashKey } = require('../src/models/ChannelKey');

/**
 * Medicalka's client reads these fields with fixed expectations: `id` and
 * `total` as integers, `price` and `quantity` as decimal strings. A number
 * where a string belongs only surfaces as a parse error on their side.
 */

test('price and quantity serialise as fixed 2-decimal strings', () => {
  assert.equal(S.decimalString(749000), '749000.00');
  assert.equal(S.decimalString('600000'), '600000.00');
  assert.equal(S.decimalString(0), '0.00');
  assert.equal(S.decimalString(12.5), '12.50');
  assert.equal(S.decimalString(undefined), '0.00');
  assert.equal(S.decimalString('nonsense'), '0.00');
});

test('timestamps have seconds precision and no timezone suffix', () => {
  const out = S.timestamp(new Date('2026-07-08T19:45:54.123Z'));
  assert.equal(out, '2026-07-08T19:45:54');
  assert.match(S.timestamp('not a date'), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
});

test('a product carries an integer id and string price', () => {
  const payload = S.product({
    card: { name: 'Fairhaven OvaBoost, №120', brand: 'FAIRHAVEN HEALTH', barcode: '895749000851', updatedAt: new Date('2026-07-24T11:34:43Z') },
    mirror: { name: 'x', brandName: 'y', barcode: 'z' },
    medicalkaId: 25432,
    price: 600000,
  });

  assert.equal(typeof payload.id, 'number');
  assert.equal(Number.isInteger(payload.id), true);
  assert.equal(typeof payload.price, 'string');
  assert.equal(payload.price, '600000.00');
  assert.deepEqual(Object.keys(payload).sort(),
    ['barcode', 'id', 'ikpu', 'manufacturer', 'name', 'package_code', 'price', 'updated_at']);
});

/**
 * The fiscal codes end up on a customer's receipt, so "the field was there but
 * empty" and "the wrong product's code" are both filing problems. A product's
 * own code always wins; the operator's default only fills a blank.
 */
test('a product carries its own fiscal codes when it has them', () => {
  const payload = S.product({
    card: { name: 'OvaBoost', mxikCode: '02106999028000001', packageCode: '1490780' },
    mirror: {},
    medicalkaId: 1,
    price: 1,
    defaults: { mxikCode: '02106999028000000', packageCode: '1490779' },
  });

  assert.equal(payload.ikpu, '02106999028000001');
  assert.equal(payload.package_code, '1490780');
});

test('a product without its own codes falls back to the shop defaults', () => {
  const payload = S.product({
    card: { name: 'OvaBoost', mxikCode: '', packageCode: '' },
    mirror: {},
    medicalkaId: 1,
    price: 1,
    defaults: { mxikCode: '02106999028000000', packageCode: '1490779' },
  });

  assert.equal(payload.ikpu, '02106999028000000');
  assert.equal(payload.package_code, '1490779');
});

test('shop defaults come from the panel, falling back to the build constants', () => {
  assert.deepEqual(S.defaultsFrom({
    'channels.defaultMxikCode': '02106999028000002',
    'channels.defaultPackageCode': '1490781',
  }), { mxikCode: '02106999028000002', packageCode: '1490781' });

  assert.deepEqual(S.defaultsFrom({}),
    { mxikCode: '02106999028000000', packageCode: '1490779' });
});

test('an inventory row reports availability as always true', () => {
  const row = S.inventoryRow({ pharmacyId: 1, medicalkaId: 7, quantity: 20, price: 600000 });

  assert.equal(row.is_available, true);
  assert.equal(typeof row.quantity, 'string');
  assert.equal(row.quantity, '20.00');
  assert.equal(typeof row.product_id, 'number');
});

test('a list envelope reports an integer total', () => {
  const envelope = S.list([{ id: 1 }], 28);
  assert.deepEqual(Object.keys(envelope).sort(), ['items', 'total']);
  assert.equal(Number.isInteger(envelope.total), true);
});

/* ── Availability and pricing ───────────────────────────────────────────── */

const mirror = (over = {}) => ({ stock: 10, reservedQty: 0, pendingQty: 0, deletedInBillz: false, ...over });
const card = (over = {}) => ({ channels: { medicalka: { enabled: true, price: 5000, forceStatus: 'auto', minStock: 0, ...over } } });

test('available stock subtracts both reserved and pending units', () => {
  assert.equal(catalog.availableStock(mirror({ reservedQty: 3, pendingQty: 2 })), 5);
  // Never negative, even if counters drift above stock.
  assert.equal(catalog.availableStock(mirror({ stock: 1, reservedQty: 5 })), 0);
});

test('forceStatus overrides stock in both directions', () => {
  assert.equal(catalog.isAvailable(card({ forceStatus: 'out' }), mirror(), 'medicalka'), false);
  assert.equal(
    catalog.isAvailable(card({ forceStatus: 'in' }), mirror({ stock: 0 }), 'medicalka'),
    true
  );
});

test('minStock holds units back from the channel', () => {
  assert.equal(catalog.isAvailable(card({ minStock: 10 }), mirror({ stock: 10 }), 'medicalka'), false);
  assert.equal(catalog.isAvailable(card({ minStock: 9 }), mirror({ stock: 10 }), 'medicalka'), true);
});

test('a product deleted in Billz is never available', () => {
  assert.equal(
    catalog.isAvailable(card({ forceStatus: 'in' }), mirror({ deletedInBillz: true }), 'medicalka'),
    false
  );
});

test('a disabled channel hides the product regardless of stock', () => {
  assert.equal(catalog.isAvailable(card({ enabled: false }), mirror(), 'medicalka'), false);
});

test('a product with no channel price is not publishable', () => {
  // Publishing at zero would let a marketplace sell stock for nothing.
  assert.equal(catalog.isPublishable(card({ price: 0 }), mirror(), 'medicalka'), false);
  assert.equal(catalog.priceFor(card({ price: 0 }), 'medicalka'), 0);
  assert.equal(catalog.isPublishable(card(), mirror(), 'medicalka'), true);
});

test('a card with no Billz mirror is not publishable', () => {
  assert.equal(catalog.isPublishable(card(), undefined, 'medicalka'), false);
});

test('a product deleted in Billz leaves the catalogue entirely', () => {
  // Reporting zero stock is not enough: the marketplace would keep listing a
  // product that can no longer be supplied.
  assert.equal(catalog.isPublishable(card(), mirror({ deletedInBillz: true }), 'medicalka'), false);
});

test('the published quantity holds back minStock', () => {
  // availableStock is what exists; minStock is the cushion kept for the shop
  // floor. Publishing the former let the channel sell straight through it.
  const m = mirror({ stock: 10, reservedQty: 2 });
  assert.equal(catalog.availableStock(m), 8);
  assert.equal(catalog.sellableStock(card({ minStock: 3 }), m, 'medicalka'), 5);
  // Never negative, even when the cushion exceeds what is left.
  assert.equal(catalog.sellableStock(card({ minStock: 99 }), m, 'medicalka'), 0);
  assert.equal(catalog.sellableStock(card({ minStock: 0 }), m, 'medicalka'), 8);
});

test('a forced-in product never publishes zero alongside is_available true', () => {
  // The contract's inventory feed lists only sellable products, so a row that
  // says "available" with a quantity of zero is one their client cannot act on.
  const forced = card({ forceStatus: 'in' });
  const empty = mirror({ stock: 0 });

  assert.equal(catalog.sellableStock(forced, empty, 'medicalka'), 0);
  assert.equal(catalog.publishedQuantity(forced, empty, 'medicalka'), 1);
  // Without the override the real figure is published unchanged.
  assert.equal(catalog.publishedQuantity(card(), empty, 'medicalka'), 0);
  assert.equal(catalog.publishedQuantity(card(), mirror({ stock: 7 }), 'medicalka'), 7);
});

/* ── Keys ───────────────────────────────────────────────────────────────── */

test('issued keys are url-safe, tagged and high entropy', () => {
  const token = generateKey('medicalka', 'token');
  const secret = generateKey('medicalka', 'secret');

  assert.match(token, /^fhm_t_[A-Za-z0-9_-]{43}$/);
  assert.match(secret, /^fhm_s_[A-Za-z0-9_-]{43}$/);
  // Travels in a query string, so it must survive without escaping.
  assert.equal(encodeURIComponent(token), token);
  assert.notEqual(token, generateKey('medicalka', 'token'));
});

test('a swapped key is recognisable before authentication', () => {
  const token = generateKey('medicalka', 'token');
  assert.equal(describeKey(token).kind, 'token');
  assert.equal(describeKey(generateKey('uzum', 'secret')).channel, 'uzum');
  assert.equal(describeKey('garbage'), null);
});

test('only the hash of a key is derivable, and it is stable', () => {
  const key = generateKey('medicalka', 'token');
  assert.equal(hashKey(key), hashKey(key));
  assert.match(hashKey(key), /^[a-f0-9]{64}$/);
  assert.equal(hashKey(key).includes(key.slice(6, 20)), false);
});

test('unknown channels and kinds are refused at generation', () => {
  assert.throws(() => generateKey('yandex', 'token'), /unknown channel/);
  assert.throws(() => generateKey('medicalka', 'admin'), /unknown key kind/);
});
