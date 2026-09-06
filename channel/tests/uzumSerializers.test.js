const test = require('node:test');
const assert = require('node:assert/strict');
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/uzum-pure-test';
process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'test-shop';
process.env.BILLZ_CASHBOX_ID = 'test-cashbox';
process.env.BILLZ_PAYMENT_TYPE_ID = 'test-payment';
const S = require('../src/adapters/uzum/serializers');
const { schema, response } = require('./uzumSchema');
const entry = { card: { category: 'Vitamins', channels: { uzum: { enabled: true, price: 20 } } }, mirror: { billzProductId: 'p1', measurementUnit: 'шт', stock: 8, reservedQty: 2, pendingQty: 1 } };
test('catalogue conforms to original YAML without fabricating piece weight', () => {
  const body = S.composition([entry], {});
  schema('PickerNomenclatureV1', body);
  assert.deepEqual(body.items[0].measure, { value: 1 });
  assert.deepEqual(body.items[0].barcode, { value: '', weightEncoding: 'none' });
  schema('NomenclatureAvailabilityV1', S.availability([entry]));
  assert.equal(S.availability([entry]).items[0].stock, 5);
});
test('long category ids remain bounded and distinct', () => {
  const a = S.categoryIdFor({ category: 'a'.repeat(80) + 'x' });
  const b = S.categoryIdFor({ category: 'a'.repeat(80) + 'y' });
  assert.ok(a.length <= 64);
  assert.notEqual(a, b);
});
test('weighted and overlong product ids are held back', () => {
  assert.equal(S.supportedEntry(entry), true);
  for (const unit of ['kg', 'кг', 'GRM', 'MLT', 'литр']) assert.equal(S.supportedEntry({ ...entry, mirror: { ...entry.mirror, measurementUnit: unit } }), false);
  assert.equal(S.supportedEntry({ ...entry, mirror: { ...entry.mirror, billzProductId: 'p'.repeat(65) } }), false);
});
test('legacy order fallback meets full required V2 schema', () => {
  schema('YGroceryOrderV2', S.order({ externalId: 'old', items: [{ billzProductId: 'p1', quantity: 1, unitPrice: 20 }], status: 'reserved' }));
});
test('failed after reservation retains acknowledged progress without error leakage', () => {
  const body = S.orderStatus({ status: 'failed', billz: { draftOrderId: 'draft', reservationApplied: true, lastError: 'private upstream data' } });
  schema('OrderStatus', body);
  assert.equal(body.status, 'ACCEPTED_BY_RESTAURANT');
  assert.ok(!JSON.stringify(body).includes('private upstream'));
});
test('draft checkpoint without applied reservation remains NEW after failure', () => {
  assert.equal(S.orderStatus({ status: 'failed', billz: { draftOrderId: 'draft', reservationApplied: false } }).status, 'NEW');
});
test('availability uses stock alone and respects overrides, cushion and holds', () => {
  for (const [cfg, mirror, expected] of [
    [{ forceStatus: 'out' }, { stock: 8, reservedQty: 0, pendingQty: 0 }, 0],
    [{ minStock: 2 }, {}, 3],
    [{ minStock: 6 }, {}, 0],
    [{ forceStatus: 'in' }, { stock: 0 }, 1],
    [{}, {}, 5],
  ]) {
    const value = { card: { ...entry.card, channels: { uzum: { ...entry.card.channels.uzum, ...cfg } } }, mirror: { ...entry.mirror, ...mirror } };
    const availability = S.availability([value]);
    schema('NomenclatureAvailabilityV1', availability);
    assert.deepEqual(availability.items[0], { id: 'p1', stock: expected });
    assert.equal(Object.hasOwn(S.composition([value], {}).items[0], 'inStock'), false);
  }
});
test('YAML empty-content success requires an empty response, not JSON', () => {
  for (const body of [null, '']) response('/order/{orderId}', 'delete', { status: 200, type: '', body, raw: '' });
  for (const [body, raw] of [[{}, '{}'], [null, 'null'], ['bad', 'bad']]) {
    assert.throws(() => response('/order/{orderId}', 'delete', { status: 200, type: '', body, raw }));
  }
});
