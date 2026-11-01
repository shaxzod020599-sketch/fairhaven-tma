import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  m,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from 'motion/react';
import { usePageVisible } from './media.js';
import './motion.css';

// Keeps the offset inside one copy's width, so the row loops without a seam.
const wrap = (v, w) => (((v % w) - w) % w);

/**
 * Endless row of `children`, `speed` px per second. Scrolling the page speeds it up and leans it (skew),
 * scaled by `velocity` (0 turns that off). It stops off-screen, in a hidden tab, and while hovered or focused,
 * so links inside stay easy to hit. Reduced motion: one still row that scrolls by hand.
 *   <Marquee speed={60} direction="right">{brands.map(…)}</Marquee>
 */
export default function Marquee({ speed = 48, direction = 'left', velocity = 1, gap, className = '', style, children, ...rest }) {
  const reduce = useReducedMotion();
  const rootRef = useRef(null);
  const copyRef = useRef(null);
  const [size, setSize] = useState({ copy: 0, copies: 2 });
  const [held, setHeld] = useState(false);
  const inView = useInView(rootRef, { margin: '100px' });
  const visible = usePageVisible();

  const x = useMotionValue(0);
  const { scrollY } = useScroll();
  const scrollSpeed = useSpring(useVelocity(scrollY), { stiffness: 400, damping: 50 });
  const skewX = useTransform(scrollSpeed, [-2500, 0, 2500], [-5 * velocity, 0, 5 * velocity], { clamp: true });

  const rootStyle = gap == null ? style : { ...style, '--marquee-gap': typeof gap === 'number' ? `${gap}px` : gap };

  useLayoutEffect(() => {
    if (reduce) return undefined;
    const measure = () => {
      const copy = copyRef.current?.offsetWidth || 0;
      const root = rootRef.current?.offsetWidth || 0;
      setSize({ copy, copies: copy ? Math.max(2, Math.ceil(root / copy) + 1) : 2 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(rootRef.current);
    ro.observe(copyRef.current);
    return () => ro.disconnect();
  }, [reduce]);

  const running = !reduce && inView && visible && !held && size.copy > 0;

  useEffect(() => {
    if (!running) return undefined;
    const sign = direction === 'right' ? 1 : -1;
    let frame;
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(now - last, 64) / 1000; // a long gap (background tab) must not jump the row
      last = now;
      const boost = 1 + Math.min(Math.abs(scrollSpeed.get()) / 600, 4) * velocity;
      x.set(wrap(x.get() + sign * speed * boost * dt, size.copy));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, direction, speed, velocity, size.copy, scrollSpeed, x]);

  if (reduce) {
    return (
      <div className={`fx-marquee fx-marquee--still ${className}`} style={rootStyle} {...rest}>
        <div className="fx-marquee-copy">{children}</div>
      </div>
    );
  }

  const copies = [];
  for (let i = 1; i < size.copies; i += 1) {
    copies.push(
      // Repeats are for the eye only: hidden from screen readers and out of the tab order.
      <div key={i} className="fx-marquee-copy" aria-hidden="true" inert="">
        {children}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`fx-marquee ${className}`}
      style={rootStyle}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setHeld(false);
      }}
      {...rest}
    >
      <m.div className="fx-marquee-track" style={{ x, skewX }}>
        <div ref={copyRef} className="fx-marquee-copy">
          {children}
        </div>
        {copies}
      </m.div>
    </div>
  );
}
