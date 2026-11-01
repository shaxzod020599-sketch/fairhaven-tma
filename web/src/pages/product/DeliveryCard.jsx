import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { useCart } from '../../context/CartContext.jsx';
import { useSettings } from '../../context/SettingsContext.jsx';
import { formatSum } from '../../catalog/index.js';
import { Package, ShieldCheck, Truck } from '../../components/Icons.jsx';
import './DeliveryCard.css';

export const FAIRHAVEN_SLUG = 'fairhaven-health';

/** Free-delivery threshold from the public settings (500 000 сум today). */
export function useFreeThreshold() {
  const { get } = useSettings();
  return Number(get('free_delivery_threshold')) || 0;
}

/**
 * Delivery facts beside the buy button. The free-delivery hint counts what is already in the cart plus the
 * quantity chosen here (unless this product is already in the cart, then the cart alone counts).
 */
export default function DeliveryCard({ product, qty }) {
  const { t, tf, lang } = useI18n();
  const { items, subtotal } = useCart();
  const threshold = useFreeThreshold();
  const inCart = items.some((i) => i._id === product._id);
  const basis = subtotal + (inCart ? 0 : product.price * qty);
  const left = Math.max(0, threshold - basis);
  const ratio = threshold ? Math.min(1, basis / threshold) : 1;
  const authentic = product.brandSlug === FAIRHAVEN_SLUG ? t('product.officialFh') : tf('product.original', { brand: product.brandName });

  return (
    <div className="pdp-dc">
      {threshold > 0 && (
        <div className="pdp-dc-free">
          <p className="pdp-dc-free-text" aria-live="polite">
            {left > 0 ? tf('product.freeLeft', { sum: formatSum(left, lang) }) : t('product.freeReached')}
          </p>
          <div
            className="pdp-dc-meter"
            role="meter"
            aria-label={t('product.freeProgress')}
            aria-valuemin={0}
            aria-valuemax={threshold}
            aria-valuenow={Math.min(basis, threshold)}
            aria-valuetext={left > 0 ? formatSum(left, lang) : t('product.freeReached')}
          >
            <span className="pdp-dc-meter-fill" style={{ '--fill': ratio }} />
            <span className={`pdp-dc-sun${left > 0 ? '' : ' is-up'}`} style={{ '--fill': ratio }} aria-hidden="true" />
          </div>
        </div>
      )}
      <ul className="pdp-dc-list">
        <li>
          <Truck size={20} aria-hidden="true" />
          <span>{t('product.deliveryTimes')}</span>
        </li>
        <li>
          <Package size={20} aria-hidden="true" />
          <span>{t('product.payment')}</span>
        </li>
        {product.brandName && (
          <li>
            <ShieldCheck size={20} aria-hidden="true" />
            <span>{authentic}</span>
          </li>
        )}
      </ul>
    </div>
  );
}
