import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n/index.jsx';
import { useSettings } from '../../context/SettingsContext.jsx';
import { brandCountry, formatSum, productTitle, productSpec } from '../../catalog/index.js';
import { Reveal, Stagger } from '../../motion/index.js';
import { Button, Price, QuantityStepper } from '../../components/ui/index.js';
import { Telegram } from '../../components/Icons.jsx';
import DeliveryCard from './DeliveryCard.jsx';
import './BuyBox.css';

const SITE = 'https://fairhaven.uz';

/** t.me link to the store's Telegram with the order already written (title, brand, quantity, page URL). */
export function useTelegramOrder(product, qty) {
  const { get } = useSettings();
  const { tf, lang } = useI18n();
  const handle = String(get('support_tg') || '').trim().replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '');
  if (!handle) return '';
  const text = tf('product.tgMessage', {
    title: productTitle(product, lang),
    brand: product.brandName || product.brand || '',
    qty,
    url: `${SITE}/product/${product._id}`,
  }).replace(' ()', '');
  return `https://t.me/${handle}?text=${encodeURIComponent(text)}`;
}

/**
 * Right column: brand, title, spec, goal and kind links, stock, price, quantity, «В корзину», Telegram order
 * and the delivery card. `buttonRef` marks the main button so the phone bar knows when it scrolled away.
 */
export default function BuyBox({ product, qty, setQty, onAdd, buttonRef }) {
  const { t, tf, lang } = useI18n();
  const title = productTitle(product, lang);
  const country = brandCountry(product.brandSlug);
  const available = product.isAvailable;
  const tgUrl = useTelegramOrder(product, qty);

  return (
    <Stagger className="pdp-buy">
      <Reveal className="pdp-buy-head">
        {product.brandName && (
          <p className="pdp-brandline">
            {product.brandSlug ? (
              <Link to={`/brands/${product.brandSlug}`} className="pdp-brand t-mono">{product.brandName}</Link>
            ) : (
              <span className="pdp-brand t-mono">{product.brandName}</span>
            )}
            {country && (
              <span className="pdp-country t-small">
                {t('brandCountry')}: {t(`country.${country}`)}
              </span>
            )}
          </p>
        )}
        <h1 className="pdp-title">{title}</h1>
        {product.spec && <p className="pdp-spec t-mono">{productSpec(product, lang)}</p>}
      </Reveal>

      {(product.kind || product.needs.length > 0) && (
        <Reveal as="ul" className="pdp-tags" aria-label={t('product.aboutLabel')}>
          {product.kind && (
            <li>
              <Link to={`/shop?kind=${product.kind}`} className="pdp-tag pdp-tag--kind">{t(`kind.${product.kind}`)}</Link>
            </li>
          )}
          {product.needs.map((need) => (
            <li key={need}>
              <Link to={`/shop/${need}`} className="pdp-tag">{t(`need.${need}`)}</Link>
            </li>
          ))}
        </Reveal>
      )}

      <Reveal className="pdp-offer">
        <p className={`pdp-stock${available ? '' : ' is-out'}`}>
          <span className="pdp-stock-dot" aria-hidden="true" />
          {available ? t('inStock') : t('out')}
        </p>
        <Price value={product.price} old={product.oldPrice} size="lg" className="pdp-price" />
        {product.saving > 0 && (
          <p className="pdp-save t-small">
            {tf('product.saving', { amount: formatSum(product.saving, lang), pct: product.percent })}
          </p>
        )}
      </Reveal>

      <Reveal className="pdp-actions">
        <div className={`pdp-buyrow${available ? '' : ' is-out'}`} ref={buttonRef}>
          {available && <QuantityStepper value={qty} onChange={setQty} size="lg" label={title} className="pdp-qty" />}
          <Button size="lg" block magnetic disabled={!available} onClick={() => onAdd()} className="pdp-add">
            {available ? t('addToCart') : t('out')}
          </Button>
        </div>
        {available && qty > 1 && (
          <p className="pdp-total t-small t-num">{tf('product.total', { qty, sum: formatSum(product.price * qty, lang) })}</p>
        )}
        {tgUrl && (
          <Button
            href={tgUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="secondary"
            size="lg"
            block
            iconStart={<Telegram size={20} />}
            className="pdp-tg"
          >
            {t('product.orderTelegram')}
          </Button>
        )}
      </Reveal>

      <Reveal>
        <DeliveryCard product={product} qty={qty} />
      </Reveal>
    </Stagger>
  );
}
