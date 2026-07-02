import React, { useEffect, useState, useRef } from 'react';
import { fetchPopularProducts } from '../api.js';
import ProductCard from './ProductCard.jsx';

/** Best-sellers carousel/grid — pulls top-ordered products from backend. */
export default function BestSellers({ limit = 8 }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const railRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    fetchPopularProducts(limit)
      .then((res) => { if (mounted) setProducts(res?.data || []); })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [limit]);

  const scroll = (dir) => {
    if (!railRef.current) return;
    railRef.current.scrollBy({ left: dir * 320, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="product-rail-loading" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => <div className="skeleton-card" key={i} />)}
      </div>
    );
  }
  if (!products.length) return null;

  return (
    <div className="best-sellers-wrap">
      <button className="rail-nav prev" onClick={() => scroll(-1)} aria-label="←" type="button">‹</button>
      <div className="product-rail" ref={railRef}>
        {products.map((p, i) => (
          <div className="rail-item" key={p._id}>
            <ProductCard product={p} index={i} />
          </div>
        ))}
      </div>
      <button className="rail-nav next" onClick={() => scroll(1)} aria-label="→" type="button">›</button>
    </div>
  );
}
