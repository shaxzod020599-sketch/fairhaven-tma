const assert = require('node:assert/strict');
const test = require('node:test');

process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
process.env.BILLZ_SECRET_TOKEN = process.env.BILLZ_SECRET_TOKEN || 'test-secret';
process.env.BILLZ_SHOP_ID = process.env.BILLZ_SHOP_ID || 'shop-a';

const { toMirrorFields } = require('../src/sync/catalog');

const SHOP = 'shop-a';

function billzProduct(overrides = {}) {
  return {
    id: 'p-1',
    name: 'Fairhaven OvaBoost, №120',
    sku: 'THC-51771',
    barcode: '895749000851',
    brand_name: 'FAIRHAVEN HEALTH',
    categories: [{ id: 'c-1', name: 'ВИТАМИН' }],
    measurement_unit: { short_name: 'шт' },
    main_image_url: 'https://cdn.billz/img.jpg',
    shop_prices: [
      { shop_id: 'shop-b', retail_price: 111, promo_price: 0 },
      { shop_id: SHOP, retail_price: 600000, promo_price: 550000 },
    ],
    shop_measurement_values: [
      { shop_id: 'shop-b', active_measurement_value: 999 },
      { shop_id: SHOP, active_measurement_value: 20 },
    ],
    ...overrides,
  };
}

test('reads price and stock from the configured shop, not the first row', () => {
  const fields = toMirrorFields(billzProduct(), SHOP);

  assert.equal(fields.retailPrice, 600000);
  assert.equal(fields.promoPrice, 550000);
  assert.equal(fields.stock, 20);
});

test('maps identity fields a channel needs', () => {
  const fields = toMirrorFields(billzProduct(), SHOP);

  assert.equal(fields.sku, 'THC-51771');
  assert.equal(fields.barcode, '895749000851');
  assert.equal(fields.brandName, 'FAIRHAVEN HEALTH');
  assert.equal(fields.categoryName, 'ВИТАМИН');
  assert.equal(fields.measurementUnit, 'шт');
});

test('a product absent from our shop mirrors as zero stock, not undefined', () => {
  const product = billzProduct({
    shop_prices: [{ shop_id: 'shop-b', retail_price: 111 }],
    shop_measurement_values: [{ shop_id: 'shop-b', active_measurement_value: 999 }],
  });

  const fields = toMirrorFields(product, SHOP);

  assert.equal(fields.stock, 0);
  assert.equal(fields.retailPrice, 0);
});

test('tolerates a product with no categories or unit', () => {
  const fields = toMirrorFields(
    billzProduct({ categories: null, measurement_unit: undefined }),
    SHOP
  );

  assert.equal(fields.categoryName, '');
  assert.equal(fields.billzCategoryId, '');
  assert.equal(fields.measurementUnit, '');
});

test('mapping never produces reservation counters', () => {
  const fields = toMirrorFields(billzProduct(), SHOP);

  // A sync must not be able to reset locally-owned reservation state.
  assert.equal('reservedQty' in fields, false);
  assert.equal('pendingQty' in fields, false);
});
