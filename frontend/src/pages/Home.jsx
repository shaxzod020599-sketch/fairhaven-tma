import React from 'react';
import { CATEGORIES } from '../utils/helpers';
import { hapticFeedback } from '../utils/telegram';

const FEATURED = [
  {
    tone: 'terracotta',
    eyebrow: 'Сезон',
    title: 'Иммунитет и энергия',
    desc: 'Витамин D, цинк, магний',
    art: '🍋',
    cat: 'vitamins',
  },
  {
    tone: 'ink',
    eyebrow: 'Новинка',
    title: 'Ботанические экстракты',
    desc: 'Адаптогены премиум-качества',
    art: '🌿',
    cat: 'supplements',
  },
  {
    tone: 'default',
    eyebrow: 'Уход',
    title: 'Косметика без парабенов',
    desc: 'Натуральные формулы',
    art: '🌸',
    cat: 'cosmetics',
  },
];

const TRUST = [
  {
    glyph: '🚚',
    tone: 'terracotta',
    title: 'Доставка за 2 часа',
    desc: 'По всему Ташкенту, бесплатно от 200 000 UZS',
  },
  {
    glyph: '✓',
    tone: 'sage',
    title: 'Сертифицированные бренды',
    desc: 'Оригинальная продукция с гарантией качества',
  },
  {
    glyph: '✦',
    tone: 'butter',
    title: 'Баланс лояльности',
    desc: 'Возвращаем до 5% от каждой покупки',
  },
];

export default function Home({ onNavigate }) {
  const go = (target, data) => {
    hapticFeedback('light');
    onNavigate(target, data);
  };

  return (
    <div className="page" id="page-home">
      {/* Editorial hero */}
      <section className="hero" aria-label="Приветствие">
        <span className="hero-leaf one" aria-hidden="true">🌿</span>
        <span className="hero-leaf two" aria-hidden="true">🌱</span>

        <div className="hero-eyebrow">FAIRHAVEN · APOTHECARY</div>
        <h1 className="hero-title">
          Здоровье —<br />
          в <em>каждой</em> капсуле
        </h1>
        <p className="hero-desc">
          Премиальные витамины, добавки и уход с доставкой в Ташкенте.
        </p>
        <div className="hero-bottom">
          <button className="hero-cta" onClick={() => go('catalog')} id="hero-cta">
            Открыть каталог
            <span className="arrow" aria-hidden="true">→</span>
          </button>

          <div className="hero-stats" aria-hidden="true">
            <div className="stat">
              <strong>240+</strong>
              товаров
            </div>
            <div className="stat">
              <strong>4.9</strong>
              рейтинг
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <div className="section-title">
        Категории
        <span className="eyebrow">6 разделов</span>
      </div>
      <div className="category-grid">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            className="category-tile"
            onClick={() => go('catalog', cat.key)}
            id={`home-cat-${cat.key}`}
          >
            <span className="cat-glyph" aria-hidden="true">{cat.icon}</span>
            <span className="cat-label">{cat.label}</span>
            <span className="cat-arrow" aria-hidden="true">↗</span>
          </button>
        ))}
      </div>

      {/* Featured collections */}
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
        {FEATURED.map((f, i) => (
          <button
            key={i}
            className={`featured-card ${f.tone}`}
            onClick={() => go('catalog', f.cat)}
            id={`featured-${i}`}
          >
            <span className="featured-art" aria-hidden="true">{f.art}</span>
            <div className="featured-eyebrow">{f.eyebrow}</div>
            <div className="featured-title">{f.title}</div>
            <div className="featured-desc">{f.desc}</div>
            <span className="featured-cta">
              Смотреть
              <span aria-hidden="true">→</span>
            </span>
          </button>
        ))}
      </div>

      {/* Promo */}
      <div className="promo-banner" role="note">
        <span className="promo-art" aria-hidden="true">✦</span>
        <div className="promo-text">
          <div className="promo-eyebrow">Первый заказ</div>
          <div className="promo-title">Скидка 10% по промокоду</div>
        </div>
        <div className="promo-code">FAIR10</div>
      </div>

      {/* Trust / features */}
      <div className="section-title">Почему FairHaven</div>
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

      <div style={{ height: 24 }} />
    </div>
  );
}
