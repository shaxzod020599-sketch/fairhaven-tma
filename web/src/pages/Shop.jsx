import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { fetchProducts, fetchCategories } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import ProductCard from '../components/ProductCard.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { LIFE_STAGES } from '../helpers.js';
import { Sprout } from '../components/Icons.jsx';

const CATEGORIES = [
  { key: 'supplements', ru: 'Добавки', uz: "Qo'shimchalar" },
  { key: 'vitamins', ru: 'Витамины', uz: 'Vitaminlar' },
  { key: 'parapharmaceuticals', ru: 'Парафармация', uz: 'Parafarmatsiya' },
  { key: 'drinks', ru: 'Напитки', uz: 'Ichimliklar' },
  { key: 'hygiene', ru: 'Гигиена', uz: 'Gigiyena' },
  { key: 'cosmetics', ru: 'Косметика', uz: 'Kosmetika' },
];

export default function Shop() {
  const { t, lang } = useI18n();
  const { stage } = useParams();
  const [searchParams] = useSearchParams();
  const querySearch = searchParams.get('q') || '';
  const tagFilter = searchParams.get('tag') || '';
  const categoryParam = searchParams.get('category') || '';

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [catFilter, setCatFilter] = useState(categoryParam);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [sort, setSort] = useState('popular');

  // Resolve stage meta
  const stageMeta = useMemo(
    () => LIFE_STAGES.find((s) => s.slug === stage) || null,
    [stage]
  );

  // Header mega-menu navigates with ?category= — follow those changes.
  useEffect(() => {
    setCatFilter(categoryParam);
  }, [categoryParam]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    const params = {};
    if (catFilter) params.category = catFilter;
    if (availableOnly) params.available = 'true';
    if (querySearch) params.search = querySearch;

    fetchProducts(params)
      .then((res) => {
        if (!mounted) return;
        let list = res?.data || [];

        // Client-side tag filter for life-stage (backend filters by category, not tags)
        if (stageMeta) {
          list = list.filter(
            (p) => Array.isArray(p.tags) && p.tags.includes(stageMeta.tag)
          );
        }
        // Client-side tag filter from ?tag= query (e.g. /shop?tag=bundle)
        if (tagFilter) {
          list = list.filter(
            (p) => Array.isArray(p.tags) && p.tags.includes(tagFilter)
          );
        }
        setProducts(list);
      })
      .catch(() => { if (mounted) setProducts([]); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [stage, catFilter, availableOnly, querySearch, tagFilter, stageMeta]);

  // Sort
  const sorted = useMemo(() => {
    const list = [...products];
    if (sort === 'price_asc') list.sort((a, b) => (a.price || 0) - (b.price || 0));
    else if (sort === 'price_desc') list.sort((a, b) => (b.price || 0) - (a.price || 0));
    else if (sort === 'name') list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return list;
  }, [products, sort]);

  const stageLabelKey = stageMeta
    ? ({
        'fertility-women': 'stageFertilityWomen',
        'fertility-men': 'stageFertilityMen',
        pregnant: 'stagePregnant',
        nursing: 'stageNursing',
        menopause: 'stageMenopause',
      }[stageMeta.slug])
    : null;

  const clearFilters = () => {
    setCatFilter('');
    setAvailableOnly(false);
  };

  return (
    <div className="shop-page">
      <div className="container">
        <Breadcrumbs
          trail={[
            { label: t('goHome'), to: '/' },
            { label: t('shopTitle'), to: '/shop' },
            ...(stageLabelKey ? [{ label: t(stageLabelKey) }] : []),
          ]}
        />

        <header className="shop-header">
          <h1 className="page-title">
            {stageLabelKey ? t(stageLabelKey) : querySearch ? `"${querySearch}"` : t('shopTitle')}
          </h1>
          <p className="shop-count">{sorted.length} {t('results')}</p>
        </header>

        <div className="shop-layout">
          {/* Sidebar filters */}
          <aside className="shop-filters">
            <div className="filter-group">
              <h3 className="filter-title">{t('filterCategory')}</h3>
              <ul className="filter-list">
                <li>
                  <button
                    className={`filter-chip ${!catFilter ? 'active' : ''}`}
                    onClick={() => setCatFilter('')}
                    type="button"
                  >
                    {t('famAll')}
                  </button>
                </li>
                {CATEGORIES.map((c) => (
                  <li key={c.key}>
                    <button
                      className={`filter-chip ${catFilter === c.key ? 'active' : ''}`}
                      onClick={() => setCatFilter(c.key)}
                      type="button"
                    >
                      {lang === 'uz' ? c.uz : c.ru}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="filter-group">
              <h3 className="filter-title">{t('filterAvailability')}</h3>
              <label className="filter-check">
                <input
                  type="checkbox"
                  checked={availableOnly}
                  onChange={(e) => setAvailableOnly(e.target.checked)}
                />
                {t('inStock')}
              </label>
            </div>

            <div className="filter-group">
              <h3 className="filter-title">{t('navStage')}</h3>
              <ul className="filter-list">
                <li>
                  <Link to="/shop" className={`filter-chip ${!stage ? 'active' : ''}`}>
                    {t('famAll')}
                  </Link>
                </li>
                {LIFE_STAGES.map((s) => {
                  const lk = ({
                    'fertility-women': 'stageFertilityWomen',
                    'fertility-men': 'stageFertilityMen',
                    pregnant: 'stagePregnant',
                    nursing: 'stageNursing',
                    menopause: 'stageMenopause',
                  })[s.slug];
                  return (
                    <li key={s.slug}>
                      <Link
                        to={`/shop/${s.slug}`}
                        className={`filter-chip ${stage === s.slug ? 'active' : ''}`}
                      >
                        <span aria-hidden="true">{s.icon}</span> {t(lk)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>

            <button className="btn btn-text" onClick={clearFilters} type="button">
              {t('clearFilters')}
            </button>
          </aside>

          {/* Grid + toolbar */}
          <div className="shop-main">
            <div className="shop-toolbar">
              <label className="sort-wrap">
                {t('sort')}:
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="popular">{t('sortPopular')}</option>
                  <option value="price_asc">{t('sortPriceAsc')}</option>
                  <option value="price_desc">{t('sortPriceDesc')}</option>
                  <option value="name">{t('sortName')}</option>
                </select>
              </label>
            </div>

            {loading ? (
              <div className="product-grid">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div className="skeleton-card" key={i} />
                ))}
              </div>
            ) : sorted.length === 0 ? (
              <div className="shop-empty">
                <div className="empty-art" aria-hidden="true"><Sprout width={72} height={72} /></div>
                <p>{t('emptyShop')}</p>
                <button className="btn btn-outline" onClick={clearFilters} type="button">
                  {t('clearFilters')}
                </button>
              </div>
            ) : (
              <div className="product-grid">
                {sorted.map((p, i) => (
                  <ProductCard key={p._id} product={p} index={i} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
