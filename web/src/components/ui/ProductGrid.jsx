import React, { useEffect, useRef } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { DURATION, EASE_OUT, REVEAL, SPRING } from '../../motion/easings.js';
import ProductCard from './ProductCard.jsx';
import { SkeletonCard } from './Skeleton.jsx';
import EmptyState from './EmptyState.jsx';
import { Button } from './Button.jsx';
import './ProductGrid.css';

/**
 * Product grid that animates filter changes: cards that stay glide to their new place, new ones rise in
 * (one after another, at most 360 ms for the batch), removed ones fade. Shows skeletons while loading,
 * an empty or error state, and «Показать ещё» with «Показано N из M».
 *   const { items, total, hasMore, status } = useProducts(filter, { page });
 *   <ProductGrid items={items} total={total} status={status} hasMore={hasMore} onLoadMore={() => setPage(page + 1)} />
 */
export default function ProductGrid({
  items,
  status = 'ready',
  total,
  hasMore = false,
  onLoadMore,
  onRetry,
  empty,
  skeletons = 8,
  showPercent = false,
  priorityCount = 0,
  className = '',
}) {
  const { t, tf } = useI18n();
  const reduce = useReducedMotion();
  // Ids already on screen: only cards that were not there before get the rise-in, in their order.
  const seen = useRef(new Set());
  useEffect(() => {
    seen.current = new Set(items.map((p) => String(p._id)));
  }, [items]);

  if (status === 'loading' && !items.length) {
    return (
      <ul className={`grid-products ui-grid ${className}`} aria-busy="true" aria-label={t('loading')}>
        {Array.from({ length: skeletons }, (_, i) => (
          <li key={i}>
            <SkeletonCard />
          </li>
        ))}
      </ul>
    );
  }
  if (status === 'error' && !items.length) {
    return (
      <EmptyState
        title={t('loadError')}
        action={onRetry && <Button variant="secondary" onClick={onRetry}>{t('retry')}</Button>}
      />
    );
  }
  if (!items.length) return empty || <EmptyState title={t('nothingFound')} />;

  let entering = 0;
  const step = REVEAL.stagger;
  const cards = items.map((p, i) => {
    const id = String(p._id);
    const isNew = !seen.current.has(id);
    const delay = isNew ? Math.min(entering++ * step, REVEAL.maxStagger) : 0;
    return (
      <m.li
        key={id}
        layout
        initial={{ opacity: 0.001, y: REVEAL.y }}
        animate={{ opacity: 1, y: 0, transition: { duration: DURATION.reveal, ease: EASE_OUT, delay } }}
        exit={{ opacity: 0, scale: reduce ? 1 : 0.96, transition: { duration: DURATION.hover } }}
        transition={{ layout: SPRING.snappy }}
        className="ui-grid-item"
      >
        <ProductCard product={p} showPercent={showPercent} priority={i < priorityCount} />
      </m.li>
    );
  });
  const shown = items.length;
  return (
    <div className={`ui-grid-wrap ${className}`}>
      <m.ul layout="position" className="grid-products ui-grid">
        <AnimatePresence initial={false} mode="popLayout">
          {cards}
        </AnimatePresence>
      </m.ul>
      {(hasMore || (total != null && total > shown)) && (
        <div className="ui-grid-more">
          {hasMore && onLoadMore && (
            <Button variant="secondary" onClick={onLoadMore}>
              {t('loadMore')}
            </Button>
          )}
          {total != null && <p className="ui-grid-count t-small t-muted">{tf('shownOf', { shown, total })}</p>}
        </div>
      )}
    </div>
  );
}
