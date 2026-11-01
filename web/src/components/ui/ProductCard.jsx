import React, { memo, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n/index.jsx';
import { normalizeProduct, productTitle, productSpec } from '../../catalog/normalize.js';
import { useVTNavigate } from '../../motion/viewTransition.js';
import Tilt from '../../motion/Tilt.jsx';
import { Bottle } from '../Icons.jsx';
import Price from './Price.jsx';
import { Button } from './Button.jsx';
import { useAddToCart } from './AddToCart.jsx';
import './ProductCard.css';

const plainClick = (e) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

/**
 * Product tile. variant: 'default' (grid), 'compact' (one row: search, cart suggestions), 'stage' (dark
 * sections; the image tilts). The whole card opens /product/:id and its image morphs into the product page
 * image; «В корзину» adds without leaving. `showPercent` only in savings sections.
 *   <ProductCard product={p} />   (raw API products are normalised here)
 */
function ProductCard({ product: raw, variant = 'default', showPercent = false, priority = false, headingLevel = 3, className = '' }) {
  const { t, lang } = useI18n();
  const product = useMemo(() => normalizeProduct(raw), [raw]);
  const imageRef = useRef(null);
  const cardRef = useRef(null);
  const go = useVTNavigate();
  const addToCart = useAddToCart();

  if (!product) return null;
  const title = productTitle(product, lang);
  const to = `/product/${product._id}`;
  const available = product.isAvailable;
  const Heading = `h${headingLevel}`;

  const open = (e) => {
    if (!plainClick(e)) return;
    e.preventDefault();
    go(to, { sharedEl: imageRef.current });
  };

  const image = product.image ? (
    <img
      ref={imageRef}
      src={product.image}
      alt=""
      loading={priority ? 'eager' : 'lazy'}
      fetchpriority={priority ? 'high' : undefined}
      decoding="async"
      draggable="false"
    />
  ) : (
    <Bottle size={56} className="ui-card-noimage" />
  );

  return (
    <article ref={cardRef} className={`ui-card ui-card--${variant}${available ? '' : ' is-out'} ${className}`}>
      {variant === 'stage' ? <Tilt className="ui-card-well" trackRef={cardRef}>{image}</Tilt> : <div className="ui-card-well">{image}</div>}
      <div className="ui-card-body">
        {product.brandName && <p className="ui-card-brand t-mono">{product.brandName}</p>}
        <Heading className="ui-card-title">
          <Link to={to} className="ui-card-link" onClick={open}>
            {title}
          </Link>
        </Heading>
        {product.spec && <p className="ui-card-spec t-mono">{productSpec(product, lang)}</p>}
        <div className="ui-card-foot">
          <Price value={product.price} old={product.oldPrice} showPercent={showPercent} size={variant === 'compact' ? 'sm' : 'md'} />
          {available ? (
            <Button
              size="sm"
              variant="secondary"
              className="ui-card-add"
              onClick={() => addToCart(product, { sourceEl: imageRef.current })}
              aria-label={`${t('addToCart')}: ${title}`}
            >
              {t('addToCart')}
            </Button>
          ) : (
            <span className="ui-card-out">{t('out')}</span>
          )}
        </div>
      </div>
    </article>
  );
}

export default memo(ProductCard);
