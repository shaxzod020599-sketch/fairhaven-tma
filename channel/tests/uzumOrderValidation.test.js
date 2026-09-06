const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/adapters/uzum/contract');
const { schema } = require('./uzumSchema');
const body = { eatsId: 'order-1', comment: '', promos: [], items: [{ id: 'p1', price: 10, quantity: 1, modifications: [], promos: [] }] };
test('supported order validates full YAML shape and preserves empty arrays', () => {
  assert.equal(C.validate(body), null);
  schema('YGroceryOrderV2', C.snapshot(body));
  assert.deepEqual(C.snapshot(body), body);
});
test('rejects missing shapes, operators, nonfinite numbers and unsupported features', () => {
  for (const value of [null, [], { ...body, eatsId: { $ne: null } }, { ...body, comment: undefined }, { ...body, promos: undefined }, { ...body, items: [{ ...body.items[0], price: Infinity }] }, { ...body, items: [{ ...body.items[0], quantity: 1.5 }] }, { ...body, rawIn: {} }]) assert.ok(C.validate(value));
  assert.equal(C.validate({ ...body, promos: [{ type: 'GIFT', discount: 1 }] }).code, 422);
  assert.equal(C.validate({ ...body, items: [{ ...body.items[0], modifications: [{ id: 'm', price: 1, quantity: 1 }] }] }).code, 422);
});
test('delivery timestamps require real calendar dates and valid clock/offset fields', () => {
  for (const timestamp of ['2024-02-29T10:00:00Z', '2000-02-29T23:59:59.123+05:30', '2026-04-30T00:00:00-04:00']) {
    const value = { ...body, deliveryInfo: { courierArrivementDate: timestamp } };
    assert.equal(C.validate(value), null, timestamp);
    schema('YGroceryOrderV2', value);
  }
  for (const timestamp of ['2026-02-30T10:00:00Z', '1900-02-29T10:00:00Z', '2023-02-29T10:00:00Z', '2026-04-31T10:00:00Z', '2026-13-01T10:00:00Z', '2026-00-01T10:00:00Z', '2026-01-00T10:00:00Z', '2026-01-01T24:00:00Z', '2026-01-01T10:60:00Z', '2026-01-01T10:00:00+24:00', '2026-01-01T10:00:00+01:60']) {
    assert.ok(C.validate({ ...body, deliveryInfo: { courierArrivementDate: timestamp } }), timestamp);
  }
});
