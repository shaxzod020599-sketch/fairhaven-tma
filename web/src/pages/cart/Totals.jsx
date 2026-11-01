import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { formatSum } from '../../catalog/index.js';
import { Counter } from '../../motion/index.js';
import './Totals.css';

/**
 * Money rows of an order: subtotal, promo discount, delivery, total. The figures are passed in, never
 * computed here, so the cart, checkout and confirmation keep their own rules. `live` rolls the numbers
 * with Counter when they change (cart and checkout); a placed order shows them still.
 */
export default function Totals({ subtotal, discount = 0, promoCode = '', deliveryFee, total, live = false, className = '' }) {
  const { t, tf, lang } = useI18n();
  const money = (n) => formatSum(n, lang);
  const show = (n) => (live ? <Counter value={n} format={money} duration={0.5} /> : money(n));

  return (
    <dl className={`crt-tot ${className}`}>
      <div className="crt-tot-row">
        <dt>{t('subtotal')}</dt>
        <dd className="t-price">{show(subtotal)}</dd>
      </div>
      {discount > 0 && (
        <div className="crt-tot-row crt-tot-row--discount">
          <dt>{promoCode ? tf('cart.discount', { code: promoCode }) : t('cart.discountPlain')}</dt>
          <dd className="t-price">−{money(discount)}</dd>
        </div>
      )}
      <div className="crt-tot-row">
        <dt>{t('cart.delivery')}</dt>
        <dd className={deliveryFee === 0 ? 'crt-tot-free' : 't-price'}>
          {deliveryFee === 0 ? t('cart.free') : money(deliveryFee)}
        </dd>
      </div>
      <div className="crt-tot-row crt-tot-row--total">
        <dt>{t('cart.total')}</dt>
        <dd className="t-price">{show(total)}</dd>
      </div>
    </dl>
  );
}
