const assert = require('node:assert/strict');
const test = require('node:test');

const { availability, serialise, POST_JOIN_FILTERS, CHANNELS } =
  require('../controllers/channelController');
const { sanitizeProductBody } = require('../controllers/adminController');

/**
 * The panel and the channel feed must agree on what is for sale.
 *
 * channel-hub decides what Medicalka and Uzum actually receive; this controller
 * decides what the operator is told. If the two rules drift, the panel shows a
 * state the feed does not serve — which is worse than showing nothing, because
 * it looks correct. These tests pin the rule on this side; the matching ones
 * live in channel/tests/medicalkaContract.test.js.
 */

const mirror = (over = {}) => ({
  stock: 10, reservedQty: 0, pendingQty: 0, deletedInBillz: false,
  retailPrice: 100000, syncedAt: new Date(), ...over,
});

const product = (medicalka = {}, extra = {}) => ({
  _id: 'p1',
  name: 'Test product',
  channels: {
    medicalka: { enabled: true, price: 5000, forceStatus: 'auto', minStock: 0, ...medicalka },
  },
  ...extra,
});

test('available stock subtracts reservations and pending bot orders', () => {
  const row = serialise(product(), mirror({ reservedQty: 3, pendingQty: 2 }));
  assert.equal(row.billz.available, 5);
});

test('available stock never reports a negative number', () => {
  const row = serialise(product(), mirror({ stock: 1, reservedQty: 4, pendingQty: 2 }));
  assert.equal(row.billz.available, 0);
});

test('forceStatus overrides stock in both directions', () => {
  assert.equal(availability(product({ forceStatus: 'out' }), mirror(), 'medicalka').live, false);
  assert.equal(
    availability(product({ forceStatus: 'in' }), mirror({ stock: 0 }), 'medicalka').live,
    true
  );
});

test('minStock holds units back from the channel', () => {
  assert.equal(availability(product({ minStock: 10 }), mirror({ stock: 10 }), 'medicalka').live, false);
  assert.equal(availability(product({ minStock: 9 }), mirror({ stock: 10 }), 'medicalka').live, true);
});

test('a product deleted in Billz is never live, even when forced in', () => {
  const state = availability(product({ forceStatus: 'in' }), mirror({ deletedInBillz: true }), 'medicalka');
  assert.equal(state.live, false);
});

test('a product with no Billz mirror is never live', () => {
  assert.equal(availability(product({ forceStatus: 'in' }), null, 'medicalka').live, false);
});

test('an enabled channel with no price is flagged rather than published', () => {
  const state = availability(product({ price: 0 }), mirror(), 'medicalka');
  assert.equal(state.priceMissing, true);
  // `live` reflects stock; the feed refuses it on the price rule. The panel
  // surfaces priceMissing so the operator sees why it is absent.
  assert.equal(state.price, 0);
});

test('a disabled channel is not flagged for a missing price', () => {
  // Otherwise every unconfigured product would sit in the "no price" filter.
  const state = availability(product({ enabled: false, price: 0 }), mirror(), 'medicalka');
  assert.equal(state.priceMissing, false);
  assert.equal(state.live, false);
});

test('every channel is reported, including ones never configured', () => {
  const row = serialise({ _id: 'p2', name: 'Bare', channels: {} }, mirror());
  for (const channel of CHANNELS) {
    assert.ok(row.channels[channel], `${channel} missing from response`);
    assert.equal(row.channels[channel].enabled, false);
    assert.equal(row.channels[channel].forceStatus, 'auto');
  }
});

test('serialised rows never leak internal Billz identifiers to the client', () => {
  const row = serialise(product({}, { billzProductId: 'uuid-1' }), mirror());
  // The panel needs the link to exist, but the mirror's own _id is not exposed.
  assert.equal(row.billzProductId, 'uuid-1');
  assert.equal('_id' in row.billz, false);
});

/* ── Filters ─────────────────────────────────────────────────────────────── */

test('unlinked filter catches both a missing id and a missing mirror', () => {
  const noId = serialise(product({}, { billzProductId: '' }), null);
  const idButNoMirror = serialise(product({}, { billzProductId: 'uuid-9' }), null);
  const linked = serialise(product({}, { billzProductId: 'uuid-1' }), mirror());

  assert.equal(POST_JOIN_FILTERS.unlinked(noId), true);
  assert.equal(POST_JOIN_FILTERS.unlinked(idButNoMirror), true);
  assert.equal(POST_JOIN_FILTERS.unlinked(linked), false);
});

test('no_price filter matches an enabled channel missing its price', () => {
  assert.equal(POST_JOIN_FILTERS.no_price(serialise(product({ price: 0 }), mirror())), true);
  assert.equal(POST_JOIN_FILTERS.no_price(serialise(product(), mirror())), false);
});

test('out_of_stock filter counts reservations, not just Billz stock', () => {
  const reservedOut = serialise(product(), mirror({ stock: 4, reservedQty: 4 }));
  assert.equal(POST_JOIN_FILTERS.out_of_stock(reservedOut), true);
});

/**
 * The panel's product editor writes through PATCH /products/:id. Both fiscal
 * codes have to survive that path — a code the operator typed and the panel
 * then dropped is worse than one they never typed, because the panel shows it
 * as saved.
 */
test('the product editor persists both fiscal codes', () => {
  const out = sanitizeProductBody({ name: 'OvaBoost', mxikCode: '02106999028000000', packageCode: '1490779' });

  assert.equal(out.mxikCode, '02106999028000000');
  assert.equal(out.packageCode, '1490779');
});

test('clearing a fiscal code is saved as empty, not ignored', () => {
  const out = sanitizeProductBody({ mxikCode: '  ', packageCode: '' });

  assert.equal(out.mxikCode, '');
  assert.equal(out.packageCode, '');
});

test('a fiscal code that is not digits is refused, not stored', () => {
  assert.throws(() => sanitizeProductBody({ mxikCode: '0210699902800000x' }), /ИКПУ/);
  assert.throws(() => sanitizeProductBody({ packageCode: '14 90779' }), /упаковк/);
});

test('untouched fiscal codes stay absent from the update', () => {
  const out = sanitizeProductBody({ name: 'OvaBoost' });

  assert.equal('mxikCode' in out, false);
  assert.equal('packageCode' in out, false);
});

test('no_mxik filter matches an empty code', () => {
  assert.equal(POST_JOIN_FILTERS.no_mxik(serialise(product(), mirror())), true);
  assert.equal(
    POST_JOIN_FILTERS.no_mxik(serialise(product({}, { mxikCode: '02106999028000000' }), mirror())),
    false
  );
});

test('no_package filter matches an empty code', () => {
  assert.equal(POST_JOIN_FILTERS.no_package(serialise(product(), mirror())), true);
  assert.equal(
    POST_JOIN_FILTERS.no_package(serialise(product({}, { packageCode: '1490779' }), mirror())),
    false
  );
});
