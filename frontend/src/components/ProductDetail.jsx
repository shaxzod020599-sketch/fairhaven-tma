import React, { useEffect } from 'react';
import { getProductIcon, getCategoryInfo } from '../utils/helpers';
import { hapticFeedback, hapticNotification } from '../utils/telegram';

function splitPrice(price) {
  if (price === null || price === undefined) return { value: '0', unit: 'UZS' };
  return {
    value: price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '),
    unit: 'UZS',
  };
}

export default function ProductDetail({ product, onClose, onAdd }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  if (!product) return null;

  const category = getCategoryInfo(product.category);
  const { value, unit } = splitPrice(product.price);

  const handleAdd = () => {
    hapticNotification('success');
    onAdd?.(product);
    onClose?.();
  };

  const handleBackdrop = () => {
    hapticFeedback('light');
    onClose?.();
  };

  return (
    <>
      <div className="sheet-backdrop" onClick={handleBackdrop} aria-hidden="true" />
      <div className="sheet" role="dialog" aria-modal="true" id="product-sheet">
        <div className="sheet-handle" />

        <div className="sheet-media">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} />
          ) : (
            <span aria-hidden="true">{getProductIcon(product.category)}</span>
          )}
        </div>

        {product.brand && <div className="sheet-brand">{product.brand}</div>}
        <h2 className="sheet-name">{product.name}</h2>

        <div className="sheet-meta-row">
          <span className="sheet-meta-chip">
            <span aria-hidden="true">{category.icon}</span>
            {category.label}
          </span>
          {product.rating && (
            <span className="sheet-meta-chip">
              <span style={{ color: 'var(--clay)' }} aria-hidden="true">★</span>
              {product.rating.toFixed(1)} · {product.reviews || 0} отзывов
            </span>
          )}
          {product.volume && (
            <span className="sheet-meta-chip">{product.volume}</span>
          )}
        </div>

        <p className="sheet-desc">
          {product.description ||
            'Продукт премиального качества. Сертифицированный бренд, оригинальная упаковка, бережная доставка курьером FairHaven.'}
        </p>

        <div className="sheet-price-row">
          <div>
            <div className="sheet-price-label">Цена</div>
            <div className="sheet-price-value">
              {value}
              <span className="unit">{unit}</span>
            </div>
          </div>
          <button className="sheet-add-btn" onClick={handleAdd} id="sheet-add-btn">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            В корзину
          </button>
        </div>
      </div>
    </>
  );
}
