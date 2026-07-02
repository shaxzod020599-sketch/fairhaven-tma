import React, {
  Suspense,
  lazy,
  useState,
  useEffect,
  useRef,
} from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import TestimonialCascade from '../components/home/TestimonialCascade.jsx';
import { scrollBus, resetScrollBus } from '../components/home/scrollBus.js';

// The Three.js scene is split out of the main chunk; only capable desktops load it.
const Scene3D = lazy(() => import('../components/home/Scene3D.jsx'));

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Desktop + fine pointer + WebGL + motion allowed → full 3D journey. */
function useFullExperience() {
  const [mode, setMode] = useState(null); // null = deciding (SSR-safe default)
  useEffect(() => {
    const decide = () => {
      const wide = window.matchMedia('(min-width: 1024px) and (pointer: fine)').matches;
      const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      let webgl = false;
      try {
        const c = document.createElement('canvas');
        webgl = Boolean(window.WebGLRenderingContext &&
          (c.getContext('webgl') || c.getContext('experimental-webgl')));
      } catch { webgl = false; }
      setMode(wide && webgl && !calm ? 'full' : 'simple');
    };
    decide();
    const mq = window.matchMedia('(min-width: 1024px)');
    mq.addEventListener?.('change', decide);
    return () => mq.removeEventListener?.('change', decide);
  }, []);
  return mode;
}

/** Writes journey/hero progress into the scroll bus (full mode only). */
function useJourneyDriver(rootRef, enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    const root = rootRef.current;
    if (!root) return undefined;

    let raf = 0;
    let scheduled = false;

    const update = () => {
      scheduled = false;
      const rect = root.getBoundingClientRect();
      const vh = window.innerHeight;
      const total = rect.height - vh;
      scrollBus.journey = total > 0 ? clamp01(-rect.top / total) : 0;
      scrollBus.hero = clamp01(-rect.top / vh);
      root.style.setProperty('--journey', scrollBus.journey.toFixed(4));
      root.style.setProperty('--hero-p', scrollBus.hero.toFixed(4));
    };

    const onScroll = () => {
      if (!scheduled) {
        scheduled = true;
        raf = requestAnimationFrame(update);
      }
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      resetScrollBus();
    };
  }, [rootRef, enabled]);
}

/**
 * Homepage — «Голоса доверия»: an editorial 3D descent.
 * Act I  hero statement · Act II  testimonial cascade · Act III  finale CTA.
 * No catalogue sections here by design — every service lives in the header.
 */
export default function Home() {
  const { t } = useI18n();
  const mode = useFullExperience();
  const rootRef = useRef(null);
  const [canvasActive, setCanvasActive] = useState(true);

  useJourneyDriver(rootRef, mode === 'full');

  // Pause the fixed canvas when the journey is out of view (footer etc.).
  useEffect(() => {
    if (mode !== 'full') return undefined;
    const root = rootRef.current;
    if (!root) return undefined;
    const io = new IntersectionObserver(
      ([entry]) => setCanvasActive(entry.isIntersecting),
      { threshold: 0 }
    );
    io.observe(root);
    return () => io.disconnect();
  }, [mode]);

  const simple = mode !== 'full';

  return (
    <div className={`scrolly-root ${simple ? 'scrolly-simple' : 'scrolly-full'}`} ref={rootRef}>
      {mode === 'full' && (
        <Suspense fallback={null}>
          <Scene3D active={canvasActive} />
        </Suspense>
      )}

      {/* Atmosphere wash behind everything (CSS-only, both modes) */}
      <div className="scrolly-atmosphere" aria-hidden="true" />

      {/* ── Act I · Hero statement ────────────────────────────────────── */}
      <section className="journey-hero" aria-labelledby="home-hero-title">
        <div className="container journey-hero-inner">
          <p className="journey-eyebrow">
            <span className="journey-eyebrow-rule" aria-hidden="true" />
            {t('heroEyebrow')}
          </p>
          <h1 className="journey-title" id="home-hero-title">
            <span className="journey-title-line">{t('journeyTitle1')}</span>
            <span className="journey-title-line journey-title-em">{t('journeyTitle2')}</span>
          </h1>
          <p className="journey-sub">{t('journeySub')}</p>
          <div className="journey-cta-row">
            <Link to="/shop" className="btn btn-primary btn-lg">
              {t('heroCta')} <span aria-hidden="true">→</span>
            </Link>
          </div>
          {simple && (
            <div className="journey-hero-visual" aria-hidden="true">
              <img
                src="/assets/fh-pro-women.avif"
                alt=""
                width="1600"
                height="1600"
                loading="eager"
                fetchpriority="high"
                decoding="async"
              />
            </div>
          )}
        </div>
        <div className="journey-scroll-hint" aria-hidden="true">
          <span className="journey-scroll-hint-label">{t('journeyScrollHint')}</span>
          <span className="journey-scroll-hint-line" />
        </div>
      </section>

      {/* ── Act II · Voices of trust ──────────────────────────────────── */}
      <div className="journey-cascade-head">
        <div className="container">
          <h2 className="journey-cascade-title">{t('journeyVoicesTitle')}</h2>
          <p className="journey-cascade-sub">{t('journeyVoicesSub')}</p>
        </div>
      </div>
      <TestimonialCascade simple={simple} />

      {/* ── Act III · Finale ──────────────────────────────────────────── */}
      <section className="journey-finale">
        <div className="container journey-finale-inner">
          <div className="journey-stats" role="list">
            <div className="journey-stat" role="listitem">
              <strong>2003</strong>
              <span>{t('journeyStatFounded')}</span>
            </div>
            <div className="journey-stat" role="listitem">
              <strong>22+</strong>
              <span>{t('heroStat1Label')}</span>
            </div>
            <div className="journey-stat" role="listitem">
              <strong>100%</strong>
              <span>{t('heroStat2Label')}</span>
            </div>
          </div>
          <h2 className="journey-finale-title">{t('journeyFinaleTitle')}</h2>
          <p className="journey-finale-sub">{t('journeyFinaleSub')}</p>
          <div className="journey-cta-row">
            <Link to="/shop" className="btn btn-primary btn-lg">
              {t('heroCta')} <span aria-hidden="true">→</span>
            </Link>
            <Link to="/about" className="btn btn-outline btn-lg">
              {t('navDifference')}
            </Link>
          </div>
          <p className="journey-press" aria-label={t('trustTitle')}>
            <span>cGMP</span>
            <span aria-hidden="true">·</span>
            <span>Made in USA</span>
            <span aria-hidden="true">·</span>
            <span>Non-GMO</span>
            <span aria-hidden="true">·</span>
            <span>Mom’s Choice Awards®</span>
          </p>
        </div>
      </section>
    </div>
  );
}
