import React, { useEffect, useState } from 'react';
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import { DURATION, EASE_OUT } from './easings.js';

const whenIdle = (fn) =>
  typeof window.requestIdleCallback === 'function'
    ? window.requestIdleCallback(fn, { timeout: 1500 })
    : window.setTimeout(fn, 200);

/**
 * Motion for the whole app. Animations (domAnimation) are in the main bundle so the first screen animates at
 * once; layout animations and drag (domMax) arrive after first paint. Swapping the bundle re-renders every m.*
 * element once, so `layout` and `drag` props start working without the components knowing.
 * Use m.* (not motion.*) everywhere: strict mode warns in development when motion.* sneaks in.
 */
export default function MotionProvider({ children }) {
  const [features, setFeatures] = useState(() => domAnimation);

  useEffect(() => {
    let alive = true;
    whenIdle(() => {
      import('./features.js').then((mod) => {
        if (alive) setFeatures(mod.default);
      });
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <MotionConfig reducedMotion="user" transition={{ duration: DURATION.ui, ease: EASE_OUT }}>
      <LazyMotion features={features} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}
