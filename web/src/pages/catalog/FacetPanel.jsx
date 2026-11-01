import React, { useId, useMemo, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { fold } from '../../catalog/index.js';
import { Check, Search } from '../../components/Icons.jsx';
import { priceLabel } from './prices.js';
import './FacetPanel.css';

const BRANDS_FOLDED = 8;

function CheckRow({ type = 'checkbox', name, checked, count, onChange, children, switchLook = false }) {
  const off = count === 0 && !checked;
  return (
    <label className={`shop-check${off ? ' is-off' : ''}${switchLook ? ' shop-check--switch' : ''}`}>
      <input type={type} name={name} className="shop-check-input" checked={checked} disabled={off} onChange={onChange} />
      <span className={type === 'radio' ? 'shop-check-dot' : switchLook ? 'shop-check-switch' : 'shop-check-box'} aria-hidden="true">
        {type === 'checkbox' && !switchLook && <Check size={14} strokeWidth={2.4} />}
      </span>
      <span className="shop-check-label">{children}</span>
      {count != null && <span className="shop-check-count t-mono">{count}</span>}
    </label>
  );
}

/**
 * Filter facets with live counts: kind, brand (searchable, folded to eight), price presets, stock and sale.
 * Used in the sidebar from 1024 px and inside the bottom sheet on smaller screens.
 */
export default function FacetPanel({ url, kinds, brands, prices, stockCount, saleCount }) {
  const { t, tf, lang } = useI18n();
  const uid = useId();
  const [brandQuery, setBrandQuery] = useState('');
  const [allBrands, setAllBrands] = useState(false);

  const shownBrands = useMemo(() => {
    const q = fold(brandQuery.trim());
    // Selected brands stay listed even when other filters leave them empty, so they can be unticked.
    const list = brands.filter((b) => b.count > 0 || url.brand.includes(b.slug));
    if (q) return list.filter((b) => fold(b.name).includes(q));
    if (allBrands) return list;
    const top = list.slice(0, BRANDS_FOLDED);
    const extra = list.slice(BRANDS_FOLDED).filter((b) => url.brand.includes(b.slug));
    return [...top, ...extra];
  }, [brands, brandQuery, allBrands, url.brand]);
  const brandTotal = brands.filter((b) => b.count > 0 || url.brand.includes(b.slug)).length;
  const presetOn = (p) => url.min === p.min && url.max === p.max;
  const anyPrice = !url.min && !url.max;

  return (
    <div className="shop-facets">
      <fieldset className="shop-facet">
        <legend className="shop-facet-title">{t('groupKinds')}</legend>
        <div className="shop-facet-list">
          {kinds.map((k) => (
            <CheckRow key={k.key} checked={url.kind.includes(k.key)} count={k.count} onChange={() => url.toggle('kind', k.key)}>
              {t(`kind.${k.key}`)}
            </CheckRow>
          ))}
        </div>
      </fieldset>

      <fieldset className="shop-facet">
        <legend className="shop-facet-title">{t('groupBrands')}</legend>
        {brandTotal > BRANDS_FOLDED && (
          <div className="shop-facet-find">
            <label htmlFor={`${uid}-brand`} className="sr-only">
              {t('catalog.brandSearch')}
            </label>
            <Search size={18} className="shop-facet-find-icon" />
            <input
              id={`${uid}-brand`}
              type="search"
              className="shop-facet-find-input"
              placeholder={t('catalog.brandSearch')}
              value={brandQuery}
              autoComplete="off"
              onChange={(e) => setBrandQuery(e.target.value)}
            />
          </div>
        )}
        <div className="shop-facet-list" id={`${uid}-brands`}>
          {shownBrands.map((b) => (
            <CheckRow key={b.slug} checked={url.brand.includes(b.slug)} count={b.count} onChange={() => url.toggle('brand', b.slug)}>
              {b.name}
            </CheckRow>
          ))}
          {!shownBrands.length && <p className="shop-facet-none t-small t-muted">{t('catalog.brandNone')}</p>}
        </div>
        {!brandQuery && brandTotal > BRANDS_FOLDED && (
          <button
            type="button"
            className="shop-facet-more"
            aria-expanded={allBrands}
            aria-controls={`${uid}-brands`}
            onClick={() => setAllBrands((v) => !v)}
          >
            {allBrands ? t('catalog.brandsLess') : tf('catalog.brandsAll', { n: brandTotal })}
          </button>
        )}
      </fieldset>

      <fieldset className="shop-facet">
        <legend className="shop-facet-title">{t('price')}</legend>
        <div className="shop-facet-list">
          <CheckRow type="radio" name={`${uid}-price`} checked={anyPrice} onChange={() => url.set({ min: 0, max: 0 }, { as: 'price' })}>
            {t('catalog.price.any')}
          </CheckRow>
          {prices.map((p) => (
            <CheckRow
              key={p.key}
              type="radio"
              name={`${uid}-price`}
              checked={presetOn(p)}
              count={p.count}
              onChange={() => url.set({ min: p.min, max: p.max }, { as: 'price' })}
            >
              <span className="shop-nowrap">{priceLabel(p.min, p.max, tf, lang)}</span>
            </CheckRow>
          ))}
        </div>
      </fieldset>

      <fieldset className="shop-facet">
        <legend className="shop-facet-title">{t('catalog.availability')}</legend>
        <div className="shop-facet-list">
          <CheckRow switchLook checked={url.stock} count={stockCount} onChange={(e) => url.set({ stock: e.target.checked })}>
            {t('catalog.stockOnly')}
          </CheckRow>
          <CheckRow switchLook checked={url.sale} count={saleCount} onChange={(e) => url.set({ sale: e.target.checked })}>
            {t('catalog.saleOnly')}
          </CheckRow>
        </div>
      </fieldset>
    </div>
  );
}
