import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchProducts } from '../utils/api';
import { CATEGORIES, debounce } from '../utils/helpers';
import ProductCard from '../components/ProductCard';
import Loading from '../components/Loading';

export default function Catalog({ initialCategory, onAddToCart }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState(initialCategory || null);

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    if (initialCategory) {
      setActiveCategory(initialCategory);
    }
  }, [initialCategory]);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const res = await fetchProducts();
      setProducts(res.data || []);
    } catch (err) {
      console.error('Failed to load products:', err);
      // Fallback: show empty
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = useCallback(
    debounce((value) => {
      setSearch(value);
    }, 250),
    []
  );

  const filtered = useMemo(() => {
    let items = products;

    if (activeCategory) {
      items = items.filter((p) => p.category === activeCategory);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.brand && p.brand.toLowerCase().includes(q)) ||
          (p.description && p.description.toLowerCase().includes(q))
      );
    }

    // Available products first
    return items.sort((a, b) => {
      if (a.isAvailable === b.isAvailable) return 0;
      return a.isAvailable ? -1 : 1;
    });
  }, [products, activeCategory, search]);

  const handleCategoryToggle = (key) => {
    setActiveCategory((prev) => (prev === key ? null : key));
  };

  return (
    <div className="page" id="page-catalog">
      {/* Search */}
      <div className="search-bar">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          placeholder="Поиск витаминов и добавок..."
          onChange={(e) => handleSearch(e.target.value)}
          id="catalog-search"
        />
      </div>

      {/* Categories */}
      <div className="category-grid">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            className={`category-chip ${activeCategory === cat.key ? 'active' : ''}`}
            onClick={() => handleCategoryToggle(cat.key)}
            id={`cat-chip-${cat.key}`}
          >
            <span className="cat-icon">{cat.icon}</span>
            <span className="cat-label">{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Product count */}
      <div style={{
        fontSize: '0.8rem',
        color: 'var(--color-text-secondary)',
        marginBottom: 12,
      }}>
        {loading ? '' : `Найдено: ${filtered.length}`}
      </div>

      {/* Products */}
      {loading ? (
        <Loading text="Загрузка товаров..." />
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-secondary)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>🔍</div>
          <p>Товары не найдены</p>
        </div>
      ) : (
        <div className="product-grid">
          {filtered.map((product) => (
            <ProductCard
              key={product._id}
              product={product}
              onAdd={onAddToCart}
            />
          ))}
        </div>
      )}
    </div>
  );
}
