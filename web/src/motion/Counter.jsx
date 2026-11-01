import React, { useEffect, useRef } from 'react';
import { animate, useInView, useReducedMotion } from 'motion/react';
import { DURATION, EASE_OUT } from './easings.js';
import './motion.css';

const whole = (n) => String(Math.round(n));

/**
 * A real number that rolls to its new value: from `from` the first time it scrolls into view (count-up),
 * then from the old value whenever `value` changes. Screen readers get only the final value.
 *   <Counter value={total} format={(n) => formatSum(n, lang)} />
 */
export default function Counter({ value, from, format = whole, duration = DURATION.hero, className = '', ...rest }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });
  const shown = useRef(from ?? value);
  // Rendered once; afterwards the effect writes the text, so React never overwrites a frame mid-roll.
  const initialText = useRef(format(from ?? value)).current;

  useEffect(() => {
    const node = ref.current;
    if (!node || !inView) return undefined;
    if (reduce || shown.current === value) {
      shown.current = value;
      node.textContent = format(value);
      return undefined;
    }
    const controls = animate(shown.current, value, {
      duration,
      ease: EASE_OUT,
      onUpdate: (v) => {
        shown.current = v;
        node.textContent = format(v);
      },
    });
    return () => controls.stop();
  });

  return (
    <span className={`fx-counter ${className}`} {...rest}>
      <span ref={ref} aria-hidden="true">{initialText}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
