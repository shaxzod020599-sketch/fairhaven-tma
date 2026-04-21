import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { fetchProducts } from '../utils/api';
import { CATEGORIES, debounce } from '../utils/helpers';
import { DEMO_PRODUCTS } from '../utils/demoProducts';
import ProductCard from '../components/ProductCard';
import ProductDetail from '../components/ProductDetail';
import { hapticFeedback } from '../utils/telegram';

const SORTS = [
  { key: 'popular', label: 'Популярные' },
  { key: 'price_asc', label: 'Сначала дешевле' },
  { key: 'price_desc', label: 'Сначала дороже' },
  { key: 'new', label: 'Новинки' },
];

function Skeleton() {
  return (
    <div className="skeleton-grid" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton-card">
          <div className="skeleton-media" />
          <div className="skeleton-line short" />
          <div className="skeleton-line long" />
          <div className="skeleton-line mid" />
        </div>
      ))}
    </div>
  );
}

export default function Catalog({ initialCategory, onAddToCart }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState(initialCategory || null);
  const [sort, setSort] = useState('popular');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [detailProduct, setDetailProduct] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    if (initialCategory) setActiveCategory(initialCategory);
  }, [initialCategory]);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const res = await fetchProducts();
      const items = res?.data || [];
      setProducts(items.length > 0 ? items : DEMO_PRODUCTS);
    } catch (err) {
      console.warn('API unreachable, using demo catalog:', err.message);
      setProducts(DEMO_PRODUCTS);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchInput = useCallback(
    debounce((value) => setSearch(value), 220),
    []
  );

  const clearSearch = () => {
    if (inputRef.current) inputRef.current.value = '';
    setSearch('');
  };

  const filtered = useMemo(() => {
    let items = [...products];

    if (activeCategory) items = items.filter((p) => p.category === activeCategory);

    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.brand && p.brand.toLowerCase().includes(q)) ||
          (p.description && p.description.toLowerCase().includes(q))
      );
    }

    switch (sort) {
      case 'price_asc':
        items.sort((a, b) => (a.price || 0) - (b.price || 0));
        break;
      case 'price_desc':
        items.sort((a, b) => (b.price || 0) - (a.price || 0));
        break;
      case 'new':
        items.sort((a, b) => (b.isNew === true) - (a.isNew === true));
        break;
      default:
        items.sort((a, b) => {
          if (a.isAvailable === b.isAvailable) return 0;
          return a.isAvailable ? -1 : 1;
        });
    }

    // available always first
    return items.sort((a, b) => {
      if (a.isAvailable === b.isAvailable) return 0;
      return a.isAvailable ? -1 : 1;
    });
  }, [products, activeCategory, search, sort]);

  const handleCategoryToggle = (key) => {
    hapticFeedback('light');
    setActiveCategory((prev) => (prev === key ? null : key));
  };

  const activeSortLabel = SORTS.find((s) => s.key === sort)?.label || 'Сортировка';

  return (
    <div className="page" id="page-catalog">
      <h1 className="page-title">Каталог</h1>
      <p className="page-subtitle">
        {activeCategory
          ? CATEGORIES.find((c) => c.key === activeCategory)?.label
          : 'Все категории'}
      </p>

      {/* Search */}
      <div className="search-bar">
        <span className="search-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
            <path d="m14 14 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        <input
          ref={inputRef}
          type="text"
          placeholder="Витамины, бренд или состав…"
          onChange={(e) => handleSearchInput(e.target.value)}
          id="catalog-search"
        />
        {search && (
          <button className="search-clear" onClick={clearSearch} aria-label="Очистить">
            ×
          </button>
        )}
      </div>

      {/* Category rail */}
      <div className="category-rail" role="tablist" id="catalog-categories">
        <button
          className={`category-pill ${!activeCategory ? 'active' : ''}`}
          onClick={() => setActiveCategory(null)}
          id="cat-pill-all"
        >
          <span className="pg" aria-hidden="true">✦</span>
          Все
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            className={`category-pill ${activeCategory === cat.key ? 'active' : ''}`}
            onClick={() => handleCategoryToggle(cat.key)}
            id={`cat-pill-${cat.key}`}
          >
            <span className="pg" aria-hidden="true">{cat.icon}</span>
            {cat.label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-count">
          {loading ? 'Загрузка…' : (
            <>
              Найдено: <strong>{filtered.length}</strong>
            </>
          )}
        </div>
        <div className="toolbar-actions" style={{ position: 'relative' }}>
          <button
            className="toolbar-btn"
            onClick={() => setShowSortMenu((v) => !v)}
            id="toolbar-sort"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 5h10M5 8h6M7 11h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            {activeSortLabel}
          </button>
          {showSortMenu && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                right: 0,
                background: 'var(--paper-warm)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--r-md)',
                boxShadow: 'var(--shadow-md)',
                padding: 4,
                zIndex: 50,
                minWidth: 170,
                animation: 'scaleIn 180ms var(--ease-out)',
              }}
            >
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => {
                    setSort(s.key);
                    setShowSortMenu(false);
                    hapticFeedback('light');
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '10px 12px',
                    textAlign: 'left',
                    fontSize: '0.82rem',
                    fontWeight: sort === s.key ? 600 : 500,
                    color: sort === s.key ? 'var(--ink)' : 'var(--ink-soft)',
                    background: sort === s.key ? 'var(--butter)' : 'transparent',
                    borderRadius: 'var(--r-sm)',
                  }}
                  id={`sort-${s.key}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Products */}
      {loading ? (
        <Skeleton />
      ) : filtered.length === 0 ? (
        <div className="empty-generic">
          <div className="art" aria-hidden="true">🌾</div>
          <p>Ничего не найдено. Попробуйте изменить запрос.</p>
        </div>
      ) : (
        <div className="product-grid">
          {filtered.map((product) => (
            <ProductCard
              key={product._id}
              product={product}
              onAdd={onAddToCart}
              onOpen={setDetailProduct}
            />
          ))}
        </div>
      )}

      {detailProduct && (
        <ProductDetail
          product={detailProduct}
          onClose={() => setDetailProduct(null)}
          onAdd={onAddToCart}
        />
      )}
    </div>
  );
}
