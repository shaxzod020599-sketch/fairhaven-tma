/**
 * Loads the whole catalogue once (GET /api/products?limit=500, ~100 products) and keeps it for five
 * minutes in memory and in sessionStorage, so a reload or a new tab in the same session paints instantly.
 * The taxonomy comes from GET /api/products/taxonomy and is computed from the products when the endpoint
 * is missing or answers with something else, and is kept in sessionStorage for the same five minutes, so
 * a reload asks for neither. Pure apart from the injected fetchers and storage.
 */
import { normalizeProduct } from './normalize.js';
import { computeTaxonomy } from './query.js';
import { brandBySlug } from './brands.js';
import { NEED_KEYS, KIND_KEYS } from './taxonomy.js';

export const CACHE_KEY = 'fh-catalog-v1';
export const CACHE_TTL_MS = 5 * 60 * 1000;
export const TAX_CACHE_KEY = 'fh-taxonomy-v1';

function sessionStore() {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch (_) {
    return null;
  }
}

// API answers keep needs and kinds complete and in canonical order even if the server skips zeros.
function cleanTaxonomy(data) {
  const byKey = (list) => new Map((Array.isArray(list) ? list : []).map((e) => [e.key, Number(e.count) || 0]));
  const needs = byKey(data.needs);
  const kinds = byKey(data.kinds);
  return {
    total: Number(data.total) || 0,
    needs: NEED_KEYS.map((key) => ({ key, count: needs.get(key) || 0 })),
    kinds: KIND_KEYS.map((key) => ({ key, count: kinds.get(key) || 0 })),
    brands: (Array.isArray(data.brands) ? data.brands : [])
      .filter((b) => b && b.slug)
      .map((b) => ({
        slug: b.slug,
        name: b.name || brandBySlug(b.slug)?.name || b.slug,
        count: Number(b.count) || 0,
        country: b.country !== undefined ? b.country : brandBySlug(b.slug)?.country ?? null,
      })),
  };
}

/**
 * @param {object} deps
 * @param {() => Promise<{data: object[]}>} deps.fetchAll  products request
 * @param {() => Promise<{success?: boolean, data?: object}>} deps.fetchTaxonomy  taxonomy request (may reject)
 * @param {Storage|null} [deps.storage]  sessionStorage by default
 * @param {() => number} [deps.now]
 */
export function createCatalogStore({ fetchAll, fetchTaxonomy, storage = sessionStore(), now = Date.now }) {
  let memory = null; // { at, products }
  let taxonomy = null; // { at, data, source }
  let inflight = null;
  let taxInflight = null;

  const fresh = (entry) => entry && now() - entry.at < CACHE_TTL_MS;

  function readSession() {
    if (!storage) return null;
    try {
      const saved = JSON.parse(storage.getItem(CACHE_KEY) || 'null');
      if (!saved || !Array.isArray(saved.raw) || now() - saved.at >= CACHE_TTL_MS) return null;
      return { at: saved.at, products: saved.raw.map(normalizeProduct) };
    } catch (_) {
      return null;
    }
  }

  function writeSession(key, value) {
    if (!storage) return;
    try {
      storage.setItem(key, JSON.stringify(value));
    } catch (_) {
      // Storage full or disabled: the in-memory copy still serves this page.
    }
  }

  function readTaxonomySession() {
    if (!storage) return null;
    try {
      const saved = JSON.parse(storage.getItem(TAX_CACHE_KEY) || 'null');
      return saved && saved.data && Array.isArray(saved.data.needs) && fresh(saved) ? saved : null;
    } catch (_) {
      return null;
    }
  }

  /** Cached products without a request (memory, then session), or null. */
  function peek() {
    if (fresh(memory)) return memory.products;
    const saved = readSession();
    if (saved) {
      memory = saved;
      return saved.products;
    }
    return null;
  }

  /** Normalised products; one request at a time, reused for five minutes. */
  async function loadProducts({ force = false } = {}) {
    if (!force) {
      const cached = peek();
      if (cached) return cached;
    }
    if (!inflight) {
      inflight = (async () => {
        const res = await fetchAll();
        const raw = Array.isArray(res?.data) ? res.data : [];
        const at = now();
        memory = { at, products: raw.map(normalizeProduct) };
        writeSession(CACHE_KEY, { at, raw });
        return memory.products;
      })().finally(() => {
        inflight = null;
      });
    }
    return inflight;
  }

  /** { data, source: 'api' | 'computed' }. Falls back to counting the loaded products. */
  async function loadTaxonomy() {
    if (fresh(taxonomy)) return taxonomy;
    const saved = readTaxonomySession();
    if (saved) {
      taxonomy = saved;
      return saved;
    }
    if (!taxInflight) {
      taxInflight = (async () => {
        let data = null;
        let source = 'api';
        try {
          const res = await fetchTaxonomy();
          if (res && res.success !== false && res.data && Array.isArray(res.data.needs)) data = cleanTaxonomy(res.data);
        } catch (_) {
          // An older API has no taxonomy endpoint; counting the products gives the same numbers.
        }
        if (!data) {
          data = computeTaxonomy(await loadProducts());
          source = 'computed';
        }
        taxonomy = { at: now(), data, source };
        writeSession(TAX_CACHE_KEY, taxonomy);
        return taxonomy;
      })().finally(() => {
        taxInflight = null;
      });
    }
    return taxInflight;
  }

  function clear() {
    memory = null;
    taxonomy = null;
    try {
      storage?.removeItem(CACHE_KEY);
      storage?.removeItem(TAX_CACHE_KEY);
    } catch (_) {}
  }

  return { peek, loadProducts, loadTaxonomy, clear };
}
