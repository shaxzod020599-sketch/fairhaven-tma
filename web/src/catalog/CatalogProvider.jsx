import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchAllProducts, fetchTaxonomy, fetchProductById } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import { DICTS } from '../i18n/dicts.js';
import { createCatalogStore } from './store.js';
import { normalizeProduct } from './normalize.js';
import { buildIndex } from './search.js';
import { filterProducts, facetCounts, sortProducts, paginate, PAGE_SIZE } from './query.js';
import { useRouteBusy } from '../motion/RouteProgress.jsx';

const store = createCatalogStore({ fetchAll: fetchAllProducts, fetchTaxonomy });

// Search matches goal and kind names in both languages, whatever language the page is in.
const bothLanguages = (key) => `${DICTS.ru[key] || ''} ${DICTS.uz[key] || ''}`;

const CatalogContext = createContext(null);

export function CatalogProvider({ children }) {
  const [products, setProducts] = useState(() => store.peek() || []);
  const [status, setStatus] = useState(() => (store.peek() ? 'ready' : 'loading'));
  const [error, setError] = useState(null);
  const [taxonomy, setTaxonomy] = useState(null);
  const [taxonomySource, setTaxonomySource] = useState(null);

  const load = useCallback((force = false) => {
    setStatus((s) => (s === 'ready' && !force ? s : 'loading'));
    setError(null);
    return store
      .loadProducts({ force })
      .then((list) => {
        setProducts(list);
        setStatus('ready');
        return store.loadTaxonomy();
      })
      .then((tax) => {
        setTaxonomy(tax.data);
        setTaxonomySource(tax.source);
      })
      .catch((err) => {
        setError(err);
        setStatus((s) => (s === 'ready' ? s : 'error'));
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const index = useMemo(() => buildIndex(products, bothLanguages), [products]);
  const byId = useMemo(() => new Map(products.map((p) => [String(p._id), p])), [products]);

  const value = useMemo(
    () => ({ products, status, error, reload: () => load(true), taxonomy, taxonomySource, index, byId }),
    [products, status, error, load, taxonomy, taxonomySource, index, byId]
  );
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

/** { products, status: 'loading' | 'ready' | 'error', error, reload, taxonomy, taxonomySource, index, byId } */
export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog must be used within CatalogProvider');
  return ctx;
}

/**
 * Filtered, sorted, paged products plus facet counts.
 *   const { items, facets, total, hasMore } = useProducts({ need: 'sleep', q }, { sort, page });
 * `filter` may be rebuilt every render; it is compared by value.
 */
export function useProducts(filter = {}, { sort = 'recommended', page = 1, size = PAGE_SIZE } = {}) {
  const { products, status, index } = useCatalog();
  const { lang } = useI18n();
  const key = JSON.stringify(filter);
  const stable = useMemo(() => JSON.parse(key), [key]);

  const list = useMemo(() => {
    const filtered = filterProducts(products, stable, index);
    // Without a query and with the default sort, keep the API order; with a query, keep relevance.
    return sortProducts(filtered, sort, lang);
  }, [products, stable, index, sort, lang]);

  const facets = useMemo(() => facetCounts(products, stable, index), [products, stable, index]);
  const paged = useMemo(() => paginate(list, page, size), [list, page, size]);

  return { ...paged, all: list, facets, status };
}

/**
 * One product by id: from the loaded catalogue when it is there, otherwise one request.
 * status: 'loading' | 'ready' | 'notfound' | 'error'. While loading, the top progress bar runs.
 */
export function useProduct(id) {
  const { byId, status: catalogStatus } = useCatalog();
  const fromCatalog = id ? byId.get(String(id)) : null;
  const [single, setSingle] = useState({ id: null, product: null, status: 'loading' });

  useEffect(() => {
    if (!id || fromCatalog) return undefined;
    let alive = true;
    setSingle({ id, product: null, status: 'loading' });
    fetchProductById(id)
      .then((res) => {
        if (!alive) return;
        const product = res?.data ? normalizeProduct(res.data) : null;
        setSingle({ id, product, status: product ? 'ready' : 'notfound' });
      })
      .catch((err) => {
        if (alive) setSingle({ id, product: null, status: err?.status === 404 || err?.status === 400 ? 'notfound' : 'error' });
      });
    return () => {
      alive = false;
    };
  }, [id, fromCatalog]);

  let result;
  if (fromCatalog) result = { product: fromCatalog, status: 'ready' };
  else if (single.id === id) result = { product: single.product, status: single.status };
  else result = { product: null, status: catalogStatus === 'error' ? 'error' : 'loading' };
  useRouteBusy(result.status === 'loading');
  return result;
}

/** Counts per goal, kind and brand: { taxonomy: {total, needs, kinds, brands} | null, source, status }. */
export function useTaxonomy() {
  const { taxonomy, taxonomySource, status } = useCatalog();
  return { taxonomy, source: taxonomySource, status: taxonomy ? 'ready' : status };
}
