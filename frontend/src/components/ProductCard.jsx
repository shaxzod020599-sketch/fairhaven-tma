import React from 'react';
import { formatPrice, getProductIcon } from '../utils/helpers';
import { hapticFeedback } from '../utils/telegram';

export default function ProductCard({ product, onAdd }) {
  const isAvailable = product.isAvailable !== false;

  const handleAdd = (e) => {
    e.stopPropagation();
    if (!isAvailable) return;
    hapticFeedback('medium');
    onAdd(product);
  };

  return (
    <div
      className={`product-card ${!isAvailable ? 'unavailable' : ''}`}
      id={`product-${product._id}`}
    >
      <div className="product-image">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} loading="lazy" />
        ) : (
          getProductIcon(product.category)
        )}
      </div>
      <div className="product-info">
        {product.brand && <div className="product-brand">{product.brand}</div>}
        <div className="product-name">{product.name}</div>
        <div className="product-price">{formatPrice(product.price)}</div>
      </div>
      {isAvailable && (
        <button className="product-add-btn" onClick={handleAdd} id={`add-${product._id}`}>
          + В корзину
        </button>
      )}
    </div>
  );
}
