import React, { useRef } from 'react';
import { m, useReducedMotion, useSpring } from 'motion/react';
import { SPRINGS } from './easings.js';
import { useFinePointer } from './media.js';
import './motion.css';

const clamp = (v) => Math.max(-1, Math.min(1, v));

/**
 * Lets its child lean toward the cursor (up to `strength` px) and spring back on leave.
 * Mouse and trackpad only; touch and reduced motion get the child as is.
 *   <Magnetic><Button>…</Button></Magnetic>
 */
export default function Magnetic({ strength = 6, children, className = '', ...rest }) {
  const ref = useRef(null);
  const fine = useFinePointer();
  const reduce = useReducedMotion();
  const x = useSpring(0, SPRINGS.soft);
  const y = useSpring(0, SPRINGS.soft);

  if (!fine || reduce) {
    return (
      <span className={`fx-magnetic ${className}`} {...rest}>
        {children}
      </span>
    );
  }

  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    x.set(clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2)) * strength);
    y.set(clamp((e.clientY - (r.top + r.height / 2)) / (r.height / 2)) * strength);
  };
  const onLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <m.span
      ref={ref}
      className={`fx-magnetic ${className}`}
      style={{ x, y }}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      {...rest}
    >
      {children}
    </m.span>
  );
}
