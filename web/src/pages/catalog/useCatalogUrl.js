/**
 * Catalogue state kept in the query string, so every view is a shareable link and back/forward restore it.
 *   need=sleep  kind=omega,minerals  brand=solgar,now-foods  q=магний  sort=price-asc
 *   min=200000  max=500000  stock=1  sale=1  page=2
 * On a goal page (/shop/:need) the need comes from the path and `need` in the query is ignored.
 * Filter changes add a history entry; typing in the search field and «Показать ещё» replace the current one.
 */
import { useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SORTS, isNeed, isKind, brandBySlug } from '../../catalog/index.js';

// Links from the previous site used ?category=; the two that still mean something map to a kind.
const LEGACY_CATEGORY = { vitamins: 'vitamins', hygiene: 'intimate' };
const LEGACY_PARAMS = ['category', 'tag'];

const list = (value) => (value ? value.split(',').map((v) => v.trim()).filter(Boolean) : []);
const unique = (items) => [...new Set(items)];
const amount = (value) => {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

function parse(params, fixedNeed) {
  let kind = unique(list(params.get('kind')).filter(isKind));
  const legacy = LEGACY_CATEGORY[params.get('category')];
  if (!kind.length && legacy) kind = [legacy];
  const need = fixedNeed || list(params.get('need')).find(isNeed) || '';
  const sort = SORTS.includes(params.get('sort')) ? params.get('sort') : 'recommended';
  return {
    need,
    kind,
    brand: unique(list(params.get('brand')).filter((slug) => brandBySlug(slug))),
    q: (params.get('q') || '').trim(),
    sort,
    min: amount(params.get('min')),
    max: amount(params.get('max')),
    stock: params.get('stock') === '1',
    sale: params.get('sale') === '1',
    page: Math.max(1, amount(params.get('page')) || 1),
  };
}

function write(params, key, value) {
  const empty =
    value == null || value === '' || value === false || value === 0 ||
    (Array.isArray(value) && !value.length) ||
    (key === 'sort' && value === 'recommended') ||
    (key === 'page' && value <= 1);
  if (empty) params.delete(key);
  else params.set(key, Array.isArray(value) ? value.join(',') : value === true ? '1' : String(value));
}

export function useCatalogUrl(fixedNeed = '') {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => parse(params, fixedNeed), [params, fixedNeed]);
  // The filter the visitor touched last: the empty state offers to undo exactly that one.
  const last = useRef(null);

  const update = useCallback(
    (patch, { replace = false } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          LEGACY_PARAMS.forEach((key) => next.delete(key));
          // A legacy category already counts as a kind; keep it when only other filters change.
          const current = parse(prev, fixedNeed);
          if (!('kind' in patch) && current.kind.length) write(next, 'kind', current.kind);
          if (fixedNeed) next.delete('need');
          Object.entries(patch).forEach(([key, value]) => write(next, key, value));
          if (!('page' in patch)) next.delete('page');
          return next;
        },
        { replace }
      );
    },
    [setParams, fixedNeed]
  );

  /** Adds or removes one value of a list facet (kind, brand). */
  const toggle = useCallback(
    (key, value) => {
      const values = state[key];
      const on = !values.includes(value);
      last.current = on ? { key, value } : last.current?.key === key && last.current.value === value ? null : last.current;
      update({ [key]: on ? [...values, value] : values.filter((v) => v !== value) });
    },
    [state, update]
  );

  /**
   * Sets single-value filters (need, q, stock, sale, or min+max as one 'price' filter: pass `as: 'price'`)
   * and remembers them as the last one touched.
   */
  const set = useCallback(
    (patch, { replace = false, as } = {}) => {
      const on = Object.values(patch).some((v) => v && !(Array.isArray(v) && !v.length));
      const key = as || Object.keys(patch)[0];
      if (on) last.current = { key };
      else if (last.current?.key === key) last.current = null;
      update(patch, { replace });
    },
    [update]
  );

  const clearAll = useCallback(() => {
    last.current = null;
    update({ need: '', kind: [], brand: [], q: '', min: 0, max: 0, stock: false, sale: false });
  }, [update]);

  const filter = useMemo(
    () => ({
      need: state.need,
      kind: state.kind,
      brand: state.brand,
      q: state.q,
      sale: state.sale,
      min: state.min,
      max: state.max,
      available: state.stock,
    }),
    [state]
  );

  return { ...state, filter, update, set, toggle, clearAll, last };
}
