import React from 'react';
import { hapticFeedback } from '../utils/telegram';

const SUPPORT_PHONE = '+998 78 150 04 40';
const SUPPORT_PHONE_TEL = '+998781500440';

const FEATURED = [
  {
    tone: 'terracotta',
    eyebrow: 'Для неё',
    title: 'Женская фертильность',
    desc: 'OvaBoost · FertilAid · FertiliTea',
    art: '🌸',
  },
  {
    tone: 'ink',
    eyebrow: 'Для него',
    title: 'Мужская фертильность',
    desc: 'FertilAid · Motility · Count Boost',
    art: '🌿',
  },
  {
    tone: 'default',
    eyebrow: 'Материнство',
    title: 'Беременность и лактация',
    desc: 'PeaPod · Nursing Blend · Fenugreek',
    art: '🤱',
  },
];

const TRUST = [
  {
    glyph: '🚚',
    tone: 'terracotta',
    title: 'Доставка за 2 часа',
    desc: 'По всему Ташкенту, бесплатно от 500 000 UZS',
  },
  {
    glyph: '✓',
    tone: 'sage',
    title: 'Официальный дилер',
    desc: 'Оригинальная продукция FairHaven Health из США',
  },
  {
    glyph: '✦',
    tone: 'butter',
    title: 'Консультация',
    desc: 'Бесплатный подбор — каждый рабочий день',
  },
];

export default function Home({ onNavigate }) {
  const go = (target, data) => {
    hapticFeedback('light');
    onNavigate(target, data);
  };

  const callSupport = () => {
    hapticFeedback('medium');
    window.location.href = `tel:${SUPPORT_PHONE_TEL}`;
  };

  return (
    <div className="page" id="page-home">
      {/* Editorial hero */}
      <section className="hero" aria-label="Приветствие">
        <span className="hero-leaf one" aria-hidden="true">🌿</span>
        <span className="hero-leaf two" aria-hidden="true">🌱</span>

        <div className="hero-eyebrow">FAIRHAVEN HEALTH · USA</div>
        <h1 className="hero-title">
          Репродуктивное —<br />
          <em>здоровье</em> семьи
        </h1>
        <p className="hero-desc">
          Официальный дилер FairHaven Health в Узбекистане.
          Фертильность, беременность, лактация.
        </p>
        <div className="hero-bottom">
          <button className="hero-cta" onClick={() => go('catalog')} id="hero-cta">
            Открыть каталог
            <span className="arrow" aria-hidden="true">→</span>
          </button>

          <div className="hero-stats" aria-hidden="true">
            <div className="stat">
              <strong>22</strong>
              продукта
            </div>
            <div className="stat">
              <strong>100%</strong>
              оригинал
            </div>
          </div>
        </div>
      </section>

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
            onClick={() => go('catalog')}
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

      {/* Contact Centre — big primary block at the bottom of Home */}
      <section className="contact-centre" id="home-contact-centre" aria-label="Контакт-центр">
        <div className="contact-leaf" aria-hidden="true">🌿</div>
        <div className="contact-eyebrow">24/7 · КОНТАКТ-ЦЕНТР</div>
        <div className="contact-title">
          Нужна <em>консультация?</em>
        </div>
        <div className="contact-desc">
          Наш специалист поможет подобрать продукт под ваш запрос,
          ответит на вопросы о приёме и доставке.
        </div>
        <a
          href={`tel:${SUPPORT_PHONE_TEL}`}
          className="contact-phone"
          onClick={callSupport}
          id="home-contact-phone"
        >
          <span className="contact-phone-icon" aria-hidden="true">☎</span>
          <span className="contact-phone-number">{SUPPORT_PHONE}</span>
          <span className="contact-phone-arrow" aria-hidden="true">→</span>
        </a>
        <div className="contact-meta">
          Ежедневно · 9:00 – 21:00 (Asia/Tashkent)
        </div>
      </section>

      <div style={{ height: 24 }} />
    </div>
  );
}
