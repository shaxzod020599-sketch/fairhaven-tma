const assert = require('node:assert/strict');
const test = require('node:test');

const { decide, hasImage } = require('../services/stockReconciler');
const { similarity, proposeMatch, matchCatalogue } = require('../utils/billzMatch');

/**
 * Visibility rules for the shop itself. Every read path filters on
 * `isAvailable`, so these decisions are what customers actually see.
 */

const product = (over = {}) => ({
  _id: 'p1',
  name: 'Test',
  imageUrl: '/uploads/a.jpg',
  isAvailable: true,
  billzProductId: 'billz-1',
  ...over,
});

const mirror = (over = {}) => ({
  billzProductId: 'billz-1', stock: 10, reservedQty: 0, pendingQty: 0,
  deletedInBillz: false, ...over,
});

test('a linked product follows Billz stock', () => {
  assert.equal(decide(product(), mirror({ stock: 5 })).available, true);
  assert.equal(decide(product(), mirror({ stock: 0 })).available, false);
});

test('reserved and pending units count as sold for shop visibility', () => {
  // The last unit is spoken for; showing it would oversell.
  const state = decide(product(), mirror({ stock: 2, reservedQty: 1, pendingQty: 1 }));
  assert.equal(state.available, false);
  assert.equal(state.reason, 'out_of_stock');
});

test('a product that disappeared from Billz is hidden, not deleted', () => {
  const gone = decide(product(), null);
  assert.equal(gone.available, false);
  assert.equal(gone.reason, 'gone_from_billz');

  const flagged = decide(product(), mirror({ deletedInBillz: true }));
  assert.equal(flagged.available, false);
});

test('it comes back on its own once Billz has stock again', () => {
  const hidden = product({ isAvailable: false });
  assert.equal(decide(hidden, mirror({ stock: 3 })).available, true);
});

test('a product with no image never reaches the shop', () => {
  assert.equal(decide(product({ imageUrl: '', images: [] }), mirror()).available, false);
  assert.equal(decide(product({ imageUrl: '   ' }), mirror()).reason, 'no_image');
  // An image in the gallery counts even when imageUrl is empty.
  assert.equal(decide(product({ imageUrl: '', images: ['/uploads/b.jpg'] }), mirror()).available, true);
});

test('an unapproved product stays hidden even with stock and an image', () => {
  const state = decide(product({ approved: false }), mirror({ stock: 99 }));
  assert.equal(state.available, false);
  assert.equal(state.reason, 'awaiting_approval');
});

test('approval is opt-out: an existing product with no field is approved', () => {
  // Otherwise introducing the field would empty the shop.
  assert.equal(decide(product(), mirror()).available, true);
});

test('a product never linked to Billz is left exactly as it was', () => {
  const state = decide(product({ billzProductId: '' }), null);
  assert.equal(state.available, null, 'must not be touched');
  assert.equal(state.reason, 'not_linked');
});

test('a manual override outranks every automatic rule', () => {
  const state = decide(product({ autoStock: false, imageUrl: '' }), null);
  assert.equal(state.available, null);
  assert.equal(state.reason, 'manual_override');
});

test('hasImage ignores blank and whitespace entries', () => {
  assert.equal(hasImage({ imageUrl: '', images: ['', '  '] }), false);
  assert.equal(hasImage({ imageUrl: '', images: ['', '/uploads/x.png'] }), true);
});

/* ── Billz matching ──────────────────────────────────────────────────────── */

const billz = [
  { billzProductId: 'b1', name: 'Fairhaven MotilityBoost, №60', sku: 'MB-60', barcode: '111' },
  { billzProductId: 'b2', name: 'Fairhaven CountBoost, №60', sku: 'CB-60', barcode: '222' },
  { billzProductId: 'b3', name: 'Fairhaven FH PRO Fertility Multivitamin for Men, №180', sku: 'FHM', barcode: '333' },
  { billzProductId: 'b4', name: 'Fairhaven FH PRO Fertility Multivitamin for Women, №180', sku: 'FHW', barcode: '444' },
  { billzProductId: 'b5', name: 'Fairhaven Myo-Inositol, №120', sku: 'MI-120', barcode: '555' },
  { billzProductId: 'b6', name: 'Fairhaven Myo-Inositol, №240', sku: 'MI-240', barcode: '666' },
];

test('a barcode match wins outright', () => {
  const hit = proposeMatch({ name: 'Anything at all', barcode: '222' }, billz);
  assert.equal(hit.method, 'barcode');
  assert.equal(hit.billzProductId, 'b2');
});

test('names written closed up in Billz still match the spaced-out card', () => {
  // "MotilityBoost" in Billz, "Motility Boost for Men" on the card.
  const hit = proposeMatch({ name: 'Motility Boost for Men' }, billz);
  assert.equal(hit.method, 'name');
  assert.equal(hit.billzProductId, 'b1');
});

test('a conflicting gender is never a match', () => {
  assert.equal(similarity('FH Pro for Men', 'Fairhaven FH PRO Fertility Multivitamin for Women, №180'), 0);
  const hit = proposeMatch({ name: 'FH Pro for Women' }, billz);
  assert.equal(hit.billzProductId, 'b4');
});

test('a conflicting pack size is never a match', () => {
  assert.equal(similarity('Myo-Inositol №120', 'Fairhaven Myo-Inositol, №240'), 0);
});

test('two pack sizes with no size on the card is reported, not guessed', () => {
  const hit = proposeMatch({ name: 'Myo-Inositol Powder' }, billz);
  assert.equal(hit.method, 'ambiguous');
  assert.equal(hit.billzProductId, null);
});

test('a product with nothing like it in Billz returns no match', () => {
  assert.equal(proposeMatch({ name: 'Milkies Milk-Saver' }, billz), null);
});

test('one Billz product never backs two cards', () => {
  // Two cards would each sell the same stock without knowing about the other.
  const products = [
    { _id: 'p1', name: 'Motility Boost for Men' },
    { _id: 'p2', name: 'MotilityBoost' },
  ];
  const { matched } = matchCatalogue(products, billz);
  const targets = matched.map((m) => m.billzProductId);
  assert.equal(new Set(targets).size, targets.length);
});

test('already-linked products are left alone and keep their target', () => {
  const products = [
    { _id: 'p1', name: 'Something else entirely', billzProductId: 'b1' },
    { _id: 'p2', name: 'Motility Boost for Men' },
  ];
  const { matched } = matchCatalogue(products, billz);
  assert.equal(matched.some((m) => String(m.product._id) === 'p1'), false);
  // b1 is taken, so p2 cannot claim it.
  assert.equal(matched.some((m) => m.billzProductId === 'b1'), false);
});
