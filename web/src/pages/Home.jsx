import React, { Suspense, lazy, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import LifeStageTiles from '../components/LifeStageTiles.jsx';
import OurDifference from '../components/OurDifference.jsx';
import BestSellers from '../components/BestSellers.jsx';
import Reviews from '../components/Reviews.jsx';
import BlogTeaser from '../components/BlogTeaser.jsx';
import SectionHeader from '../components/SectionHeader.jsx';
import { Gift } from '../components/Icons.jsx';

// Lazy-load 3D hero so the Three.js bundle is split out of the main chunk.
const Hero3D = lazy(() => import('../components/Hero3D.jsx'));

// Static fallback markup — shared by Suspense loading + mobile/no-WebGL.
// Gate lives HERE (not inside Hero3D) so mobile never triggers the 300kB import.
function HeroFallback() {
  return (
    <div className="hero-product-static">
      <img
        src="/assets/fh-pro-women.avif"
        alt=""
        width="1600"
        height="1600"
        decoding="async"
      />
    </div>
  );
}

// Gate: only desktop + fine pointer + WebGL gets the 3D chunk.
function use3dSupported() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px) and (pointer: fine)');
    const webgl = (() => {
      try {
        const c = document.createElement('canvas');
        return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
      } catch { return false; }
    })();
    const apply = () => setOk(mq.matches && webgl);
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);
  return ok;
}

/**
 * Homepage — section order mirrors fairhavenhealth.com:
 * hero → shop-by-stage → our difference → best sellers → bundles promo →
 * reviews → blog teaser. (Newsletter + trust badges live in the footer.)
 */
export default function Home() {
  const { t } = useI18n();
  const show3d = use3dSupported();

  return (
    <div className="home">
      {/* 1. Hero */}
      <section className="hero-section">
        <div className="container hero-inner">
          <div className="hero-copy">
            <div className="hero-eyebrow">{t('heroEyebrow')}</div>
            <h1 className="hero-title">
              {t('heroTitlePre')} <em>{t('heroTitleEm')}</em> {t('heroTitlePost')}
            </h1>
            <p className="hero-desc">{t('heroDesc')}</p>
            <div className="hero-cta-row">
              <Link to="/shop" className="btn btn-primary btn-lg">
                {t('heroCta')} <span aria-hidden="true">→</span>
              </Link>
            </div>
            <div className="hero-stats">
              <div className="hero-stat">
                <strong>{t('heroStat1')}</strong>
                <span>{t('heroStat1Label')}</span>
              </div>
              <div className="hero-stat">
                <strong>{t('heroStat2')}</strong>
                <span>{t('heroStat2Label')}</span>
              </div>
            </div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="hero-glow" />
            {show3d ? (
              <Suspense fallback={<HeroFallback />}>
                <Hero3D />
              </Suspense>
            ) : (
              <HeroFallback />
            )}
          </div>
        </div>
      </section>

      {/* 2. Shop by stage */}
      <section className="section">
        <div className="container">
          <SectionHeader
            title={t('shopByStage')}
            desc={t('shopByStageDesc')}
            linkTo="/shop"
            linkLabel={t('seeAll')}
          />
          <LifeStageTiles />
        </div>
      </section>

      {/* 3. Our difference band */}
      <section className="section section-tinted">
        <div className="container">
          <SectionHeader title={t('ourDifference')} />
          <OurDifference />
        </div>
      </section>

      {/* 4. Best sellers */}
      <section className="section">
        <div className="container">
          <SectionHeader
            title={t('bestSellers')}
            desc={t('bestSellersDesc')}
            linkTo="/shop"
            linkLabel={t('viewAll')}
          />
          <BestSellers limit={8} />
        </div>
      </section>

      {/* 5. Bundles promo */}
      <section className="section section-cream">
        <div className="container">
          <div className="bundles-promo">
            <div className="bundles-promo-copy">
              <div className="bundles-eyebrow">★ {t('famBundles')}</div>
              <h2 className="bundles-title">{t('bundlesTitle')}</h2>
              <p className="bundles-desc">{t('bundlesDesc')}</p>
              <Link to="/shop" className="btn btn-outline">{t('viewAll')} →</Link>
            </div>
            <div className="bundles-promo-art" aria-hidden="true">
              <Gift width={140} height={140} />
            </div>
          </div>
        </div>
      </section>

      {/* 6. Reviews */}
      <section className="section">
        <div className="container">
          <SectionHeader title={t('reviewsTitle')} />
          <Reviews />
        </div>
      </section>

      {/* 7. Blog teaser */}
      <section className="section section-tinted">
        <div className="container">
          <SectionHeader
            title={t('blogTeaserTitle')}
            desc={t('blogTeaserDesc')}
            linkTo="/learn"
            linkLabel={t('viewAll')}
          />
          <BlogTeaser />
        </div>
      </section>
    </div>
  );
}
