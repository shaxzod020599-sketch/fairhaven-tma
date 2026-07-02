import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchProductById, fetchProducts } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import { useCart } from '../context/CartContext.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import ProductCard from '../components/ProductCard.jsx';
import {
  formatPrice,
  getDiscountInfo,
  getAllImages,
  productName,
  productDescription,
} from '../helpers.js';
import { Bottle } from '../components/Icons.jsx';

export default function Product({ onOpenCart }) {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const { add } = useCart();

  const [product, setProduct] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [activeImg, setActiveImg] = useState(0);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setActiveImg(0);
    setQty(1);
    fetchProductById(id)
      .then((res) => {
        if (!mounted) return;
        setProduct(res?.data || null);
        // Fetch related by shared tag
        const p = res?.data;
        if (p && Array.isArray(p.tags) && p.tags.length) {
          fetchProducts()
            .then((r) => {
              if (!mounted) return;
              const all = r?.data || [];
              const rel = all
                .filter((x) => x._id !== p._id && x.tags?.some((tag) => p.tags.includes(tag)))
                .slice(0, 4);
              setRelated(rel);
            })
            .catch(() => {});
        }
      })
      .catch(() => { if (mounted) setProduct(null); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [id]);

  if (loading) {
    return (
      <div className="container product-loading">
        <div className="skeleton-card" />
      </div>
    );
  }
  if (!product) {
    return (
      <div className="container product-missing">
        <h1 className="page-title">{t('notFoundTitle')}</h1>
        <p>{t('notFoundDesc')}</p>
        <Link to="/shop" className="btn btn-primary">{t('goToShop')}</Link>
      </div>
    );
  }

  const disc = getDiscountInfo(product);
  const gallery = getAllImages(product);
  const name = productName(product, lang);
  const desc = productDescription(product, lang);
  const available = product.isAvailable !== false;

  const handleAdd = () => {
    if (!available) return;
    add(product, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
    onOpenCart?.();
  };

  return (
    <div className="product-page">
      <div className="container">
        <Breadcrumbs
          trail={[
            { label: t('goHome'), to: '/' },
            { label: t('shopTitle'), to: '/shop' },
            { label: name },
          ]}
        />

        <div className="pdp-layout">
          {/* Gallery */}
          <div className="pdp-gallery">
            <div className="pdp-main-image">
              {disc.hasDiscount && <span className="product-badge sale">−{disc.percent}%</span>}
              {gallery.length ? (
                <img src={gallery[activeImg]} alt={name} fetchpriority="high" decoding="async" />
              ) : (
                <span className="pdp-placeholder" aria-hidden="true"><Bottle width={120} height={120} /></span>
              )}
            </div>
            {gallery.length > 1 && (
              <div className="pdp-thumbs">
                {gallery.map((src, i) => (
                  <button
                    key={i}
                    className={`pdp-thumb ${i === activeImg ? 'active' : ''}`}
                    onClick={() => setActiveImg(i)}
                    type="button"
                  >
                    <img src={src} alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="pdp-info">
            {product.brand && <div className="pdp-brand">{product.brand}</div>}
            <h1 className="pdp-title">{name}</h1>

            <div className="pdp-rating" aria-label="rating">
              <span className="stars">★★★★★</span>
              <span className="pdp-rating-count">(4.9 · 120+ {t('reviews')})</span>
            </div>

            <div className="pdp-price-row">
              {disc.hasDiscount ? (
                <>
                  <span className="pdp-price sale">{formatPrice(product.price)}</span>
                  <span className="pdp-old">{formatPrice(disc.oldPrice)}</span>
                  <span className="pdp-save">−{disc.percent}%</span>
                </>
              ) : (
                <span className="pdp-price">{formatPrice(product.price)}</span>
              )}
            </div>

            <div className="pdp-stock">
              {available ? (
                <span className="in-stock-text">✓ {t('inStock')}</span>
              ) : (
                <span className="out-stock">{t('out')}</span>
              )}
            </div>

            {desc && (
              <div className="pdp-desc">
                <h3 className="pdp-section-title">{t('description')}</h3>
                <p>{desc}</p>
              </div>
            )}

            <div className="pdp-buy-row">
              <div className="qty-stepper qty-lg">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} type="button" aria-label="−">−</button>
                <span>{qty}</span>
                <button onClick={() => setQty((q) => q + 1)} type="button" aria-label="+">+</button>
              </div>
              <button
                className={`btn btn-primary btn-lg btn-block ${added ? 'added' : ''} ${!available ? 'disabled' : ''}`}
                onClick={handleAdd}
                disabled={!available}
                type="button"
              >
                {added ? t('added') : `${t('addToCart')} — ${formatPrice(product.price * qty)}`}
              </button>
            </div>

            <ul className="pdp-meta">
              {product.sku && <li><strong>{t('sku')}:</strong> {product.sku}</li>}
              {product.category && <li><strong>{t('category')}:</strong> {product.category}</li>}
            </ul>

            <div className="pdp-trust">
              <span>✓ {t('trustNongmo')}</span>
              <span>✓ {t('trustGluten')}</span>
              <span>✓ {t('trustUsa')}</span>
            </div>
          </div>
        </div>

        {/* Related */}
        {related.length > 0 && (
          <section className="pdp-related">
            <h2 className="section-title">{t('relatedProducts')}</h2>
            <div className="product-grid">
              {related.map((p) => (
                <ProductCard key={p._id} product={p} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
