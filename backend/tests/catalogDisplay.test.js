const test = require('node:test');
const assert = require('node:assert/strict');

const { formatTitle, formatTitleUz, formatSpec } = require('../utils/catalog/displayName');
const { resolveBrand, BRANDS } = require('../utils/catalog/brands');
const { classify, NEED_KEYS, KIND_KEYS } = require('../utils/catalog/taxonomy');
const { products, golden } = require('./fixtures/catalogNames.json');

// Hand-written titles from the design prototype differ from the rules in
// wording that does not matter on a card: doses, word order, Latin vs Cyrillic
// spelling of the same word, or one or two extra words.
const SYNONYMS = {
  collagen: 'коллаген', коллагеновые: 'коллаген', коллагена: 'коллаген', omega: 'омега',
  super: 'супер', "kid's": 'kids', peptides: 'пептиды',
};

function words(text) {
  return String(text)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\d[\d\s.,/]*\s*(мкг|мг|ме|г|мл)(?![\p{L}])/gu, ' ')
    .split(/[^\p{L}\p{N}'+]+/u)
    .filter((w) => w && w !== '+')
    .map((w) => SYNONYMS[w] || w);
}

function equivalent(ours, theirs) {
  const a = new Set(words(ours));
  const b = new Set(words(theirs));
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  if (![...small].every((w) => big.has(w))) return false;
  return big.size - small.size <= 3;
}

test('titles match the prototype’s hand-written titles for at least 40 of 49 products', () => {
  const misses = [];
  for (const { idx, title } of golden) {
    const ours = formatTitle(products[idx].name, products[idx].brand);
    if (!equivalent(ours, title)) misses.push(`${idx}: "${ours}" vs "${title}"`);
  }
  assert.ok(golden.length - misses.length >= 40, `only ${golden.length - misses.length}/49:\n${misses.join('\n')}`);
});

// Words that are capitals by nature: trademarks, units, vitamin letters.
const CAPS_OK = new Set(['FH', 'PRO', 'PQQ', 'DHA', 'EPA', 'MSM', 'HMB', 'CoQ10', 'NAC']);

test('no title shouts and no title repeats the brand', () => {
  for (const product of products) {
    for (const title of [formatTitle(product.name, product.brand), formatTitleUz(product.nameUz, product.brand)]) {
      if (!title) continue;
      const shouting = title.split(/[^\p{L}\p{N}]+/u).filter((w) => /^\p{Lu}{4,}$/u.test(w) && !CAPS_OK.has(w));
      assert.deepEqual(shouting, [], `"${title}" from "${product.name}"`);

      const brand = resolveBrand(product);
      const entry = BRANDS.find((b) => b.slug === brand.slug);
      const spellings = entry ? [entry.name, ...entry.aliases.filter((a) => a !== 'NOW')] : [brand.name];
      for (const spelling of spellings.filter(Boolean)) {
        assert.ok(!title.toUpperCase().includes(spelling.toUpperCase()), `"${title}" still names ${spelling}`);
      }
    }
  }
});

test('no title comes out empty', () => {
  for (const product of products) {
    const title = formatTitle(product.name, product.brand);
    assert.ok(title.length >= 3, `empty title for "${product.name}"`);
  }
});

test('spec carries pack size and count, with grouped numbers', () => {
  assert.equal(formatTitle('БИОТИН 10,000 МКГ КАПС. №120 SOLGAR', 'SOLGAR'), 'Биотин 10 000 мкг');
  assert.equal(formatSpec('БИОТИН 10,000 МКГ КАПС. №120 SOLGAR', 'SOLGAR'), '120 капсул');
  assert.equal(formatSpec(products[0].name, products[0].brand), '50 мл · 15 шт');
  assert.equal(formatTitle(products[48].name, products[48].brand), 'Омега-3 рыбий жир');
  assert.equal(formatSpec(products[48].name, products[48].brand), '1250/1040 мг · 180 капсул');
});

test('Uzbek spec carries the same pack line with Uzbek units', () => {
  assert.equal(formatSpec('БИОТИН 10,000 МКГ КАПС. №120 SOLGAR', 'SOLGAR', 'uz'), '120 kapsula');
  assert.equal(formatSpec(products[0].name, products[0].brand, 'uz'), '50 ml · 15 dona');
  assert.equal(formatSpec(products[48].name, products[48].brand, 'uz'), '1250/1040 mg · 180 kapsula');
  assert.equal(formatSpec('ВИТАМИН D3 125/100 МКГ КАПС. №60', '', 'uz'), '125/100 mkg · 60 kapsula');
  for (const product of products) {
    assert.doesNotMatch(formatSpec(product.name, product.brand, 'uz'), /\p{Script=Cyrillic}/u, product.name);
  }
});

test('Uzbek title is empty when the Uzbek name is still Cyrillic Russian', () => {
  assert.equal(formatTitleUz('БИОТИН 10000 МКГ', 'Solgar'), '');
});

test('a brand spelled in the name wins over a copied brand field', () => {
  const brand = resolveBrand(products[77]);
  assert.equal(brand.slug, 'vital-proteins');
  assert.equal(brand.name, 'Vital Proteins');
});

test('spellings of one brand collapse to one slug; an unknown brand gets a readable one', () => {
  assert.equal(resolveBrand({ brand: 'NATURES PLUS', name: '' }).slug, 'natures-plus');
  assert.equal(resolveBrand({ brand: "Nature’s Plus", name: '' }).slug, 'natures-plus');
  assert.deepEqual(resolveBrand({ brand: 'GOLDEN LEAF LABS', name: 'ЧАЙ' }), {
    slug: 'golden-leaf-labs', name: 'Golden Leaf Labs', country: null,
  });
  assert.deepEqual(resolveBrand({ brand: '', name: 'ЧАЙ' }), { slug: '', name: '', country: null });
});

test('taxonomy reproduces the prototype’s shelf counts', () => {
  const needs = Object.fromEntries(NEED_KEYS.map((k) => [k, 0]));
  const kinds = Object.fromEntries(KIND_KEYS.map((k) => [k, 0]));
  for (const product of products) {
    const c = classify(product);
    for (const need of c.needs) needs[need] += 1;
    kinds[c.kind] += 1;
  }
  assert.deepEqual(needs, {
    fertility: 18, pregnancy: 8, women: 20, men: 4, beauty: 13, sleep: 11,
    immunity: 24, heart: 17, digestion: 7, metabolism: 5, kids: 11, bones: 9,
  });
  assert.deepEqual(kinds, {
    vitamins: 35, minerals: 24, omega: 13, collagen: 11, inositol: 10, herbal: 6, enzymes: 5, intimate: 2,
  });
});
