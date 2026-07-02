import React, {
  Suspense,
  lazy,
  useState,
  useEffect,
  useRef,
} from 'react';
import { Link } from 'react-router-dom';
import { m } from 'motion/react';
import { useI18n } from '../i18n/index.jsx';
import TestimonialCascade from '../components/home/TestimonialCascade.jsx';
import { scrollBus, resetScrollBus } from '../components/home/scrollBus.js';

// The Three.js scene is split out of the main chunk; only capable desktops load it.
const Scene3D = lazy(() => import('../components/home/Scene3D.jsx'));

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/* Hero entrance — one orchestrated stagger (35ms/child, spring rise). */
const heroStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.08 } },
};
const heroRise = {
  hidden: { opacity: 0, y: 26 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 190, damping: 26, mass: 0.9 },
  },
};

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

/**
 * Continuous eased journey driver (full mode only). The bus carries a
 * glide-smoothed 0→1 progress; the 3D camera adds its own damping on top,
 * so even harsh wheel jumps travel as one fluid descent.
 */
function useJourneyDriver(rootRef, enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    const root = rootRef.current;
    if (!root) return undefined;

    let raf = 0;
    let running = true;
    let last = performance.now();
    let journey = 0;
    let hero = 0;

    const frame = (now) => {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const k = 1 - Math.exp(-dt * 6);

      const rect = root.getBoundingClientRect();
      const vh = window.innerHeight;
      const total = rect.height - vh;
      const journeyTarget = total > 0 ? clamp01(-rect.top / total) : 0;
      const heroTarget = clamp01(-rect.top / vh);

      journey += (journeyTarget - journey) * k;
      hero += (heroTarget - hero) * k;

      scrollBus.journey = journey;
      scrollBus.hero = hero;
      root.style.setProperty('--journey', journey.toFixed(4));
      root.style.setProperty('--hero-p', hero.toFixed(4));
    };

    raf = requestAnimationFrame(frame);
    const onVisibility = () => { last = performance.now(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
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

      {/* ── Act I · Hero — original fairhavenhealth.com composition ────── */}
      <section className="hero-section journey-hero" aria-labelledby="home-hero-title">
        <div className="container hero-inner">
          <m.div
            className="hero-copy"
            variants={heroStagger}
            initial="hidden"
            animate="show"
          >
            <m.div className="hero-eyebrow" variants={heroRise}>{t('heroEyebrow')}</m.div>
            <m.h1 className="hero-title" id="home-hero-title" variants={heroRise}>
              {t('heroTitlePre')} <em>{t('heroTitleEm')}</em> {t('heroTitlePost')}
            </m.h1>
            <m.p className="hero-desc" variants={heroRise}>{t('heroDesc')}</m.p>
            <m.div className="hero-cta-row" variants={heroRise}>
              <Link to="/shop" className="btn btn-primary btn-lg">
                {t('heroCta')} <span aria-hidden="true">→</span>
              </Link>
            </m.div>
            <m.div className="hero-stats" variants={heroRise}>
              <div className="hero-stat">
                <strong>{t('heroStat1')}</strong>
                <span>{t('heroStat1Label')}</span>
              </div>
              <div className="hero-stat">
                <strong>{t('heroStat2')}</strong>
                <span>{t('heroStat2Label')}</span>
              </div>
            </m.div>
          </m.div>
          <div className="hero-visual" aria-hidden="true">
            <div className="hero-glow" />
            {simple && (
              <div className="hero-product-static">
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
