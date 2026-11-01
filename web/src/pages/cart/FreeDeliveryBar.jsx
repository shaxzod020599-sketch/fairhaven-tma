import React from 'react';
import { m, useReducedMotion } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { formatSum } from '../../catalog/index.js';
import { SPRING } from '../../motion/index.js';
import { SunMark } from '../../components/ui/index.js';
import { Truck } from '../../components/Icons.jsx';
import { fill } from './text.jsx';
import './FreeDeliveryBar.css';

/**
 * How far the cart is from free delivery: a track that fills in ink and a sun that rides its end, then the
 * whole bar warms to sun once the threshold is reached. Only transforms move.
 */
export default function FreeDeliveryBar({ subtotal, threshold, className = '' }) {
  const { t, lang } = useI18n();
  const reduce = useReducedMotion();
  const left = Math.max(0, threshold - subtotal);
  const reached = left === 0;
  const share = Math.min(1, subtotal / threshold);
  const motion = reduce ? { duration: 0 } : SPRING.soft;

  return (
    <div className={`crt-free${reached ? ' is-reached' : ''} ${className}`}>
      <p className="crt-free-text" aria-live="polite">
        <Truck size={20} />
        <span>
          {reached
            ? t('cart.freeReached')
            : fill(t('cart.freeLeft'), { sum: <strong className="t-price">{formatSum(left, lang)}</strong> })}
        </span>
      </p>
      <div className="crt-free-track" aria-hidden="true">
        <m.span className="crt-free-bar" initial={false} animate={{ scaleX: share }} transition={motion} />
        <m.span className="crt-free-rider" initial={false} animate={{ x: `${share * 100}%` }} transition={motion}>
          <m.span className="crt-free-sun" animate={{ scale: reached ? 1.25 : 1 }} transition={reduce ? { duration: 0 } : SPRING.pop}>
            <SunMark size={22} rise={false} />
          </m.span>
        </m.span>
      </div>
    </div>
  );
}
