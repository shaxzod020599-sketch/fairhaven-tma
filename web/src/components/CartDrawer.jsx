import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { useI18n } from '../i18n/index.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useCatalog, formatSum, productTitle, productSpec } from '../catalog/index.js';
import { fetchPopularProducts } from '../api.js';
import { Counter } from '../motion/index.js';
import { EASE_OUT, SPRING } from '../motion/easings.js';
import Sheet from './ui/Sheet.jsx';
import { Button } from './ui/Button.jsx';
import QuantityStepper from './ui/QuantityStepper.jsx';
import ProductCard from './ui/ProductCard.jsx';
import { SunMark } from './ui/Wordmark.jsx';
import { ArrowRight, Trash, Truck } from './Icons.jsx';
import { pickShots } from './shell/shots.js';
import './CartDrawer.css';

const FREE_FALLBACK = 500000;

/** Four products for an empty cart: the shop's popular list, else any available products with pictures. */
function useSuggestions(active) {
  const { products, byId } = useCatalog();
  const [popular, setPopular] = useState(null);
  useEffect(() => {
    if (!active || popular) return undefined;
    let live = true;
    fetchPopularProducts(8)
      .then((res) => live && setPopular(Array.isArray(res?.data) ? res.data : []))
      .catch(() => live && setPopular([]));
    return () => {
      live = false;
    };
  }, [active, popular]);
  return useMemo(() => {
    const fromPopular = (popular || []).map((p) => byId.get(String(p._id))).filter((p) => p && p.isAvailable && p.image);
    const picked = fromPopular.slice(0, 4);
    if (picked.length < 4) {
      for (const p of pickShots(products, 8)) {
        if (picked.length >= 4) break;
        if (!picked.includes(p)) picked.push(p);
      }
    }
    return picked;
  }, [popular, byId, products]);
}

function FreeDelivery({ subtotal, threshold }) {
  const { t, tf, lang } = useI18n();
  const reduce = useReducedMotion();
  const left = Math.max(0, threshold - subtotal);
  const reached = left === 0;
  const share = Math.min(1, subtotal / threshold);
  return (
    <div className={`drw-free${reached ? ' is-reached' : ''}`}>
      <p className="drw-free-text" aria-live="polite">
        <Truck size={20} />
        {reached ? t('shell.freeReached') : tf('shell.freeLeft', { sum: formatSum(left, lang) })}
      </p>
      <div className="drw-free-track" aria-hidden="true">
        <m.span
          className="drw-free-bar"
          initial={false}
          animate={{ scaleX: share }}
          transition={reduce ? { duration: 0 } : SPRING.soft}
        />
        <m.span
          className="drw-free-sun"
          initial={false}
          animate={{ left: `${share * 100}%`, scale: reached ? 1.25 : 1 }}
          transition={reduce ? { duration: 0 } : SPRING.soft}
        >
          <SunMark size={22} rise={false} />
        </m.span>
      </div>
    </div>
  );
}

function Row({ item, product, onClose }) {
  const { t, lang } = useI18n();
  const { setQty, remove } = useCart();
  const title = product ? productTitle(product, lang) : lang === 'uz' && item.nameUz ? item.nameUz : item.name;
  const image = product?.image || item.imageUrl;
  const to = `/product/${item._id}`;
  const rowRef = useRef(null);
  // Hand focus to a neighbouring row first, so keyboard users are not dropped onto <body> (Esc would stop working).
  const removeRow = () => {
    const li = rowRef.current?.parentElement;
    (li?.nextElementSibling || li?.previousElementSibling)?.querySelector('.drw-remove')?.focus();
    remove(item._id);
  };
  return (
    <div className="drw-row" ref={rowRef}>
      <Link to={to} className="drw-thumb" onClick={onClose} tabIndex={-1} aria-hidden="true">
        {image && <img src={image} alt="" loading="lazy" decoding="async" />}
      </Link>
      <div className="drw-info">
        {product?.brandName && <p className="drw-brand t-mono">{product.brandName}</p>}
        <Link to={to} className="drw-title" onClick={onClose}>{title}</Link>
        {product?.spec && <p className="drw-spec">{productSpec(product, lang)}</p>}
        <div className="drw-line">
          <QuantityStepper
            value={item.quantity}
            onChange={(q) => setQty(item._id, q)}
            onRemove={removeRow}
            label={title}
          />
          <span className="drw-sum t-price">{formatSum(item.price * item.quantity, lang)}</span>
        </div>
      </div>
      <button type="button" className="drw-remove" onClick={removeRow} aria-label={`${t('remove')}: ${title}`}>
        <Trash size={20} />
      </button>
    </div>
  );
}

/**
 * Cart drawer from the right (Sheet). Rows can be changed and removed in place; the bar shows how far
 * the free delivery threshold is. Empty, it suggests four popular products. Leaving for any page closes it.
 */
export default function CartDrawer({ open, onClose }) {
  const { t, tf, plural, lang } = useI18n();
  const { items, count, subtotal } = useCart();
  const { get } = useSettings();
  const { byId } = useCatalog();
  const reduce = useReducedMotion();
  const threshold = Number(get('free_delivery_threshold')) > 0 ? Number(get('free_delivery_threshold')) : FREE_FALLBACK;
  const empty = items.length === 0;
  const suggestions = useSuggestions(open && empty);
  const emptyRef = useRef(null);
  const footRef = useRef(null);
  const wasEmpty = useRef(empty);

  // While the drawer is open, toasts sit above its footer so «Оформить заказ» is never covered.
  useEffect(() => {
    const foot = footRef.current?.closest('.ui-sheet-foot') || footRef.current;
    if (!open || !foot || typeof ResizeObserver === 'undefined') return undefined;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => root.style.setProperty('--toast-lift', `${foot.offsetHeight}px`));
    observer.observe(foot);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--toast-lift');
    };
  }, [open, empty]);

  // The last row was just removed: its button is gone, so focus moves to the empty state's call to action.
  useEffect(() => {
    if (open && empty && !wasEmpty.current) emptyRef.current?.querySelector('[data-autofocus]')?.focus();
    wasEmpty.current = empty;
  }, [open, empty]);

  const title = (
    <>
      {t('cartTitle')}
      {count > 0 && <span className="drw-count t-num">{count}</span>}
    </>
  );

  const footer = empty ? null : (
    <div className="drw-foot" ref={footRef}>
      <div className="drw-total">
        <span>{t('subtotal')}</span>
        <Counter value={subtotal} format={(n) => formatSum(n, lang)} duration={0.5} className="drw-total-sum t-price" />
      </div>
      <Button to="/checkout" variant="primary" size="lg" block onClick={onClose} iconEnd={<ArrowRight size={20} />}>
        {t('checkout')}
      </Button>
      <Button to="/cart" variant="secondary" block onClick={onClose}>
        {t('shell.toCart')}
      </Button>
    </div>
  );

  return (
    <Sheet open={open} onClose={onClose} side="right" title={title} footer={footer} className="drw">
      {empty ? (
        <div className="drw-empty" ref={emptyRef}>
          <m.div
            className="drw-empty-art"
            aria-hidden="true"
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
          >
            <SunMark size={88} />
          </m.div>
          <h3 className="drw-empty-title">{t('cartEmpty')}</h3>
          <p className="drw-empty-text">{t('shell.cartEmptyText')}</p>
          <Button to="/shop" variant="primary" onClick={onClose} iconEnd={<ArrowRight size={20} />} data-autofocus>
            {t('goToShop')}
          </Button>
          {suggestions.length > 0 && (
            <section className="drw-suggest" aria-labelledby="drw-suggest-title">
              <h3 id="drw-suggest-title" className="drw-suggest-title t-mono">{t('shell.popular')}</h3>
              <ul className="drw-suggest-list" role="list">
                {suggestions.map((p) => (
                  <li key={p._id}>
                    <ProductCard product={p} variant="compact" headingLevel={4} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <>
          <FreeDelivery subtotal={subtotal} threshold={threshold} />
          <p className="sr-only" aria-live="polite">{tf('shell.cartWithCount', { n: count, unit: plural(count, t('unitProducts')) })}</p>
          <ul className="drw-list" role="list">
            <AnimatePresence initial={false}>
              {items.map((item) => (
                <m.li
                  key={item._id}
                  layout={reduce ? false : 'position'}
                  initial={reduce ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, x: 48, transition: { duration: 0.2, ease: EASE_OUT } }}
                  transition={SPRING.snappy}
                >
                  <Row item={item} product={byId.get(String(item._id))} onClose={onClose} />
                </m.li>
              ))}
            </AnimatePresence>
          </ul>
        </>
      )}
    </Sheet>
  );
}
