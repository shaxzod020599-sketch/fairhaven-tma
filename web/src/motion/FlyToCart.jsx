import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { m, useReducedMotion } from 'motion/react';
import { EASE_OUT } from './easings.js';
import './motion.css';

const FLIGHT = 0.65; // seconds
const TILE = 120; // px, the flying copy never starts larger than this
// x eases in while y eases out: the copy lifts first, then swings across, which draws the arc.
const EASE_IN = [0.55, 0, 0.9, 0.45];

const FlyContext = createContext(null);
const noFly = () => Promise.resolve(false);

const imageOf = (el) => (el?.tagName === 'IMG' ? el : el?.querySelector?.('img'));

const onScreen = (r) => r.width > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;

// The header marks its cart button with data-cart-target and the count with data-cart-badge.
function popBadge(target) {
  const badge = target.querySelector('[data-cart-badge]') || target;
  badge.animate?.(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }],
    { duration: 420, easing: 'cubic-bezier(.34, 1.56, .64, 1)' }
  );
}

function Flight({ flight, onDone }) {
  const { from, to, src, size } = flight;
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const end = Math.max(0.12, (Math.min(to.width, to.height) * 0.9) / size);
  return (
    <m.div
      className="fx-fly"
      style={{
        left: from.left + from.width / 2 - size / 2,
        top: from.top + from.height / 2 - size / 2,
        width: size,
        height: size,
      }}
      initial={{ x: 0, y: 0, scale: Math.min(1, from.width / size), opacity: 1 }}
      animate={{ x: dx, y: dy, scale: end, opacity: [1, 1, 0.6] }}
      transition={{
        x: { duration: FLIGHT, ease: EASE_IN },
        y: { duration: FLIGHT, ease: EASE_OUT },
        scale: { duration: FLIGHT, ease: EASE_OUT },
        opacity: { duration: FLIGHT, times: [0, 0.75, 1] },
      }}
      onAnimationComplete={onDone}
    >
      {src && <img src={src} alt="" />}
    </m.div>
  );
}

/**
 * Hosts the flying copies above the page. Put it once near the root, inside MotionProvider.
 * useFlyToCart()(sourceEl) flies a copy of the image in `sourceEl` to the header cart and pops its badge.
 */
export function FlyToCartProvider({ children }) {
  const reduce = useReducedMotion();
  const [flights, setFlights] = useState([]);
  const seq = useRef(0);

  const fly = useCallback(
    (sourceEl, src) => {
      const target = typeof document !== 'undefined' ? document.querySelector('[data-cart-target]') : null;
      if (!target) return Promise.resolve(false);
      const to = target.getBoundingClientRect();
      const img = imageOf(sourceEl);
      const from = (img || sourceEl)?.getBoundingClientRect();
      if (reduce || !from || !onScreen(from) || !onScreen(to)) {
        if (!reduce) popBadge(target);
        return Promise.resolve(false);
      }
      seq.current += 1;
      const id = seq.current;
      return new Promise((resolve) => {
        const flight = {
          id,
          from,
          to,
          src: src || img?.currentSrc || img?.src || '',
          size: Math.min(TILE, Math.max(from.width, from.height)),
          done: () => {
            setFlights((list) => list.filter((f) => f.id !== id));
            popBadge(target);
            resolve(true);
          },
        };
        setFlights((list) => [...list, flight]);
      });
    },
    [reduce]
  );

  const layer =
    flights.length > 0 && typeof document !== 'undefined'
      ? createPortal(
          <div className="fx-fly-layer" aria-hidden="true">
            {flights.map((f) => (
              <Flight key={f.id} flight={f} onDone={f.done} />
            ))}
          </div>,
          document.body
        )
      : null;

  return (
    <FlyContext.Provider value={fly}>
      {children}
      {layer}
    </FlyContext.Provider>
  );
}

/**
 * fly(sourceEl, src?) -> Promise<boolean>: true once the copy has landed, false when nothing flew
 * (no cart button on screen, element off-screen, reduced motion). Outside the provider it does nothing.
 */
export function useFlyToCart() {
  return useContext(FlyContext) || noFly;
}
