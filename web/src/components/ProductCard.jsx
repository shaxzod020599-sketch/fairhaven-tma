import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { useCart } from '../context/CartContext.jsx';
import { formatPrice, getDiscountInfo, productName } from '../helpers.js';
import { Bottle } from './Icons.jsx';

const ProductCard = React.memo(function ProductCard({ product }) {
  const { t, lang } = useI18n();
  const { add } = useCart();
  const [added, setAdded] = useState(false);
  const addedTimer = useRef(null);

  const disc = getDiscountInfo(product);
  const name = productName(product, lang);
  const available = product?.isAvailable !== false;

  const handleAdd = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!available) return;
    add(product, 1);
    setAdded(true);
    clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setAdded(false), 1200);
  };

  // Clear pending timer on unmount — prevents setState-after-unmount leak.
  useEffect(() => () => clearTimeout(addedTimer.current), []);

  const thumb = product?.imageUrl;

  return (
    <Link to={`/product/${product._id}`} className="product-card">
      <div className="product-card-media">
        {disc.hasDiscount && <span className="product-badge sale">−{disc.percent}%</span>}
        {!available && <span className="product-badge out">{t('out')}</span>}
        {thumb ? (
          <img src={thumb} alt={name} loading="lazy" decoding="async" />
        ) : (
          <span className="product-card-placeholder" aria-hidden="true"><Bottle width={64} height={64} /></span>
        )}
      </div>
      <div className="product-card-body">
        {product?.brand && <div className="product-card-brand">{product.brand}</div>}
        <h3 className="product-card-name">{name}</h3>
        <div className="product-card-price-row">
          {disc.hasDiscount ? (
            <>
              <span className="product-card-price sale">{formatPrice(product.price)}</span>
              <span className="product-card-old">{formatPrice(disc.oldPrice)}</span>
            </>
          ) : (
            <span className="product-card-price">{formatPrice(product.price)}</span>
          )}
        </div>
        <button
          className={`btn btn-add ${added ? 'added' : ''} ${!available ? 'disabled' : ''}`}
          onClick={handleAdd}
          disabled={!available}
          type="button"
        >
          {added ? t('added') : t('addToCart')}
        </button>
      </div>
    </Link>
  );
});

export default ProductCard;
