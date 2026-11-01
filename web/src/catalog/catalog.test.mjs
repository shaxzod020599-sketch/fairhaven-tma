// Catalogue logic over the live catalogue snapshot in fixtures/products.json (106 products, 2026-10-31).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeProduct, productTitle, productSpec, brandCountry } from './normalize.js';
import { formatSpec } from './displayName.js';
import { NEED_KEYS, KIND_KEYS, needFromSlug, orderNeeds } from './taxonomy.js';
import { resolveBrand, brandBySlug } from './brands.js';
import { fold, searchProducts, buildIndex } from './search.js';
import {
  normalizeFilter, filterProducts, facetCounts, sortProducts, paginate, computeTaxonomy, savingsShelf,
} from './query.js';
import { formatSum, percentOff } from './format.js';
import { createCatalogStore, CACHE_KEY, CACHE_TTL_MS, TAX_CACHE_KEY } from './store.js';

const RAW = JSON.parse(readFileSync(new URL('./fixtures/products.json', import.meta.url), 'utf8'));
const ALL = RAW.map(normalizeProduct);
const INDEX = buildIndex(ALL);
const search = (q) => searchProducts(ALL, q, INDEX);

test('every product gets a readable title, a brand, a kind and known needs', () => {
  assert.equal(ALL.length, 106);
  for (const p of ALL) {
    assert.ok(p.title && p.title !== p.title.toUpperCase(), `title still in capitals: ${p.name}`);
    assert.ok(p.brandSlug && brandBySlug(p.brandSlug), `no registry brand: ${p.name}`);
    assert.ok(KIND_KEYS.includes(p.kind), `unknown kind for ${p.name}`);
    assert.deepEqual(p.needs, orderNeeds(p.needs));
    assert.equal(typeof p.price, 'number');
    assert.ok(p.image.startsWith('/uploads/') || p.image.startsWith('http'), `no image: ${p.name}`);
  }
  assert.ok(ALL.some((p) => p.needs.length > 0));
});

test('Uzbek spec uses Uzbek units and never Cyrillic', () => {
  assert.equal(formatSpec('БИОТИН 10,000 МКГ КАПС. №120 SOLGAR', 'SOLGAR', 'uz'), '120 kapsula');
  assert.equal(formatSpec('ВИТАМИН D3 125/100 МКГ КАПС. №60', '', 'uz'), '125/100 mkg · 60 kapsula');
  assert.equal(formatSpec('ВИТАМИН D3 125/100 МКГ КАПС. №60', ''), '125/100 мкг · 60 капсул');
  for (const p of ALL) {
    assert.doesNotMatch(p.specUz, /\p{Script=Cyrillic}/u, `Cyrillic in specUz of ${p.name}`);
    assert.equal(p.specUz === '', p.spec === '', `spec and specUz disagree on ${p.name}`);
  }
  const p = ALL.find((x) => x.spec === '60 капсул');
  assert.equal(productSpec(p, 'uz'), '60 kapsula');
  assert.equal(productSpec(p, 'ru'), '60 капсул');
  // An API answer that predates specUz still gets the Uzbek line.
  assert.equal(normalizeProduct({ name: 'ОМЕГА-3 КАПС. №90', spec: '90 капсул' }).specUz, '90 kapsula');
});

test('normalizeProduct keeps API fields, parses numbers and is idempotent', () => {
  const p = normalizeProduct({
    _id: 'a', name: 'X', brand: 'SOLGAR', price: '90000', oldPrice: 120000, images: ['/uploads/a.jpg'],
    title: 'Своё имя', titleUz: 'O‘z nomi', spec: '60 капсул', brandName: 'Solgar', brandSlug: 'solgar',
    needs: ['sleep', 'fertility', 'nope'], kind: 'minerals',
  });
  assert.equal(p.title, 'Своё имя');
  assert.equal(p.titleUz, 'O‘z nomi');
  assert.deepEqual(p.needs, ['fertility', 'sleep']);
  assert.equal(p.kind, 'minerals');
  assert.equal(p.price, 90000);
  assert.equal(p.saving, 30000);
  assert.equal(p.percent, 25);
  assert.equal(p.image, '/uploads/a.jpg');
  assert.equal(p.isAvailable, true);
  assert.equal(normalizeProduct(p), p);
  assert.equal(Object.keys(p).includes('__fh'), false, 'marker must not leak into JSON');

  const unknownKind = normalizeProduct({ name: 'X', needs: [], kind: 'spaceship' });
  assert.equal(unknownKind.kind, '');
  assert.equal(normalizeProduct({ name: 'X', price: 5, oldPrice: 3 }).saving, 0);
});

test('brand comes from the name when the brand field is wrong (Vital Proteins under Fairhaven)', () => {
  const p = ALL.find((x) => x.name.includes('ADVANCED VITAL PROTEINS'));
  assert.equal(p.brand, 'Fairhaven Health');
  assert.equal(p.brandSlug, 'vital-proteins');
  assert.equal(p.brandName, 'Vital Proteins');
  assert.equal(resolveBrand({ name: 'ОМЕГА 3 SOLGAR', brand: '' }).slug, 'solgar');
  assert.equal(brandCountry('fairhaven-health'), 'US');
  assert.equal(brandCountry('nobody'), null);
});

test('productTitle falls back to Russian when the Uzbek title is empty', () => {
  assert.equal(productTitle({ title: 'Омега', titleUz: '' }, 'uz'), 'Омега');
  assert.equal(productTitle({ title: 'Омега', titleUz: 'Omega' }, 'uz'), 'Omega');
  assert.equal(productTitle({ title: 'Омега', titleUz: 'Omega' }, 'ru'), 'Омега');
  assert.equal(productTitle(null, 'ru'), '');
});

test('old /shop/:stage slugs map to needs', () => {
  assert.equal(needFromSlug('fertility-women'), 'fertility');
  assert.equal(needFromSlug('fertility-men'), 'men');
  assert.equal(needFromSlug('pregnant'), 'pregnancy');
  assert.equal(needFromSlug('nursing'), 'pregnancy');
  assert.equal(needFromSlug('menopause'), 'women');
  assert.equal(needFromSlug('sleep'), 'sleep');
  assert.equal(needFromSlug('unknown'), '');
  assert.equal(NEED_KEYS.length, 12);
});

test('fold puts Cyrillic, Uzbek Latin and caps into one form', () => {
  assert.equal(fold('СОЛГАР'), fold('Solgar'));
  assert.equal(fold('Магний'), fold('magniy'));
  assert.equal(fold('o‘g‘il'), 'ogil');
  assert.equal(fold('Хром'), fold('xrom'));
});

test('search matches across languages and synonyms', () => {
  const solgar = ALL.filter((p) => p.brandSlug === 'solgar');
  assert.equal(search('солгар').length, solgar.length);
  assert.equal(search('SOLGAR').length, solgar.length);

  const omega = new Set(search('омега'));
  assert.ok(omega.size >= 5);
  for (const q of ['omega', 'рыбий жир', 'fish oil', 'baliq yog‘i']) {
    const hits = search(q);
    assert.ok(hits.length > 0, q);
    assert.ok(hits.every((p) => omega.has(p) || p.kind === 'omega'), q);
  }
  assert.ok(search('magniy').every((p) => /МАГНИ/.test(p.name)));
  assert.ok(search('magniy').length >= 3);
  assert.ok(search('витамин д').length > 0);
  assert.ok(search('vitamin d3').length > 0);
});

test('search needs every word and ranks a title start first', () => {
  const both = search('solgar omega');
  assert.ok(both.length > 0);
  assert.ok(both.every((p) => p.brandSlug === 'solgar' && /ОМЕГА|РЫБ/.test(p.name)));
  assert.ok(search('омега')[0].title.toLowerCase().startsWith('омега'));
  assert.deepEqual(search('   '), ALL);
  assert.deepEqual(search('zzzqqq'), []);
});

test('filters combine: values of one facet OR, facets AND', () => {
  const f = normalizeFilter({ need: 'sleep,heart', kind: 'minerals', brand: ['solgar'], sale: '1', min: '-5' });
  assert.deepEqual(f.need, ['sleep', 'heart']);
  assert.deepEqual(f.kind, ['minerals']);
  assert.equal(f.sale, true);
  assert.equal(f.min, 0);
  assert.deepEqual(normalizeFilter({ need: 'bogus' }).need, []);

  const sleepOrHeart = filterProducts(ALL, { need: ['sleep', 'heart'] });
  assert.ok(sleepOrHeart.every((p) => p.needs.includes('sleep') || p.needs.includes('heart')));
  const narrowed = filterProducts(ALL, { need: ['sleep', 'heart'], kind: 'minerals' });
  assert.ok(narrowed.length > 0 && narrowed.length < sleepOrHeart.length);
  assert.ok(narrowed.every((p) => p.kind === 'minerals'));
  const cheap = filterProducts(ALL, { max: 200000 });
  assert.ok(cheap.every((p) => p.price <= 200000));
});

test('facet counts leave out their own facet and match the filtered lists', () => {
  const filter = { need: 'sleep' };
  const counts = facetCounts(ALL, filter);
  assert.equal(counts.total, filterProducts(ALL, filter).length);
  for (const { key, count } of counts.needs) {
    assert.equal(count, filterProducts(ALL, { need: key }).length, key);
  }
  for (const { key, count } of counts.kinds) {
    assert.equal(count, filterProducts(ALL, { need: 'sleep', kind: key }).length, key);
  }
  const kindSum = counts.kinds.reduce((s, k) => s + k.count, 0);
  assert.equal(kindSum, counts.total);
  assert.deepEqual(counts.needs.map((n) => n.key), NEED_KEYS);
  assert.equal(facetCounts(ALL, {}).sale, ALL.filter((p) => p.saving > 0).length);
  const withQuery = facetCounts(ALL, { q: 'solgar' }, INDEX);
  assert.equal(withQuery.brands.length, 1);
  assert.equal(withQuery.brands[0].slug, 'solgar');
});

test('sorts return sorted copies; recommended keeps the given order', () => {
  const asc = sortProducts(ALL, 'price-asc');
  assert.ok(asc.every((p, i) => i === 0 || asc[i - 1].price <= p.price));
  const desc = sortProducts(ALL, 'price-desc');
  assert.ok(desc.every((p, i) => i === 0 || desc[i - 1].price >= p.price));
  const saving = sortProducts(ALL, 'saving');
  assert.ok(saving.every((p, i) => i === 0 || saving[i - 1].saving >= p.saving));
  const byName = sortProducts(ALL, 'name', 'ru');
  assert.ok(byName.every((p, i) => i === 0 || byName[i - 1].title.localeCompare(p.title, 'ru') <= 0));
  assert.deepEqual(sortProducts(ALL, 'recommended'), ALL);
  assert.notEqual(sortProducts(ALL), ALL);
  const before = ALL.map((p) => p._id).join();
  sortProducts(ALL, 'price-desc');
  assert.equal(ALL.map((p) => p._id).join(), before, 'input order untouched');
});

test('paginate grows the list page by page and clamps the page', () => {
  const first = paginate(ALL, 1, 24);
  assert.equal(first.items.length, 24);
  assert.equal(first.pages, 5);
  assert.equal(first.hasMore, true);
  assert.equal(paginate(ALL, 2, 24).shown, 48);
  const last = paginate(ALL, 99, 24);
  assert.equal(last.page, 5);
  assert.equal(last.shown, 106);
  assert.equal(last.hasMore, false);
  assert.equal(paginate(ALL, 0, 24).page, 1);
  assert.deepEqual(paginate([], 1, 24), { items: [], page: 1, pages: 1, total: 0, shown: 0, hasMore: false });
});

test('taxonomy computed from products has the API shape and real counts', () => {
  const tax = computeTaxonomy(ALL);
  assert.equal(tax.total, 106);
  assert.deepEqual(tax.needs.map((n) => n.key), NEED_KEYS);
  assert.deepEqual(tax.kinds.map((k) => k.key), KIND_KEYS);
  assert.equal(tax.kinds.reduce((s, k) => s + k.count, 0), 106);
  assert.equal(tax.brands.reduce((s, b) => s + b.count, 0), 106);
  const fh = tax.brands.find((b) => b.slug === 'fairhaven-health');
  assert.equal(fh.count, 26);
  assert.equal(fh.country, 'US');
  assert.equal(tax.brands[0].slug, 'fairhaven-health', 'brands sorted by count');
});

test('savings shelf lists real savings, biggest first', () => {
  const shelf = savingsShelf(ALL, 8);
  assert.equal(shelf.length, 8);
  assert.ok(shelf.every((p, i) => p.saving > 0 && (i === 0 || shelf[i - 1].saving >= p.saving)));
  assert.deepEqual(savingsShelf([normalizeProduct({ name: 'X', price: 10, oldPrice: 0 })]), []);
});

test('formatSum groups thousands with the currency word', () => {
  assert.equal(formatSum(1190000), '1 190 000 сум');
  assert.equal(formatSum('85000', 'uz'), '85 000 so‘m');
  assert.equal(formatSum(0), '0 сум');
  assert.equal(formatSum(999.6), '1 000 сум');
  assert.equal(percentOff(900, 1000), 10);
  assert.equal(percentOff(1000, 900), 0);
  assert.equal(percentOff(5, 0), 0);
});

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    data,
  };
}

function fakes({ taxonomy } = {}) {
  let clock = 1_000_000;
  const calls = { all: 0, tax: 0 };
  return {
    calls,
    tick: (ms) => {
      clock += ms;
    },
    deps: {
      fetchAll: async () => {
        calls.all += 1;
        return { success: true, data: RAW.slice(0, 10) };
      },
      fetchTaxonomy: async () => {
        calls.tax += 1;
        if (taxonomy instanceof Error) throw taxonomy;
        return taxonomy;
      },
      now: () => clock,
    },
  };
}

test('store loads once, shares in-flight requests and expires after the TTL', async () => {
  const storage = memoryStorage();
  const f = fakes();
  const store = createCatalogStore({ ...f.deps, storage });
  assert.equal(store.peek(), null);
  const [a, b] = await Promise.all([store.loadProducts(), store.loadProducts()]);
  assert.equal(f.calls.all, 1);
  assert.equal(a, b);
  assert.equal(a.length, 10);
  assert.ok(a[0].title);
  await store.loadProducts();
  assert.equal(f.calls.all, 1);
  assert.ok(storage.data.has(CACHE_KEY));

  f.tick(CACHE_TTL_MS + 1);
  assert.equal(store.peek(), null);
  await store.loadProducts();
  assert.equal(f.calls.all, 2);
  await store.loadProducts({ force: true });
  assert.equal(f.calls.all, 3);
});

test('a new store paints from sessionStorage and ignores a broken entry', async () => {
  const storage = memoryStorage();
  const f = fakes();
  await createCatalogStore({ ...f.deps, storage }).loadProducts();
  const second = createCatalogStore({ ...f.deps, storage });
  assert.equal(second.peek().length, 10);
  assert.equal(f.calls.all, 1);

  storage.setItem(CACHE_KEY, '{broken');
  const third = createCatalogStore({ ...f.deps, storage });
  assert.equal(third.peek(), null);
  await third.loadProducts();
  assert.equal(f.calls.all, 2);

  const noStorage = createCatalogStore({ ...f.deps, storage: null });
  assert.equal((await noStorage.loadProducts()).length, 10);
});

test('taxonomy falls back to counting products when the endpoint is missing', async () => {
  for (const answer of [new Error('404'), { success: false, error: 'Invalid id' }, { success: true, data: {} }]) {
    const f = fakes({ taxonomy: answer });
    const store = createCatalogStore({ ...f.deps, storage: null });
    const tax = await store.loadTaxonomy();
    assert.equal(tax.source, 'computed');
    assert.equal(tax.data.total, 10);
    assert.equal(tax.data.kinds.reduce((s, k) => s + k.count, 0), 10);
    await store.loadTaxonomy();
    assert.equal(f.calls.tax, 1, 'taxonomy is cached too');
  }
});

test('a reload within the TTL reuses the stored taxonomy without a request', async () => {
  const storage = memoryStorage();
  const answer = { success: true, data: { total: 106, needs: [{ key: 'sleep', count: 9 }], kinds: [], brands: [] } };
  const f = fakes({ taxonomy: answer });
  await createCatalogStore({ ...f.deps, storage }).loadTaxonomy();
  assert.ok(storage.data.has(TAX_CACHE_KEY));
  const reload = await createCatalogStore({ ...f.deps, storage }).loadTaxonomy();
  assert.equal(f.calls.tax, 1);
  assert.equal(reload.source, 'api');
  assert.equal(reload.data.needs.find((n) => n.key === 'sleep').count, 9);

  f.tick(CACHE_TTL_MS + 1);
  await createCatalogStore({ ...f.deps, storage }).loadTaxonomy();
  assert.equal(f.calls.tax, 2, 'expired entry is fetched again');
});

test('API taxonomy is completed to every key in canonical order', async () => {
  const f = fakes({
    taxonomy: {
      success: true,
      data: { total: 106, needs: [{ key: 'sleep', count: 9 }], kinds: [], brands: [{ slug: 'solgar', name: 'Solgar', count: 14 }] },
    },
  });
  const tax = await createCatalogStore({ ...f.deps, storage: null }).loadTaxonomy();
  assert.equal(tax.source, 'api');
  assert.deepEqual(tax.data.needs.map((n) => n.key), NEED_KEYS);
  assert.equal(tax.data.needs.find((n) => n.key === 'sleep').count, 9);
  assert.equal(tax.data.needs.find((n) => n.key === 'men').count, 0);
  assert.equal(tax.data.kinds.length, KIND_KEYS.length);
  assert.equal(tax.data.brands[0].country, 'US');
  assert.equal(f.calls.all, 0, 'no product request needed');
});
