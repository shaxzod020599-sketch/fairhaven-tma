import React from 'react';
import { CATEGORIES } from '../utils/helpers';

export default function Home({ onNavigate }) {
  return (
    <div className="page" id="page-home">
      {/* Hero Section */}
      <div style={{
        background: 'linear-gradient(135deg, #DC143C 0%, #FF6B6B 100%)',
        borderRadius: 'var(--radius-xl)',
        padding: '28px 22px',
        color: '#fff',
        marginBottom: 24,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: -20, right: -20,
          width: 120, height: 120,
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '50%',
        }} />
        <div style={{
          position: 'absolute', bottom: -30, right: 30,
          width: 80, height: 80,
          background: 'rgba(255,255,255,0.08)',
          borderRadius: '50%',
        }} />
        <div style={{ fontSize: '2rem', marginBottom: 8 }}>🌿</div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 6, lineHeight: 1.2 }}>
          Добро пожаловать в FairHaven
        </h1>
        <p style={{ fontSize: '0.85rem', opacity: 0.9, lineHeight: 1.5, marginBottom: 16 }}>
          Витамины, добавки и средства для здоровья с доставкой по Ташкенту
        </p>
        <button
          onClick={() => onNavigate('catalog')}
          style={{
            background: '#fff',
            color: '#DC143C',
            padding: '10px 24px',
            borderRadius: 'var(--radius-full)',
            fontWeight: 700,
            fontSize: '0.85rem',
            border: 'none',
            cursor: 'pointer',
            transition: 'var(--transition)',
          }}
          id="hero-cta"
        >
          Перейти в каталог →
        </button>
      </div>

      {/* Categories */}
      <h2 className="section-title">Категории</h2>
      <div className="category-grid">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            className="category-chip"
            onClick={() => onNavigate('catalog', cat.key)}
            id={`home-cat-${cat.key}`}
          >
            <span className="cat-icon">{cat.icon}</span>
            <span className="cat-label">{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Features */}
      <h2 className="section-title" style={{ marginTop: 8 }}>Почему FairHaven?</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          { icon: '🚚', title: 'Быстрая доставка', desc: 'По Ташкенту в течение 2 часов' },
          { icon: '✅', title: 'Оригинальные товары', desc: 'Только сертифицированная продукция' },
          { icon: '💰', title: 'Лучшие цены', desc: 'Накопительная система скидок' },
        ].map((f, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 16px', background: 'var(--color-card)',
            borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
          }}>
            <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>{f.icon}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 2 }}>{f.title}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>{f.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
