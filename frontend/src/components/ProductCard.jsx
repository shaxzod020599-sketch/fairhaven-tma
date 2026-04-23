import React, { useState } from 'react';
import { formatPrice, getProductIcon } from '../utils/helpers';
import { hapticFeedback } from '../utils/telegram';

function Thumb({ src, alt, category }) {
  const [errored, setErrored] = useState(false);
  if (!src || errored) {
    return <span aria-hidden="true">{getProductIcon(category)}</span>;
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setErrored(true)}
    />
  );
}

function splitPrice(price) {
  if (price === null || price === undefined) return { value: '0', unit: 'UZS' };
  const formatted = price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return { value: formatted, unit: 'UZS' };
}

export default function ProductCard({ product, onAdd, onOpen, favorite, onToggleFav }) {
  const [fav, setFav] = useState(Boolean(favorite));
  const isAvailable = product.isAvailable !== false;
  const { value, unit } = splitPrice(product.price);

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

  const badge = product.isNew
    ? { cls: 'new', label: 'Новинка' }
    : product.discount
    ? { cls: 'sale', label: `−${product.discount}%` }
    : null;

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

        <Thumb src={product.imageUrl} alt={product.name} category={product.category} />

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
          <div className="product-price">
            {value}
            <span className="unit">{unit}</span>
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
