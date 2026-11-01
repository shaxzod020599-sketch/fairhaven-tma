/** Motion constants, mirrored in tokens.css (--ease-*, --d-*). Seconds, as motion/react expects. */

export const EASE_OUT = [0.22, 1, 0.36, 1];
export const EASE_IN_OUT = [0.65, 0, 0.35, 1];

export const DURATION = { hover: 0.16, ui: 0.28, reveal: 0.52, hero: 0.9 };

/** Spring settings for useSpring(); SPRING holds the same as transitions. */
export const SPRINGS = {
  snappy: { stiffness: 420, damping: 34 },
  soft: { stiffness: 170, damping: 24 },
  pop: { stiffness: 600, damping: 18 }, // badges only
};

export const SPRING = {
  snappy: { type: 'spring', ...SPRINGS.snappy },
  soft: { type: 'spring', ...SPRINGS.soft },
  pop: { type: 'spring', ...SPRINGS.pop },
};

/**
 * Scroll reveal: rise 24 px over 520 ms, 60 ms between siblings (a long list compresses to 360 ms in total).
 * It starts once any part is 10% above the bottom edge. A fixed share of the element (amount .2) would never
 * be reached by a block more than five screens tall, and its content would stay hidden.
 */
export const REVEAL = { y: 24, margin: '0px 0px -10% 0px', stagger: 0.06, maxStagger: 0.36 };

/** Eased tween transition. */
export const tween = (duration = DURATION.ui, ease = EASE_OUT) => ({ duration, ease });
