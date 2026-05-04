import React, { useEffect, useState } from 'react';
import { hapticFeedback } from '../utils/telegram';
import {
  fetchPopularProducts,
  fetchPublicCollections,
  fetchPublicSettings,
} from '../utils/api';
import { statusMeta, shortId, formatDate } from '../utils/orderStatus';
import { formatPrice } from '../utils/helpers';
import ProductCard from '../components/ProductCard';
import ProductDetail from '../components/ProductDetail';

const DEFAULT_PHONE = '+998 78 150 04 40';
const DEFAULT_PHONE_TEL = '+998781500440';
const DEFAULT_HOURS = 'Ежедневно · 9:00 – 21:00 (Asia/Tashkent)';

const DEFAULT_HERO = {
  eyebrow: 'FAIRHAVEN HEALTH · USA',
  titlePre: 'Репродуктивное —',
  titleEm: 'здоровье',
  titlePost: 'семьи',
  desc: 'Официальный дилер Fairhaven Health в Узбекистане. Фертильность, беременность, лактация.',
  cta: 'Открыть каталог',
  stat1Val: '22',
  stat1Label: 'продукта',
  stat2Val: '100%',
  stat2Label: 'оригинал',
};

const FEATURED_FALLBACK = [
  {
    _id: 'fb-1',
    tone: 'terracotta',
    eyebrow: 'Для неё',
    name: 'Женская фертильность',
    description: 'OvaBoost · FertilAid · FertiliTea',
    art: '🌸',
  },
  {
    _id: 'fb-2',
    tone: 'ink',
    eyebrow: 'Для него',
    name: 'Мужская фертильность',
    description: 'FertilAid · Motility · Count Boost',
    art: '🌿',
  },
  {
    _id: 'fb-3',
    tone: 'default',
    eyebrow: 'Материнство',
    name: 'Беременность и лактация',
    description: 'PeaPod · Nursing Blend · Fenugreek',
    art: '🤱',
  },
];

const TRUST = [
  {
    glyph: '🚚',
    tone: 'terracotta',
    title: 'Доставка за 2 часа',
    desc: 'По всему Узбекистану, бесплатно от 500 000 UZS',
  },
  {
    glyph: '✓',
    tone: 'sage',
    title: 'Официальный дилер',
    desc: 'Оригинальная продукция Fairhaven Health из США',
  },
  {
    glyph: '✦',
    tone: 'butter',
    title: 'Консультация',
    desc: 'Бесплатный подбор — каждый рабочий день',
  },
];

export default function Home({ onNavigate, onAddToCart, activeOrders = [], dbUser }) {
  const [popular, setPopular] = useState([]);
  const [popularLoading, setPopularLoading] = useState(true);
  const [detailProduct, setDetailProduct] = useState(null);
  const [collections, setCollections] = useState(FEATURED_FALLBACK);
  const [activeCollection, setActiveCollection] = useState(null);
  const [supportPhone, setSupportPhone] = useState(DEFAULT_PHONE);
  const [supportPhoneTel, setSupportPhoneTel] = useState(DEFAULT_PHONE_TEL);
  const [supportHours, setSupportHours] = useState(DEFAULT_HOURS);
  const [hero, setHero] = useState(DEFAULT_HERO);

  useEffect(() => {
    let mounted = true;
    fetchPopularProducts(3)
      .then((res) => { if (mounted) setPopular(res?.data || []); })
      .catch(() => { if (mounted) setPopular([]); })
      .finally(() => { if (mounted) setPopularLoading(false); });

    fetchPublicCollections()
      .then((res) => {
        if (!mounted) return;
        const list = res?.data || [];
        if (list.length) setCollections(list);
      })
      .catch(() => {});

    fetchPublicSettings()
      .then((res) => {
        if (!mounted) return;
        const s = res?.data || {};
        if (s.support_phone) setSupportPhone(s.support_phone);
        if (s.support_phone_tel) setSupportPhoneTel(s.support_phone_tel);
        if (s.support_hours) setSupportHours(s.support_hours);
        setHero({
          eyebrow: s.hero_eyebrow || DEFAULT_HERO.eyebrow,
          titlePre: s.hero_title_pre ?? DEFAULT_HERO.titlePre,
          titleEm: s.hero_title_em ?? DEFAULT_HERO.titleEm,
          titlePost: s.hero_title_post ?? DEFAULT_HERO.titlePost,
          desc: s.hero_desc || DEFAULT_HERO.desc,
          cta: s.hero_cta || DEFAULT_HERO.cta,
          stat1Val: s.hero_stat1_value || DEFAULT_HERO.stat1Val,
          stat1Label: s.hero_stat1_label || DEFAULT_HERO.stat1Label,
          stat2Val: s.hero_stat2_value || DEFAULT_HERO.stat2Val,
          stat2Label: s.hero_stat2_label || DEFAULT_HERO.stat2Label,
        });
      })
      .catch(() => {});

    return () => { mounted = false; };
  }, []);

  const go = (target, data) => {
    hapticFeedback('light');
    onNavigate(target, data);
  };

  const callSupport = () => {
    hapticFeedback('medium');
    window.location.href = `tel:${supportPhoneTel}`;
  };

  const openCollection = (col) => {
    hapticFeedback('light');
    if (col && col._id && !col._id.startsWith('fb-')) {
      setActiveCollection(col);
    } else {
      onNavigate('catalog');
    }
  };

  return (
    <div className="page" id="page-home">
      {/* Active order banner(s) — survives reload because it reads from DB */}
      {activeOrders.length > 0 && (
        <section className="active-orders-band" aria-label="Активные заказы">
          <div className="active-orders-head">
            <span className="active-orders-eyebrow">ТЕКУЩИЙ ЗАКАЗ</span>
            {activeOrders.length > 1 && (
              <button
                className="active-orders-see-all"
                onClick={() => go('orders')}
              >
                Все ({activeOrders.length}) →
              </button>
            )}
          </div>
          {activeOrders.slice(0, 2).map((order) => (
            <ActiveOrderCard
              key={order._id}
              order={order}
              onClick={() => go('orderDetail', order._id)}
            />
          ))}
        </section>
      )}

      {/* Editorial hero */}
      <section className="hero" aria-label="Приветствие">
        <span className="hero-leaf one" aria-hidden="true">🌿</span>
        <span className="hero-leaf two" aria-hidden="true">🌱</span>

        <div className="hero-eyebrow">{hero.eyebrow}</div>
        <h1 className="hero-title">
          {hero.titlePre}{hero.titlePre && <br />}
          {hero.titleEm && <em>{hero.titleEm}</em>}{hero.titleEm && hero.titlePost ? ' ' : ''}{hero.titlePost}
        </h1>
        {hero.desc && <p className="hero-desc">{hero.desc}</p>}
        <div className="hero-bottom">
          <button className="hero-cta" onClick={() => go('catalog')} id="hero-cta">
            {hero.cta}
            <span className="arrow" aria-hidden="true">→</span>
          </button>

          <div className="hero-stats" aria-hidden="true">
            {hero.stat1Val && (
              <div className="stat">
                <strong>{hero.stat1Val}</strong>
                {hero.stat1Label}
              </div>
            )}
            {hero.stat2Val && (
              <div className="stat">
                <strong>{hero.stat2Val}</strong>
                {hero.stat2Label}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Популярные — top-3 most ordered */}
      <div className="section-title" style={{ marginBottom: 10 }}>
        Популярные
        <button
          className="link-see-all"
          onClick={() => go('catalog')}
          id="popular-see-all"
        >
          Все →
        </button>
      </div>
      {popularLoading ? (
        <div className="popular-rail-skeleton" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton-card">
              <div className="skeleton-media" />
              <div className="skeleton-line short" />
              <div className="skeleton-line long" />
              <div className="skeleton-line mid" />
            </div>
          ))}
        </div>
      ) : popular.length === 0 ? (
        <div className="popular-empty">
          Скоро здесь появятся лидеры продаж Fairhaven Health.
        </div>
      ) : (
        <div className="popular-grid">
          {popular.map((product, idx) => (
            <div className="popular-card-wrap" key={product._id}>
              <div className="popular-rank" aria-hidden="true">
                {idx + 1}
              </div>
              <ProductCard
                product={product}
                onAdd={onAddToCart}
                onOpen={setDetailProduct}
              />
            </div>
          ))}
        </div>
      )}

      {/* Featured collections */}
      {collections.length > 0 && (
        <>
          <div className="section-title" style={{ marginBottom: 8 }}>
            Подборки
            <button
              className="link-see-all"
              onClick={() => go('catalog')}
              id="featured-see-all"
            >
              Все →
            </button>
          </div>
          <div className="featured-rail">
            {collections.map((f, i) => (
              <button
                key={f._id || i}
                className={`featured-card ${f.tone || 'default'}`}
                onClick={() => openCollection(f)}
                id={`featured-${i}`}
                style={f.imageUrl ? {
                  backgroundImage: `linear-gradient(155deg, rgba(14,43,31,0.45), rgba(14,43,31,0.15)), url(${f.imageUrl})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  color: 'var(--paper)',
                } : undefined}
              >
                {!f.imageUrl && (
                  <span className="featured-art" aria-hidden="true">{f.art || '✦'}</span>
                )}
                <div className="featured-eyebrow">{f.eyebrow || 'Подборка'}</div>
                <div className="featured-title">{f.name || f.title}</div>
                {(f.description || f.desc) && (
                  <div className="featured-desc">{f.description || f.desc}</div>
                )}
                <span className="featured-cta">
                  Смотреть
                  <span aria-hidden="true">→</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Trust / features */}
      <div className="section-title">Почему мы</div>
      <div className="info-stack">
        {TRUST.map((t, i) => (
          <div key={i} className="info-card">
            <div className={`info-glyph ${t.tone}`} aria-hidden="true">{t.glyph}</div>
            <div className="info-body">
              <div className="info-title">{t.title}</div>
              <div className="info-desc">{t.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Contact Centre */}
      <section className="contact-centre" id="home-contact-centre" aria-label="Контакт-центр">
        <div className="contact-leaf" aria-hidden="true">🌿</div>
        <div className="contact-eyebrow">24/7 · КОНТАКТ-ЦЕНТР</div>
        <div className="contact-title">
          Нужна <em>консультация?</em>
        </div>
        <div className="contact-desc">
          Специалист Fairhaven Health поможет подобрать продукт под ваш запрос,
          ответит на вопросы о приёме и доставке.
        </div>
        <a
          href={`tel:${supportPhoneTel}`}
          className="contact-phone"
          onClick={callSupport}
          id="home-contact-phone"
        >
          <span className="contact-phone-icon" aria-hidden="true">☎</span>
          <span className="contact-phone-number">{supportPhone}</span>
          <span className="contact-phone-arrow" aria-hidden="true">→</span>
        </a>
        <div className="contact-meta">
          {supportHours}
        </div>
      </section>

      <div className="home-footer">
        <a
          className="author-credit"
          href="https://t.me/leon7647"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Автор проекта"
        >
          made by <span className="author-credit-handle">@leon7647</span>
        </a>
      </div>

      {detailProduct && (
        <ProductDetail
          product={detailProduct}
          onClose={() => setDetailProduct(null)}
          onAdd={onAddToCart}
          dbUser={dbUser}
        />
      )}

      {activeCollection && (
        <CollectionView
          collection={activeCollection}
          onClose={() => setActiveCollection(null)}
          onAdd={onAddToCart}
          onOpenProduct={(p) => { setActiveCollection(null); setDetailProduct(p); }}
        />
      )}
    </div>
  );
}

function CollectionView({ collection, onClose, onAdd, onOpenProduct }) {
  const products = collection.productIds || [];
  return (
    <div className="collection-overlay" onClick={onClose}>
      <div className="collection-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="collection-close" onClick={onClose} aria-label="Закрыть">×</button>
        <div className={`collection-hero ${collection.tone || 'default'}`} style={
          collection.imageUrl ? {
            backgroundImage: `linear-gradient(155deg, rgba(14,43,31,0.55), rgba(14,43,31,0.1)), url(${collection.imageUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            color: 'var(--paper)',
          } : undefined
        }>
          {collection.eyebrow && <div className="collection-eyebrow">{collection.eyebrow}</div>}
          <h2 className="collection-title">{collection.name}</h2>
          {collection.description && <p className="collection-desc">{collection.description}</p>}
        </div>
        {products.length === 0 ? (
          <div className="empty-generic"><div className="art">🌾</div><p>В этой подборке пока нет товаров</p></div>
        ) : (
          <div className="product-grid" style={{ marginTop: 18 }}>
            {products.map((p) => (
              <ProductCard
                key={p._id}
                product={p}
                onAdd={onAdd}
                onOpen={onOpenProduct}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActiveOrderCard({ order, onClick }) {
  const meta = statusMeta(order.status);
  const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);
  return (
    <button
      className={`active-order-card ${meta.tone}`}
      onClick={onClick}
      id={`active-order-${order._id}`}
      type="button"
    >
      <div className="active-order-glyph" aria-hidden="true">{meta.glyph}</div>
      <div className="active-order-body">
        <div className="active-order-status">{meta.label}</div>
        <div className="active-order-title">
          Заказ #{shortId(order)} · {itemCount} {itemCount === 1 ? 'товар' : 'товаров'}
        </div>
        <div className="active-order-meta">
          {formatDate(order.createdAt)} · {formatPrice(order.totalAmount)}
        </div>
      </div>
      <div className="active-order-arrow" aria-hidden="true">→</div>
    </button>
  );
}
