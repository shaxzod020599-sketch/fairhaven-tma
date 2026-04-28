import React, { useEffect, useState } from 'react';
import { getProductIcon, getCategoryInfo } from '../utils/helpers';
import { hapticFeedback, hapticNotification, getTelegramUser } from '../utils/telegram';
import SmartImage from './SmartImage';
import { getProductImages, pickDescription } from '../utils/productImages';

function splitPrice(price) {
  if (price === null || price === undefined) return { value: '0', unit: 'UZS' };
  return {
    value: price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '),
    unit: 'UZS',
  };
}

function Gallery({ images, alt, fallback }) {
  const [idx, setIdx] = useState(0);
  const safeImages = images.length ? images : [null];
  const total = safeImages.length;

  useEffect(() => {
    if (idx >= total) setIdx(0);
  }, [total, idx]);

  const goPrev = (e) => {
    e?.stopPropagation();
    hapticFeedback('light');
    setIdx((i) => (i - 1 + total) % total);
  };
  const goNext = (e) => {
    e?.stopPropagation();
    hapticFeedback('light');
    setIdx((i) => (i + 1) % total);
  };

  return (
    <>
      <div className="sheet-gallery">
        {safeImages.map((src, i) => (
          <div
            key={`${i}-${src || 'empty'}`}
            className={`sheet-gallery-slide ${i === idx ? 'active' : ''}`}
            aria-hidden={i !== idx}
          >
            <SmartImage src={src} alt={alt} fallback={fallback} eager={i === 0} />
          </div>
        ))}
        {total > 1 && (
          <>
            <button className="sheet-gallery-nav prev" onClick={goPrev} aria-label="Предыдущее фото">‹</button>
            <button className="sheet-gallery-nav next" onClick={goNext} aria-label="Следующее фото">›</button>
            <div className="sheet-gallery-dots" aria-hidden="true">
              {safeImages.map((_, i) => (
                <span key={i} className={`sheet-gallery-dot ${i === idx ? 'active' : ''}`} />
              ))}
            </div>
          </>
        )}
      </div>

      {total > 1 && (
        <div className="sheet-gallery-thumbs" role="tablist">
          {safeImages.map((src, i) => (
            <button
              key={i}
              className={`sheet-gallery-thumb ${i === idx ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); setIdx(i); hapticFeedback('light'); }}
              aria-label={`Фото ${i + 1}`}
              aria-selected={i === idx}
            >
              <SmartImage src={src} alt="" fallback={fallback} />
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export default function ProductDetail({ product, onClose, onAdd, dbUser }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  if (!product) return null;

  const category = getCategoryInfo(product.category);
  const { value, unit } = splitPrice(product.price);
  const images = getProductImages(product);
  const lang = dbUser?.languageCode || getTelegramUser()?.language_code || 'ru';
  const description = pickDescription(product, lang);
  const fallback = getProductIcon(product.category);

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

        <Gallery images={images} alt={product.name} fallback={fallback} />

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
          {description ||
            'Продукт премиального качества. Сертифицированный бренд FairHaven Health, оригинальная упаковка, бережная доставка курьером.'}
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
