import React, { useEffect, useRef } from 'react';
import { m, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { SPRINGS } from './easings.js';
import { useFinePointer } from './media.js';
import './motion.css';

/**
 * Tilts its content toward the cursor (up to `max` degrees) with a soft highlight that follows it.
 * Mouse and trackpad only. Give it the radius of what it wraps; it clips the highlight.
 * `trackRef` lets a larger element drive it, e.g. a whole card whose stretched link covers the image.
 *   <Tilt className="pdp-well"><img … /></Tilt>
 */
export default function Tilt({ max = 6, glare = true, as = 'div', trackRef, className = '', children, ...rest }) {
  const ref = useRef(null);
  const fine = useFinePointer();
  const reduce = useReducedMotion();
  const px = useSpring(0, SPRINGS.snappy); // pointer position, -1 .. 1
  const py = useSpring(0, SPRINGS.snappy);
  const lit = useSpring(0, SPRINGS.soft);
  const rotateY = useTransform(px, (v) => v * max);
  const rotateX = useTransform(py, (v) => -v * max);
  const glareX = useTransform(px, (v) => `${v * 50}%`);
  const glareY = useTransform(py, (v) => `${v * 50}%`);
  const Tag = m[as];
  const on = fine && !reduce;

  useEffect(() => {
    const target = trackRef?.current || ref.current;
    if (!on || !target) return undefined;
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    const onMove = (e) => {
      if (e.pointerType === 'touch') return;
      const r = ref.current.getBoundingClientRect();
      px.set(clamp(((e.clientX - r.left) / r.width) * 2 - 1));
      py.set(clamp(((e.clientY - r.top) / r.height) * 2 - 1));
      lit.set(1);
    };
    const onLeave = () => {
      px.set(0);
      py.set(0);
      lit.set(0);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerleave', onLeave);
    return () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerleave', onLeave);
    };
  }, [on, trackRef, px, py, lit]);

  if (!on) {
    return (
      <Tag className={`fx-tilt ${className}`} {...rest}>
        {children}
      </Tag>
    );
  }

  return (
    <Tag
      ref={ref}
      className={`fx-tilt ${className}`}
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      {...rest}
    >
      {children}
      {glare && <m.span className="fx-tilt-glare" aria-hidden="true" style={{ x: glareX, y: glareY, opacity: lit }} />}
    </Tag>
  );
}
