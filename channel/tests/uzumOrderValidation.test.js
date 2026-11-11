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
test('pickup orders validate with the client arrival time, client phone and payment extras', () => {
  const pickup = { ...body, discriminator: 'pickup', pickupPointId: 'shop-1',
    deliveryInfo: { clientArrivementDate: '2026-11-11T14:30:00.000+05:00', clientName: 'Client', phoneNumber: '+998900000000', realPhoneNumber: '998900000000' },
    paymentInfo: { itemsCost: 10, paymentType: 'CARD', change: 0, total: 10 } };
  assert.equal(C.validate(pickup), null);
  assert.equal(C.isPickup(pickup), true);
  assert.equal(C.isPickup(body), false);
  assert.deepEqual(C.snapshot(pickup), pickup);
  assert.equal(C.validate({ ...body, discriminator: 'pickup' }), null);
  assert.ok(C.validate({ ...pickup, deliveryInfo: { ...pickup.deliveryInfo, clientArrivementDate: 'soon' } }));
  assert.ok(C.validate({ ...pickup, paymentInfo: { ...pickup.paymentInfo, change: -1 } }));
  assert.ok(C.validate({ ...pickup, pickupPointId: '' }));
  assert.equal(C.validate({ ...body, discriminator: 'marketplace' }).code, 422);
  // A courier order still has to say when the courier comes.
  assert.ok(C.validate({ ...body, discriminator: 'uzum', deliveryInfo: { clientName: 'Client' } }));
});
test('Uzum takeaway orders (their own pickup name) validate as pickup', () => {
  // Field set of the order Uzum sent on 2026-11-11 that was refused before this fix.
  const takeaway = { ...body, discriminator: 'uzum-takeaway', persons: 1, restaurantId: 'store-1',
    deliveryInfo: { clientArrivementDate: '2026-11-11T18:20:00+05:00', clientName: 'Client', courierArrivementDate: '2026-11-11T18:20:00+05:00' },
    paymentInfo: { itemsCost: 10, paymentType: 'CARD' } };
  assert.equal(C.validate(takeaway), null);
  assert.equal(C.isPickup(takeaway), true);
  assert.deepEqual(C.snapshot(takeaway), takeaway);
  assert.equal(C.validate({ ...takeaway, deliveryInfo: { clientName: 'Client' } }), null);
  assert.equal(C.isPickup({ ...body, discriminator: 'uzum' }), false);
});
test('a rejected order is described by its field names, never its values', () => {
  const shape = C.rejectionShape({ discriminator: 'marketplace', deliveryInfo: { phoneNumber: '+998900000000' }, eatsId: 'x' }, 'Unsupported discriminator');
  assert.deepEqual(shape, { error: 'Unsupported discriminator', discriminator: 'marketplace',
    keys: ['discriminator', 'deliveryInfo', 'eatsId'], deliveryKeys: ['phoneNumber'], paymentKeys: 'undefined' });
  assert.doesNotMatch(JSON.stringify(shape), /99890/);
});
