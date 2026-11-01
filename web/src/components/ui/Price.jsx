import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { formatSum, percentOff } from '../../catalog/format.js';
import './Price.css';

/**
 * «1 190 000 сум», with the old price struck through when it is higher. `showPercent` adds the −N% chip
 * (savings sections and the product page only). size: 'sm' | 'md' | 'lg'.
 *   <Price value={p.price} old={p.oldPrice} showPercent />
 */
export default function Price({ value, old, showPercent = false, size = 'md', className = '' }) {
  const { t, lang } = useI18n();
  const percent = percentOff(value, old);
  return (
    <span className={`ui-price ui-price--${size} ${className}`}>
      <span className="ui-price-now t-price">{formatSum(value, lang)}</span>
      {percent > 0 && (
        <del className="ui-price-old t-num">
          <span className="sr-only">{t('oldPrice')}: </span>
          {formatSum(old, lang)}
        </del>
      )}
      {percent > 0 && showPercent && <span className="ui-price-off t-num">−{percent}%</span>}
    </span>
  );
}
