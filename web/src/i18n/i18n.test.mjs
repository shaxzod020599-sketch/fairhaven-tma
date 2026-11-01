import test from 'node:test';
import assert from 'node:assert/strict';
import { NAMESPACES, DICTS, interpolate, pluralForm } from './dicts.js';
import { NEED_KEYS, KIND_KEYS } from '../catalog/taxonomy.js';

test('ru and uz have the same namespaces and the same keys in each', () => {
  assert.deepEqual(Object.keys(NAMESPACES.uz).sort(), Object.keys(NAMESPACES.ru).sort());
  for (const ns of Object.keys(NAMESPACES.ru)) {
    assert.deepEqual(Object.keys(NAMESPACES.uz[ns]).sort(), Object.keys(NAMESPACES.ru[ns]).sort(), ns);
  }
});

test('a key lives in exactly one namespace', () => {
  const seen = new Map();
  for (const [ns, dict] of Object.entries(NAMESPACES.ru)) {
    for (const key of Object.keys(dict)) {
      assert.ok(!seen.has(key), `${key} is in ${seen.get(key)} and ${ns}`);
      seen.set(key, ns);
    }
  }
});

test('every need and kind has a label in both languages, and every need a description', () => {
  for (const lang of ['ru', 'uz']) {
    for (const key of NEED_KEYS) {
      assert.ok(DICTS[lang][`need.${key}`], `${lang} need.${key}`);
      assert.ok(DICTS[lang][`needDesc.${key}`], `${lang} needDesc.${key}`);
    }
    for (const key of KIND_KEYS) assert.ok(DICTS[lang][`kind.${key}`], `${lang} kind.${key}`);
  }
});

test('new shared strings carry no em or en dashes', () => {
  for (const lang of ['ru', 'uz']) {
    for (const [key, text] of Object.entries(NAMESPACES[lang].common)) {
      if (/^(need|needDesc|kind)\./.test(key) || ['addedToCart', 'open', 'allBrands'].includes(key)) {
        assert.ok(!/[—–]/.test(text), `${lang} ${key}`);
      }
    }
  }
});

test('interpolate fills placeholders and leaves unknown ones', () => {
  assert.equal(interpolate('Показано {shown} из {total}', { shown: 24, total: 106 }), 'Показано 24 из 106');
  assert.equal(interpolate('{a} {b}', { a: 1 }), '1 {b}');
  assert.equal(interpolate('без', undefined), 'без');
});

test('Russian plural forms', () => {
  const forms = DICTS.ru.unitProducts;
  const cases = { 1: 'товар', 2: 'товара', 4: 'товара', 5: 'товаров', 11: 'товаров', 12: 'товаров', 14: 'товаров', 21: 'товар', 22: 'товара', 25: 'товаров', 101: 'товар', 111: 'товаров', 0: 'товаров' };
  for (const [n, word] of Object.entries(cases)) assert.equal(pluralForm('ru', Number(n), forms), word, n);
});

test('Uzbek has one form', () => {
  assert.equal(pluralForm('uz', 1, DICTS.uz.unitProducts), 'ta mahsulot');
  assert.equal(pluralForm('uz', 5, DICTS.uz.unitProducts), 'ta mahsulot');
  assert.equal(pluralForm('uz', 5, ['a', 'b', 'c']), 'a');
});
