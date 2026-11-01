/**
 * Filtering, facet counts, sorting and paging over normalised products (pure, no React).
 * A filter is { need, kind, brand, q, sale, min, max, available }. need/kind/brand take one key or a list
 * (values of one facet are OR-ed; different facets are AND-ed). Counts always come from the data.
 */
import { NEED_KEYS, KIND_KEYS } from './taxonomy.js';
import { brandBySlug } from './brands.js';
import { searchProducts } from './search.js';

export const PAGE_SIZE = 24;
export const SORTS = ['recommended', 'price-asc', 'price-desc', 'saving', 'name'];

const asList = (value) => {
  if (value == null || value === '') return [];
  const list = Array.isArray(value) ? value : String(value).split(',');
  return list.map((v) => String(v).trim()).filter(Boolean);
};

/** Filter with every facet as a list and numbers parsed; unknown keys dropped. */
export function normalizeFilter(filter = {}) {
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  return {
    need: asList(filter.need).filter((k) => NEED_KEYS.includes(k)),
    kind: asList(filter.kind).filter((k) => KIND_KEYS.includes(k)),
    brand: asList(filter.brand),
    q: String(filter.q || '').trim(),
    sale: filter.sale === true || filter.sale === '1' || filter.sale === 'true',
    min: num(filter.min),
    max: num(filter.max),
    available: filter.available === true || filter.available === '1',
  };
}

function matches(product, f, skip) {
  if (skip !== 'need' && f.need.length && !f.need.some((k) => product.needs.includes(k))) return false;
  if (skip !== 'kind' && f.kind.length && !f.kind.includes(product.kind)) return false;
  if (skip !== 'brand' && f.brand.length && !f.brand.includes(product.brandSlug)) return false;
  if (skip !== 'sale' && f.sale && !product.saving) return false;
  if (f.min && product.price < f.min) return false;
  if (f.max && product.price > f.max) return false;
  if (f.available && !product.isAvailable) return false;
  return true;
}

/**
 * Products for a filter. With a query the result is in relevance order; otherwise in the given order.
 * `index` is the search index from buildIndex() (optional, speeds up repeated searches).
 */
export function filterProducts(products, filter, index) {
  const f = normalizeFilter(filter);
  const searched = f.q ? searchProducts(products, f.q, index) : products;
  return searched.filter((p) => matches(p, f));
}

/**
 * Facet counts for the chip bar: each facet counts with every other filter applied but its own,
 * so a chip shows how many products you get by switching to it.
 */
export function facetCounts(products, filter, index) {
  const f = normalizeFilter(filter);
  const base = f.q ? searchProducts(products, f.q, index) : products;
  const needs = new Map(NEED_KEYS.map((k) => [k, 0]));
  const kinds = new Map(KIND_KEYS.map((k) => [k, 0]));
  const brands = new Map();
  let sale = 0;
  let total = 0;
  for (const p of base) {
    if (matches(p, f)) total += 1;
    if (matches(p, f, 'need')) for (const k of p.needs) if (needs.has(k)) needs.set(k, needs.get(k) + 1);
    if (matches(p, f, 'kind') && kinds.has(p.kind)) kinds.set(p.kind, kinds.get(p.kind) + 1);
    if (matches(p, f, 'brand') && p.brandSlug) {
      const entry = brands.get(p.brandSlug) || { slug: p.brandSlug, name: p.brandName, count: 0 };
      entry.count += 1;
      brands.set(p.brandSlug, entry);
    }
    if (matches(p, f, 'sale') && p.saving) sale += 1;
  }
  return {
    total,
    sale,
    needs: [...needs].map(([key, count]) => ({ key, count })),
    kinds: [...kinds].map(([key, count]) => ({ key, count })),
    brands: [...brands.values()].sort(byCountThenName),
  };
}

function byCountThenName(a, b) {
  return b.count - a.count || a.name.localeCompare(b.name);
}

/** Sorted copy. 'recommended' keeps the given order (API order, or relevance after a search). */
export function sortProducts(products, sort = 'recommended', lang = 'ru') {
  const list = [...products];
  switch (sort) {
    case 'price-asc':
      return list.sort((a, b) => a.price - b.price);
    case 'price-desc':
      return list.sort((a, b) => b.price - a.price);
    case 'saving':
      return list.sort((a, b) => b.saving - a.saving || b.percent - a.percent);
    case 'name': {
      const title = (p) => (lang === 'uz' && p.titleUz) || p.title;
      return list.sort((a, b) => title(a).localeCompare(title(b), lang === 'uz' ? 'uz' : 'ru'));
    }
    default:
      return list;
  }
}

/**
 * «Показать ещё» paging: page N shows the first N * size items, so loading more appends.
 * Returns { items, page, pages, total, shown, hasMore }.
 */
export function paginate(list, page = 1, size = PAGE_SIZE) {
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.trunc(Number(page)) || 1), pages);
  const items = list.slice(0, current * size);
  return { items, page: current, pages, total, shown: items.length, hasMore: items.length < total };
}

/** Same shape as GET /api/products/taxonomy, computed on the client when the endpoint is missing. */
export function computeTaxonomy(products) {
  const counts = facetCounts(products, {});
  return {
    total: products.length,
    needs: counts.needs,
    kinds: counts.kinds,
    brands: counts.brands.map((b) => ({ ...b, country: brandBySlug(b.slug)?.country ?? null })),
  };
}

/** Products with a real saving, biggest saving first (the savings shelf). */
export function savingsShelf(products, limit = 12) {
  return sortProducts(products.filter((p) => p.saving > 0), 'saving').slice(0, limit);
}
