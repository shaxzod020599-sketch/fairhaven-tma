import React, { useEffect, useRef, useState } from 'react';
import { m } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { productTitle } from '../../catalog/index.js';
import { SPRING, useMediaQuery } from '../../motion/index.js';
import { Button, Price } from '../../components/ui/index.js';
import './StickyBar.css';

/**
 * Phones and tablets: price and «В корзину» pinned to the bottom once the main button has scrolled up out of
 * view. While it shows, the page root carries data-pdp-bar so toasts and the page end make room for it.
 */
export default function StickyBar({ product, targetRef, onAdd }) {
  const { t, lang } = useI18n();
  const narrow = useMediaQuery('(max-width: 1023px)');
  const [past, setPast] = useState(false);
  const barRef = useRef(null);
  const imgRef = useRef(null);
  const shown = narrow && past;

  useEffect(() => {
    const el = targetRef.current;
    if (!el || !narrow) return undefined;
    // A scroll check rather than IntersectionObserver: a fast fling from below the button to above it
    // crosses no threshold, so an observer would never report it.
    let frame = 0;
    const check = () => {
      frame = 0;
      setPast(el.getBoundingClientRect().bottom < 0);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [targetRef, narrow]);

  useEffect(() => {
    const root = document.documentElement;
    root.toggleAttribute('data-pdp-bar', shown);
    // Hidden below the screen, the bar must not take focus either.
    if (barRef.current) barRef.current.inert = !shown;
    return () => root.removeAttribute('data-pdp-bar');
  }, [shown]);

  if (!narrow) return null;
  const title = productTitle(product, lang);

  return (
    <m.div
      ref={barRef}
      className="pdp-bar"
      role="region"
      aria-label={t('product.buyBar')}
      aria-hidden={!shown}
      initial={false}
      animate={{ y: shown ? '0%' : '110%' }}
      transition={SPRING.snappy}
    >
      <div className="pdp-bar-info">
        {product.image && <img ref={imgRef} src={product.image} alt="" className="pdp-bar-img" loading="lazy" decoding="async" />}
        <div className="pdp-bar-text">
          <p className="pdp-bar-title">{title}</p>
          <Price value={product.price} old={product.oldPrice} size="sm" />
        </div>
      </div>
      <Button size="md" disabled={!product.isAvailable} onClick={() => onAdd(imgRef.current)} className="pdp-bar-add">
        {product.isAvailable ? t('addToCart') : t('out')}
      </Button>
    </m.div>
  );
}
