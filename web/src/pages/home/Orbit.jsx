import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { m, useInView, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { productTitle, formatSum } from '../../catalog/index.js';
import { useFinePointer, usePageVisible, useVTNavigate, SPRINGS, DURATION, EASE_OUT } from '../../motion/index.js';
import { Play } from '../../components/Icons.jsx';
import './Orbit.css';

const TURN = 40; // seconds per full turn
const TILT = 0.3; // radians the orbit plane leans towards the viewer (about 17 deg)
const MAX_POINTER = 8; // degrees
const TAU = Math.PI * 2;

const plainClick = (e) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

function PauseIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M9 5v14" />
      <path d="M15 5v14" />
    </svg>
  );
}

/**
 * The hero vitrine: white plinth cards with real packshots circling a rising sun (DESIGN.md 5.1).
 * Plain CSS 3D: the cards sit in a preserve-3d scene, one rAF loop moves them round an ellipse and sets depth
 * shading, the browser sorts them in front of or behind the sun. The loop stops off-screen, in a hidden tab,
 * on hover or focus and on the pause button. Scrolling past the hero sets the sun and flattens the orbit;
 * a mouse leans the whole plane (max 8 deg). Reduced motion: a still orbit, the sun already up.
 * Every card is a product link in DOM order; focusing one turns it to the front.
 */
export default function Orbit({ items, trackRef, compact = false }) {
  const { t, lang } = useI18n();
  const reduce = useReducedMotion();
  const fine = useFinePointer();
  const visible = usePageVisible();
  const go = useVTNavigate();

  const rootRef = useRef(null);
  const cardRefs = useRef([]);
  const imgRefs = useRef([]);
  const spin = useRef(0);
  const target = useRef(null);
  const size = useRef({ r: 0 });
  const [held, setHeld] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [seeking, setSeeking] = useState(false); // turning a focused card to the front
  const inView = useInView(rootRef, { margin: '80px' });

  const { scrollYProgress } = useScroll({ target: trackRef, offset: ['start start', 'end start'] });
  const flatten = useTransform(scrollYProgress, [0, 1], [TILT, TILT * 0.2]);
  const sunSet = useTransform(scrollYProgress, [0, 1], ['0%', '58%']);
  const leanX = useSpring(0, SPRINGS.soft);
  const leanY = useSpring(0, SPRINGS.soft);
  const tiltOn = fine && !compact && !reduce;
  const blurOn = fine && !compact;

  const place = useCallback(() => {
    const n = cardRefs.current.length;
    const { r } = size.current;
    if (!n || !r) return;
    const lean = reduce ? TILT : flatten.get();
    const sin = Math.sin(lean);
    const cos = Math.cos(lean);
    for (let i = 0; i < n; i += 1) {
      const el = cardRefs.current[i];
      if (!el) continue;
      const a = spin.current + (i * TAU) / n;
      const toViewer = Math.cos(a);
      const depth = (toViewer + 1) / 2; // 0 at the back, 1 at the front
      el.style.transform = `translate3d(${(r * Math.sin(a)).toFixed(1)}px, ${(r * toViewer * sin).toFixed(1)}px, ${(r * toViewer * cos).toFixed(1)}px)`;
      el.style.setProperty('--shade', ((1 - depth) * 0.62).toFixed(3));
      if (blurOn) el.style.filter = depth < 0.4 ? `blur(${((0.4 - depth) * 4).toFixed(2)}px)` : '';
    }
  }, [flatten, reduce, blurOn]);

  // Radius follows the box: measured before paint so the cards never show stacked in the middle.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const measure = () => {
      const card = parseFloat(getComputedStyle(root).getPropertyValue('--orbit-card')) || 120;
      size.current = { r: Math.max(0, (root.clientWidth - card) / 2) * 0.94 };
      place();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [place, items.length]);

  const autoTurn = !reduce && !held && !stopped;
  const live = !reduce && inView && visible && (autoTurn || seeking);

  useEffect(() => {
    if (!live) return undefined;
    let frame;
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(now - last, 64) / 1000; // a long gap (background tab) must not jump the orbit
      last = now;
      if (target.current != null) {
        const gap = target.current - spin.current;
        spin.current += gap * Math.min(1, dt * 7);
        if (Math.abs(gap) < 0.002) {
          spin.current = target.current;
          target.current = null;
          setSeeking(false);
        }
      } else if (autoTurn) {
        spin.current = (spin.current - (TAU / TURN) * dt) % TAU;
      }
      place();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [live, autoTurn, place]);

  // The scroll-driven flattening must also show while the orbit is held still.
  useMotionValueEvent(flatten, 'change', () => {
    if (!live) place();
  });

  useEffect(() => {
    const zone = trackRef?.current;
    if (!tiltOn || !zone) return undefined;
    const onMove = (e) => {
      const box = zone.getBoundingClientRect();
      leanY.set(((e.clientX - box.left) / box.width - 0.5) * 2 * MAX_POINTER);
      leanX.set(-((e.clientY - box.top) / box.height - 0.5) * 2 * MAX_POINTER * 0.6);
    };
    const onLeave = () => {
      leanX.set(0);
      leanY.set(0);
    };
    zone.addEventListener('pointermove', onMove);
    zone.addEventListener('pointerleave', onLeave);
    return () => {
      zone.removeEventListener('pointermove', onMove);
      zone.removeEventListener('pointerleave', onLeave);
      onLeave();
    };
  }, [tiltOn, trackRef, leanX, leanY]);

  const bringToFront = (i) => {
    const step = TAU / items.length;
    const turns = Math.round((spin.current + i * step) / TAU);
    target.current = turns * TAU - i * step;
    if (reduce) {
      spin.current = target.current;
      target.current = null;
      place();
    } else {
      setSeeking(true);
    }
  };

  const open = (e, product, i) => {
    if (!plainClick(e)) return;
    e.preventDefault();
    go(`/product/${product._id}`, { sharedEl: imgRefs.current[i] });
  };

  cardRefs.current.length = items.length;
  imgRefs.current.length = items.length;

  return (
    <div
      ref={rootRef}
      className={`hm-orbit${compact ? ' hm-orbit--compact' : ''}${live ? '' : ' is-still'}`}
    >
      <m.div className="hm-orbit-scene" style={tiltOn ? { rotateX: leanX, rotateY: leanY } : undefined}>
        <div className="hm-orbit-glow" aria-hidden="true" />
        <div className="hm-orbit-sky" aria-hidden="true">
          <m.div className="hm-orbit-set" style={reduce ? undefined : { y: sunSet }}>
            <m.div
              className="hm-orbit-sun"
              initial={{ y: '70%' }}
              animate={{ y: '0%' }}
              transition={{ duration: DURATION.hero, ease: EASE_OUT }}
            />
          </m.div>
        </div>
        <div className="hm-orbit-horizon" aria-hidden="true" />
        <ul
          className="hm-orbit-ring"
          aria-label={t('home.orbit.label')}
          onPointerEnter={() => setHeld(true)}
          onPointerLeave={() => setHeld(false)}
          onFocus={() => setHeld(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setHeld(false);
          }}
        >
          {items.map((p, i) => (
            <li
              key={p._id}
              className="hm-orbit-item"
              style={{ '--i': i }}
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
            >
              <Link
                to={`/product/${p._id}`}
                className="hm-orbit-card"
                onClick={(e) => open(e, p, i)}
                onFocus={() => bringToFront(i)}
              >
                <span className="hm-orbit-plinth">
                  <img
                    ref={(el) => {
                      imgRefs.current[i] = el;
                    }}
                    src={p.image}
                    alt=""
                    width="240"
                    height="240"
                    loading={i < 6 ? 'eager' : 'lazy'}
                    fetchpriority={i < 3 ? 'high' : undefined}
                    decoding="async"
                    draggable="false"
                  />
                </span>
                <span className="hm-orbit-meta">
                  <span className="sr-only">{productTitle(p, lang)}, </span>
                  <span className="hm-orbit-brand t-mono">{p.brandName}</span>
                  <span className="hm-orbit-price t-price">{formatSum(p.price, lang)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </m.div>
      {!reduce && (
        <button
          type="button"
          className="hm-orbit-toggle"
          aria-pressed={stopped}
          aria-label={stopped ? t('home.orbit.play') : t('home.orbit.pause')}
          title={stopped ? t('home.orbit.play') : t('home.orbit.pause')}
          onClick={() => setStopped((s) => !s)}
        >
          {stopped ? <Play size={18} /> : <PauseIcon size={18} />}
        </button>
      )}
    </div>
  );
}

/**
 * Orbit cards: the admin's showcase when set (up to `max`), else up to `n` products with a photo, one per brand with the
 * biggest brands first, then a second round, so the vitrine shows the range of the catalogue.
 */
export function pickOrbit(products, ids, n, max = n) {
  const usable = (p) => p && p.image && p.isAvailable !== false;
  if (ids?.length) {
    const byId = new Map(products.map((p) => [String(p._id), p]));
    const chosen = ids.map((id) => byId.get(String(id))).filter(usable);
    if (chosen.length >= 3) return chosen.slice(0, max);
  }
  const groups = new Map();
  for (const p of products) {
    if (!usable(p)) continue;
    if (!groups.has(p.brandSlug)) groups.set(p.brandSlug, []);
    groups.get(p.brandSlug).push(p);
  }
  const queues = [...groups.values()].sort((a, b) => b.length - a.length);
  const out = [];
  for (let round = 0; out.length < n; round += 1) {
    let added = false;
    for (const q of queues) {
      if (out.length >= n) break;
      if (q[round]) {
        out.push(q[round]);
        added = true;
      }
    }
    if (!added) break;
  }
  return out;
}
