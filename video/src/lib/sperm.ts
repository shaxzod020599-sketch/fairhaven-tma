import {TAIL_N} from '../gl/ovum';

export type V2 = [number, number];

// Swim path in ovum units (ovum radius = 1, y up). Ends on the rim at ~1:30 o'clock,
// the exact pose of the sperm in the FH PRO label icon.
const P0: V2 = [2.7, 4.6];
const P1: V2 = [0.1, 3.2];
const P2: V2 = [1.7, 1.55];
const P3: V2 = [0.68, 0.66];

const bez = (u: number): V2 => {
  const a = 1 - u;
  return [
    a * a * a * P0[0] + 3 * a * a * u * P1[0] + 3 * a * u * u * P2[0] + u * u * u * P3[0],
    a * a * a * P0[1] + 3 * a * a * u * P1[1] + 3 * a * u * u * P2[1] + u * u * u * P3[1],
  ];
};

const SAMPLES = 800;
const table: {p: V2; s: number}[] = [];
{
  let s = 0;
  let prev = bez(0);
  for (let i = 0; i <= SAMPLES; i++) {
    const p = bez(i / SAMPLES);
    s += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    table.push({p, s});
    prev = p;
  }
}
const TOTAL = table[table.length - 1].s;
const startDir: V2 = (() => {
  const a = table[0].p;
  const b = table[4].p;
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
})();

const pointAtArc = (s: number): {p: V2; d: V2} => {
  if (s <= 0) {
    return {p: [table[0].p[0] + startDir[0] * s, table[0].p[1] + startDir[1] * s], d: startDir};
  }
  if (s >= TOTAL) {
    const a = table[SAMPLES - 2].p;
    const b = table[SAMPLES].p;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return {p: table[SAMPLES].p, d: [(b[0] - a[0]) / l, (b[1] - a[1]) / l]};
  }
  let lo = 0;
  let hi = SAMPLES;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid].s < s) lo = mid;
    else hi = mid;
  }
  const A = table[lo];
  const B = table[hi];
  const f = (s - A.s) / Math.max(B.s - A.s, 1e-9);
  const dx = B.p[0] - A.p[0];
  const dy = B.p[1] - A.p[1];
  const l = Math.hypot(dx, dy) || 1;
  return {p: [A.p[0] + dx * f, A.p[1] + dy * f], d: [dx / l, dy / l]};
};

/**
 * Head + tail of the swimmer. `u` is progress along the path (0..1), `t` seconds
 * drives the travelling tail wave, `amp` scales undulation.
 */
export const spermPose = (u: number, t: number, amp = 1) => {
  const s0 = u * TOTAL;
  const head = pointAtArc(s0);
  const L = 2.1;
  const tail: V2[] = [];
  for (let k = 0; k < TAIL_N; k++) {
    const f = k / (TAIL_N - 1);
    const s = 0.1 + f * L;
    const {p, d} = pointAtArc(s0 - s);
    const nx = -d[1];
    const ny = d[0];
    const a = (0.006 + 0.055 * Math.pow(f, 1.5)) * amp;
    const w = a * Math.sin((s / 1.05) * Math.PI * 2 - t * Math.PI * 2 * 1.7);
    tail.push([p[0] + nx * w, p[1] + ny * w]);
  }
  return {head: head.p, dir: head.d, tail};
};
