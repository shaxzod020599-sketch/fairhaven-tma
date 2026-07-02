import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import OurDifference from '../components/OurDifference.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { Flower, Baby, Bottle, Leaf } from '../components/Icons.jsx';

const LIFECYCLE_RU = [
  { Icon: Flower, label: 'Планирование' },
  { Icon: Baby, label: 'Беременность' },
  { Icon: Bottle, label: 'Лактация' },
  { Icon: Leaf, label: 'Менопауза' },
];

const LIFECYCLE_UZ = [
  { Icon: Flower, label: 'Rejalashtirish' },
  { Icon: Baby, label: 'Homiladorlik' },
  { Icon: Bottle, label: 'Emizish' },
  { Icon: Leaf, label: 'Menopauza' },
];

export default function About() {
  const { t, lang } = useI18n();
  const cycle = lang === 'uz' ? LIFECYCLE_UZ : LIFECYCLE_RU;

  return (
    <div className="about-page">
      <div className="container">
        <Breadcrumbs trail={[{ label: t('goHome'), to: '/' }, { label: t('navDifference') }]} />

        <header className="about-hero">
          <div className="about-hero-eyebrow">{t('aboutHero')}</div>
          <h1 className="page-title">{t('aboutTitle')}</h1>
          <p className="about-lead">{t('aboutLead')}</p>
        </header>

        <section className="about-section">
          <OurDifference variant="page" />
        </section>

        <section className="about-section about-mission">
          <div className="about-mission-inner">
            <h2 className="section-title">{t('missionTitle')}</h2>
            <p className="about-mission-text">{t('missionText')}</p>
          </div>
        </section>

        <section className="about-section about-lifecycle">
          <h2 className="section-title">{t('lifecycleTitle')}</h2>
          <p className="about-lifecycle-desc">{t('lifecycleDesc')}</p>
          <div className="lifecycle-flow">
            {cycle.map((c, i) => (
              <React.Fragment key={i}>
                <div className="lifecycle-step">
                  <span className="lifecycle-icon" aria-hidden="true"><c.Icon width={40} height={40} /></span>
                  <span className="lifecycle-label">{c.label}</span>
                </div>
                {i < cycle.length - 1 && <span className="lifecycle-arrow" aria-hidden="true">→</span>}
              </React.Fragment>
            ))}
          </div>
        </section>

        <section className="about-cta">
          <h2 className="about-cta-title">{t('heroCta')}</h2>
          <Link to="/shop" className="btn btn-primary btn-lg">{t('navProducts')} →</Link>
        </section>
      </div>
    </div>
  );
}
