import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useI18n } from '../../i18n/index.jsx';
import { useCatalog, useProducts, filterProducts, facetCounts, brandBySlug, NEED_KEYS } from '../../catalog/index.js';
import { Button, EmptyState, ProductGrid, Sheet } from '../../components/ui/index.js';
import { NeedIcon } from '../../components/Icons.jsx';
import Breadcrumbs from '../../components/Breadcrumbs.jsx';
import { useMediaQuery } from '../../motion/index.js';
import { useSeo } from '../../seo/useSeo.js';
import { useCatalogUrl } from './useCatalogUrl.js';
import { priceCounts, priceLabel } from './prices.js';
import GoalHero from './GoalHero.jsx';
import GoalRail from './GoalRail.jsx';
import Toolbar from './Toolbar.jsx';
import SearchWithin from './SearchWithin.jsx';
import FacetPanel from './FacetPanel.jsx';
import ActiveFilters from './ActiveFilters.jsx';
import './CatalogView.css';

const LAST_TO_CHIP = { kind: (v) => `kind:${v}`, brand: (v) => `brand:${v}` };

/**
 * The catalogue: /shop (all products) or a goal page /shop/:need (`need` set). Everything the visitor picks
 * lives in the URL (useCatalogUrl); the catalogue layer does the filtering, counting, sorting and paging.
 */
export default function CatalogView({ need = '' }) {
  const { t, tf, lang, plural } = useI18n();
  const navigate = useNavigate();
  const { search } = useLocation();
  const url = useCatalogUrl(need);
  const { products, status, reload, index } = useCatalog();
  const wide = useMediaQuery('(min-width: 1024px)');
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => {
    if (wide) setSheetOpen(false);
  }, [wide]);

  const { items, total, hasMore, shown, facets } = useProducts(url.filter, { sort: url.sort, page: url.page });

  // Counts the shared facets do not carry: price presets, in stock, and «all goals» on the rail.
  const withoutPrice = useMemo(() => filterProducts(products, { ...url.filter, min: 0, max: 0 }, index), [products, url.filter, index]);
  const prices = useMemo(() => priceCounts(withoutPrice), [withoutPrice]);
  const stockCount = useMemo(
    () => filterProducts(products, { ...url.filter, available: false }, index).filter((p) => p.isAvailable).length,
    [products, url.filter, index]
  );
  const anyGoalCount = useMemo(() => filterProducts(products, { ...url.filter, need: [] }, index).length, [products, url.filter, index]);
  const needCounts = useMemo(() => new Map(facets.needs.map((n) => [n.key, n.count])), [facets.needs]);

  // The goal page's own numbers, before any narrowing: hero count, its kinds and brands, packshots.
  const goal = useMemo(() => {
    if (!need) return null;
    const list = filterProducts(products, { need });
    const own = facetCounts(products, { need });
    const rank = new Map(own.brands.map((b, i) => [b.slug, i]));
    const byBrandSize = [...list].sort((a, b) => (rank.get(a.brandSlug) ?? 99) - (rank.get(b.brandSlug) ?? 99));
    return { count: list.length, facets: own, shots: byBrandSize };
  }, [products, need]);

  const ready = status === 'ready';
  useSeo(need ? (ready ? { need, count: goal.count } : null) : {});

  // Filters in use, in the order of the panel; each chip removes itself.
  const chips = [];
  if (url.need && !need) chips.push({ id: 'need', label: t(`need.${url.need}`), onRemove: () => url.set({ need: '' }) });
  url.kind.forEach((k) => chips.push({ id: `kind:${k}`, label: t(`kind.${k}`), onRemove: () => url.toggle('kind', k) }));
  url.brand.forEach((slug) =>
    chips.push({ id: `brand:${slug}`, label: brandBySlug(slug)?.name || slug, onRemove: () => url.toggle('brand', slug) })
  );
  if (url.min || url.max) {
    chips.push({ id: 'price', label: priceLabel(url.min, url.max, tf, lang), onRemove: () => url.set({ min: 0, max: 0 }, { as: 'price' }) });
  }
  if (url.stock) chips.push({ id: 'stock', label: t('inStock'), onRemove: () => url.set({ stock: false }) });
  if (url.sale) chips.push({ id: 'sale', label: t('catalog.chip.sale'), onRemove: () => url.set({ sale: false }) });
  if (url.q) chips.push({ id: 'q', label: tf('catalog.chip.q', { q: url.q }), onRemove: () => url.set({ q: '' }) });
  const panelCount = url.kind.length + url.brand.length + (url.min || url.max ? 1 : 0) + (url.stock ? 1 : 0) + (url.sale ? 1 : 0);

  const last = url.last.current;
  const lastId = last ? (LAST_TO_CHIP[last.key] ? LAST_TO_CHIP[last.key](last.value) : last.key) : '';
  const undoChip = chips.find((c) => c.id === lastId) || chips[chips.length - 1];

  const changeGoal = (key) => {
    if (!need) {
      url.set({ need: key });
      return;
    }
    const params = new URLSearchParams(search);
    params.delete('page');
    params.delete('need');
    const qs = params.toString();
    navigate(`${key ? `/shop/${key}` : '/shop'}${qs ? `?${qs}` : ''}`);
  };

  const allNeedCounts = useMemo(() => new Map(facetCounts(products, {}).needs.map((n) => [n.key, n.count])), [products]);
  const empty = (
    <EmptyState
      className="shop-empty"
      title={url.q ? tf('catalog.emptyQuery', { q: url.q }) : t('catalog.emptyTitle')}
      text={chips.length ? t('catalog.emptyText') : null}
      action={
        <div className="shop-empty-actions">
          {chips.length > 0 && (
            <div className="shop-empty-buttons">
              <Button variant="primary" onClick={undoChip.onRemove}>
                {tf('catalog.undoLast', { label: undoChip.label })}
              </Button>
              {chips.length > 1 && (
                <Button variant="ghost" onClick={url.clearAll}>
                  {t('catalog.resetAll')}
                </Button>
              )}
            </div>
          )}
          <ul className="shop-empty-goals" aria-label={t('groupNeeds')}>
            {NEED_KEYS.filter((k) => k !== need && allNeedCounts.get(k)).map((k) => (
              <li key={k}>
                <Link to={`/shop/${k}`} className="ui-chip">
                  <span className="ui-chip-label">
                    <NeedIcon need={k} />
                    {t(`need.${k}`)}
                    <span className="ui-chip-count t-mono">{allNeedCounts.get(k)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      }
    />
  );

  const panel = (
    <FacetPanel
      url={url}
      kinds={facets.kinds}
      brands={facets.brands}
      prices={prices}
      stockCount={stockCount}
      saleCount={facets.sale}
    />
  );

  const crumbs = [{ label: t('home'), to: '/' }, { label: t('catalog'), to: '/shop' }];
  if (need) crumbs.push({ label: t(`need.${need}`) });
  const catalogTotal = ready ? products.length : null;

  return (
    <div className="shop">
      <div className="container shop-head">
        <Breadcrumbs trail={crumbs} />
        {need ? (
          <GoalHero need={need} count={goal.count} products={goal.shots} facets={goal.facets} url={url} />
        ) : (
          <div className="shop-intro">
            <h1 className="shop-intro-title t-h1">{t('catalog.title')}</h1>
            {catalogTotal != null && (
              <p className="shop-intro-count t-mono">
                {catalogTotal} {plural(catalogTotal, t('unitProducts'))}
              </p>
            )}
          </div>
        )}
      </div>

      <GoalRail value={need || url.need} counts={needCounts} total={anyGoalCount} onChange={changeGoal} />

      <div className="container shop-body">
        {wide && (
          <aside className="shop-side" aria-labelledby="shop-side-title">
            <h2 id="shop-side-title" className="shop-side-title">
              {t('catalog.filters')}
            </h2>
            {panel}
          </aside>
        )}

        <section className="shop-results" aria-labelledby="shop-results-title">
          <h2 id="shop-results-title" className="sr-only">
            {t('catalog.results')}
          </h2>
          <div className="shop-controls">
            <SearchWithin
              value={url.q}
              placeholder={need ? t('catalog.searchInGoal') : t('catalog.searchPlaceholder')}
              onChange={(q, options) => url.set({ q }, options)}
            />
            <Toolbar
              shown={shown}
              total={total}
              sort={url.sort}
              onSort={(sort) => url.update({ sort })}
              activeCount={panelCount}
              filtersOpen={sheetOpen}
              onOpenFilters={() => setSheetOpen(true)}
            />
            <ActiveFilters items={chips} onClear={url.clearAll} />
          </div>
          <ProductGrid
            items={items}
            status={status}
            total={total}
            hasMore={hasMore}
            onLoadMore={() => url.update({ page: url.page + 1 }, { replace: true })}
            onRetry={reload}
            empty={empty}
            priorityCount={4}
          />
        </section>
      </div>

      {!wide && (
        <Sheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          side="bottom"
          title={t('catalog.filters')}
          className="shop-sheet"
          footer={
            <div className="shop-sheet-foot">
              {chips.length > 0 && (
                <Button variant="ghost" onClick={url.clearAll}>
                  {t('catalog.resetAll')}
                </Button>
              )}
              <Button variant="primary" block onClick={() => setSheetOpen(false)}>
                {tf('catalog.showResults', { n: total, unit: plural(total, t('unitProducts')) })}
              </Button>
            </div>
          }
        >
          {panel}
        </Sheet>
      )}
    </div>
  );
}
