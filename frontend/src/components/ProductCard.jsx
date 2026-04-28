import React, { useState } from 'react';
import { getProductIcon } from '../utils/helpers';
import { hapticFeedback } from '../utils/telegram';
import SmartImage from './SmartImage';
import { primaryImage } from '../utils/productImages';

function splitPrice(price) {
  if (price === null || price === undefined) return { value: '0', unit: 'UZS' };
  const formatted = price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return { value: formatted, unit: 'UZS' };
}

export default function ProductCard({ product, onAdd, onOpen, favorite, onToggleFav, promoPreview }) {
  const [fav, setFav] = useState(Boolean(favorite));
  const isAvailable = product.isAvailable !== false;
  const { value, unit } = splitPrice(product.price);

  const discountedPrice = promoPreview?.discountedUnitPrice;
  const hasDiscount = discountedPrice && discountedPrice < product.price;
  const newSplit = hasDiscount ? splitPrice(discountedPrice) : null;

  const handleAdd = (e) => {
    e.stopPropagation();
    if (!isAvailable) return;
    hapticFeedback('medium');
    onAdd?.(product);
  };

  const handleOpen = () => {
    if (!isAvailable) return;
    hapticFeedback('light');
    onOpen?.(product);
  };

  const handleFav = (e) => {
    e.stopPropagation();
    hapticFeedback('light');
    setFav((v) => !v);
    onToggleFav?.(product);
  };

  const badge = hasDiscount && promoPreview?.percent
    ? { cls: 'sale', label: `−${promoPreview.percent}%` }
    : product.isNew
    ? { cls: 'new', label: 'Новинка' }
    : product.discount
    ? { cls: 'sale', label: `−${product.discount}%` }
    : null;

  const image = primaryImage(product);

  return (
    <div
      className={`product-card ${!isAvailable ? 'unavailable' : ''}`}
      id={`product-${product._id}`}
      onClick={handleOpen}
      role="button"
      tabIndex={0}
    >
      <div className="product-media">
        {badge && <span className={`product-badge ${badge.cls}`}>{badge.label}</span>}

        <button
          className={`product-fav ${fav ? 'active' : ''}`}
          onClick={handleFav}
          aria-label={fav ? 'Убрать из избранного' : 'В избранное'}
          id={`fav-${product._id}`}
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill={fav ? 'currentColor' : 'none'} aria-hidden="true">
            <path
              d="M10 17s-6-3.5-6-8.5a3.5 3.5 0 0 1 6-2.4 3.5 3.5 0 0 1 6 2.4c0 5-6 8.5-6 8.5Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <SmartImage
          src={image}
          alt={product.name}
          fallback={getProductIcon(product.category)}
        />

        {isAvailable && (
          <button
            className="product-add"
            onClick={handleAdd}
            aria-label="В корзину"
            id={`add-${product._id}`}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      <div className="product-info">
        {product.brand && <div className="product-brand">{product.brand}</div>}
        <div className="product-name">{product.name}</div>
        <div className="product-meta">
          <div className="product-price-row">
            {hasDiscount ? (
              <>
                <span className="product-price-old">{value} {unit}</span>
                <span className="product-price product-price-new">
                  {newSplit.value}
                  <span className="unit">{unit}</span>
                </span>
              </>
            ) : (
              <div className="product-price">
                {value}
                <span className="unit">{unit}</span>
              </div>
            )}
          </div>
          {product.rating && (
            <div className="product-rating">
              <span className="star" aria-hidden="true">★</span>
              {product.rating.toFixed(1)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
