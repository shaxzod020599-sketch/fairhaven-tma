import {spring} from 'remotion';
import {FPS} from '../brand';

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** 0→1 progress of `frame` through [start, start + dur]. */
export const prog = (frame: number, start: number, dur: number) => clamp((frame - start) / dur);

// Easing curves (no linear motion anywhere).
export const ease = {
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inCubic: (t: number) => t * t * t,
  inExpo: (t: number) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutQuint: (t: number) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
  inOutExpo: (t: number) =>
    t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  // Snappy "motion-design" curve: fast departure, long silky settle.
  swift: (t: number) => SWIFT(t),
  glide: (t: number) => GLIDE(t),
  push: (t: number) => PUSH(t),
};

export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // x(t) is monotonic for 0<=x1,x2<=1 — bisection is exact enough and never diverges.
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (sx(mid) < x) lo = mid;
      else hi = mid;
    }
    return sy((lo + hi) / 2);
  };
}

const SWIFT = cubicBezier(0.16, 1, 0.3, 1);
const GLIDE = cubicBezier(0.65, 0, 0.35, 1);
const PUSH = cubicBezier(0.5, 0, 0.1, 1);

export const springAt = (frame: number, start: number, cfg: {damping?: number; stiffness?: number; mass?: number} = {}) =>
  spring({frame: frame - start, fps: FPS, config: {damping: 16, stiffness: 140, mass: 0.9, ...cfg}});

// Heartbeat: "lub" + softer "dub" 0.267 s later. Shared timing with scripts/soundtrack.py.
export const HEARTBEATS = [-0.02, 1.0, 2.0, 12.25];
const env = (x: number, decay: number) => (x < 0 ? 0 : (1 - Math.exp(-x / 0.012)) * Math.exp(-x / decay));
export const heartbeat = (tSec: number) => {
  let v = 0;
  for (const b of HEARTBEATS) {
    v += env(tSec - b, 0.16) * 1.0 + env(tSec - b - 0.267, 0.14) * 0.62;
  }
  return v;
};

/** deterministic pseudo random in [0,1) */
export const rand = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
