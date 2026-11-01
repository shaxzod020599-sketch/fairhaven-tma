const assert = require('node:assert/strict');
const test = require('node:test');

const { sanitizeProductBody } = require('../controllers/adminController');

test('shop-site titles are trimmed, and an empty one hands the title back to the rules', () => {
  const out = sanitizeProductBody({ displayName: '  Магний   цитрат ', displayNameUz: '' });
  assert.equal(out.displayName, 'Магний цитрат');
  assert.equal(out.displayNameUz, '');
  assert.throws(() => sanitizeProductBody({ displayName: 'x'.repeat(201) }), /200/);
});

test('health goals accept a list or a comma string, in canonical order, without repeats', () => {
  assert.deepEqual(sanitizeProductBody({ needs: ['bones', 'sleep', 'bones'] }).needs, ['sleep', 'bones']);
  assert.deepEqual(sanitizeProductBody({ needs: 'kids, immunity' }).needs, ['immunity', 'kids']);
  assert.deepEqual(sanitizeProductBody({ needs: [] }).needs, []);
  assert.throws(() => sanitizeProductBody({ needs: ['vision'] }), /Цели здоровья/);
});

test('product kind is one of the eight, or empty for automatic', () => {
  assert.equal(sanitizeProductBody({ kind: 'omega' }).kind, 'omega');
  assert.equal(sanitizeProductBody({ kind: '' }).kind, '');
  assert.throws(() => sanitizeProductBody({ kind: 'tea' }), /Вид продукта/);
});

test('omitted shop-site fields are left untouched', () => {
  const out = sanitizeProductBody({ name: 'OvaBoost' });
  for (const key of ['displayName', 'displayNameUz', 'needs', 'kind']) assert.equal(key in out, false);
});
