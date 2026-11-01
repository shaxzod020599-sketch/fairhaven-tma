import React, { useEffect, useRef } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { Close } from '../../components/Icons.jsx';
import { DURATION, EASE_OUT, SPRING } from '../../motion/index.js';
import './ActiveFilters.css';

/** Chips of the filters in use, each removable, plus «Сбросить всё». `items`: [{ id, label, onRemove }]. */
export default function ActiveFilters({ items, onClear }) {
  const { t, tf } = useI18n();
  const list = useRef(null);
  // A removed chip takes its button away; focus moves to the chip that takes its place (or «Сбросить всё»).
  const refocus = useRef(-1);
  useEffect(() => {
    const at = refocus.current;
    if (at < 0 || !list.current) return;
    refocus.current = -1;
    const next = items[Math.min(at, items.length - 1)];
    const target = next ? list.current.querySelector(`[data-chip="${CSS.escape(next.id)}"]`) : list.current.querySelector('[data-chip-clear]');
    target?.focus();
  }, [items]);
  if (!items.length) return null;
  return (
    <div className="shop-active" role="region" aria-label={t('catalog.active')}>
      <ul className="shop-active-list" ref={list}>
        <AnimatePresence initial={false} mode="popLayout">
          {items.map((item) => (
            <m.li
              key={item.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1, transition: { duration: DURATION.ui, ease: EASE_OUT } }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: DURATION.hover } }}
              transition={{ layout: SPRING.snappy }}
            >
              <button
                type="button"
                className="shop-active-chip"
                data-chip={item.id}
                onClick={() => {
                  refocus.current = items.indexOf(item);
                  item.onRemove();
                }}
                aria-label={tf('catalog.remove', { label: item.label })}
              >
                <span>{item.label}</span>
                <Close size={16} />
              </button>
            </m.li>
          ))}
          <m.li key="clear" layout transition={{ layout: SPRING.snappy }}>
            <button type="button" className="shop-active-clear" data-chip-clear onClick={onClear}>
              {t('catalog.resetAll')}
            </button>
          </m.li>
        </AnimatePresence>
      </ul>
    </div>
  );
}
