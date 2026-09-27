import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {C, FPS, T} from '../brand';
import {clamp, ease, heartbeat, HEARTBEATS, mix, prog, rand, springAt} from '../lib/anim';
import {Kinetic} from '../lib/Kinetic';
import wordmark from '../wordmark.json';
import {CellWorld} from './CellWorld';
import {shockWaves} from './Opening';

// Wordmark placement (412 x 71 viewBox → 880 px wide; glyphs occupy y 17–57 of the box)
const WM = {x: 100, y: 1000, w: 880};
const S = WM.w / 412;
export const DOT = {x: WM.x + wordmark.dot.cx * S, y: WM.y + wordmark.dot.cy * S, r: wordmark.dot.r * S};

// The pearl is born where the 100% ring collapses (Numbers centre), then arcs into the dot of the "i".
const START = {x: 540, y: 900, r: 70};
const CTRL = {x: 330, y: 760};
const FLY_START = T.dotLand - 44;
const SHRINK_START = T.dotLand - 40;

const bez = (u: number) => ({
  x: (1 - u) * (1 - u) * START.x + 2 * (1 - u) * u * CTRL.x + u * u * DOT.x,
  y: (1 - u) * (1 - u) * START.y + 2 * (1 - u) * u * CTRL.y + u * u * DOT.y,
});
const flyAt = (f: number) => ease.inOutCubic(prog(f, FLY_START, T.dotLand - FLY_START));
const PATH_LEN = 470; // approx. arc length in px — converts the pearl radius to curve parameter

const SPARKS = Array.from({length: 18}, (_, k) => ({
  t0: FLY_START + 6 + k * 2.1,
  vx: (rand(k * 3.1 + 1) - 0.5) * 1.8,
  vy: (rand(k * 7.7 + 2) - 0.5) * 1.8 - 0.35,
  life: 20 + rand(k * 1.3 + 3) * 16,
  r: 1.3 + rand(k * 5.9 + 4) * 2.2,
}));

/** Comet streak behind the flying pearl: layered strokes (short = wide + bright), blurred into a taper. */
const Trail: React.FC<{frame: number; u: number; r: number}> = ({frame, u, r}) => {
  if (frame < FLY_START + 2 || frame > T.dotLand + 30) return null;
  const catchUp = ease.inCubic(prog(frame, T.dotLand - 10, 22));
  const fade = 1 - ease.outCubic(prog(frame, T.dotLand, 26));
  const head = Math.max(0, u - (r * 0.85) / PATH_LEN);
  const path = (len: number) => {
    const u0 = mix(Math.max(0, head - len), head, catchUp);
    let d = '';
    for (let k = 0; k <= 28; k++) {
      const p = bez(mix(u0, head, k / 28));
      d += `${k === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)} `;
    }
    return d;
  };
  const glow = [
    {len: 0.6, w: 4, o: 0.16},
    {len: 0.42, w: 9, o: 0.18},
    {len: 0.26, w: 15, o: 0.2},
    {len: 0.13, w: 22, o: 0.22},
  ];
  const core = [
    {len: 0.5, w: 1.2, o: 0.35},
    {len: 0.3, w: 2.4, o: 0.5},
    {len: 0.14, w: 4, o: 0.7},
  ];
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', inset: 0, mixBlendMode: 'screen', opacity: fade}}>
      <g style={{filter: 'blur(7px)'}}>
        {glow.map((s, i) => (
          <path key={i} d={path(s.len)} fill="none" stroke={C.rose} strokeWidth={s.w} strokeOpacity={s.o} strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </g>
      <g style={{filter: 'blur(0.8px)'}}>
        {core.map((s, i) => (
          <path key={i} d={path(s.len)} fill="none" stroke="#fff6f9" strokeWidth={s.w} strokeOpacity={s.o} strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </g>
      {SPARKS.map((s, k) => {
        const age = frame - s.t0;
        if (age < 0 || age > s.life) return null;
        const o = bez(flyAt(s.t0));
        const drift = (1 - Math.exp(-age / 14)) * 14;
        const a = Math.sin((Math.PI * age) / s.life) * (0.55 + 0.45 * Math.sin(age * 0.9 + k));
        return <circle key={k} cx={o.x + s.vx * drift} cy={o.y + s.vy * drift} r={s.r} fill="#fff1f6" opacity={clamp(a)} style={{filter: 'blur(0.6px)'}} />;
      })}
    </svg>
  );
};

export const Finale: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;

  // pearl grows out of the collapsing ring, beats once, then arcs into the "i"
  const grow = springAt(frame, T.finale - 6, {damping: 14, stiffness: 110});
  const u = flyAt(frame);
  const {x: px, y: py} = bez(u);
  const r = mix(START.r * grow, DOT.r * 1.12, ease.inOutCubic(prog(frame, SHRINK_START, T.dotLand - SHRINK_START)));

  const land = prog(frame, T.dotLand, 40);
  const [wa, wb] = shockWaves(t, [HEARTBEATS[3]]);
  // landing ping travels in ovum units (radius shrinks, so scale the wave radius up)
  const ping = land > 0 && land < 1 ? ([1.1 + 9 * ease.outCubic(land), 0.8 * Math.pow(1 - land, 1.4), 0.25 + 0.6 * land] as [number, number, number]) : wa;

  const worldIn = ease.inOutCubic(prog(frame, T.finale - 8, 30));
  // slow push-in on the end card keeps the last second alive
  const push = 1 + 0.028 * ease.inOutCubic(prog(frame, FLY_START, 900 - FLY_START));

  const shine = mix(-0.3, 1.1, prog(frame, T.dotLand + 8, 44));
  const rule = ease.swift(prog(frame, T.dotLand + 4, 30));

  return (
    <AbsoluteFill style={{transform: `scale(${push})`, transformOrigin: '540px 960px'}}>
      <AbsoluteFill style={{opacity: worldIn}}>
        <CellWorld
          params={{
            time: t,
            center: [px, py],
            radius: Math.max(0.5, r),
            pulse: heartbeat(t) + (land > 0 ? Math.exp(-land * 5) * 1.2 : 0),
            glow: mix(1.15, 1.9, u),
            waveA: ping,
            waveB: wb,
            warm: 0,
          }}
        />
      </AbsoluteFill>

      <Trail frame={frame} u={u} r={r} />

      <Kinetic segs={[{t: 'Orzuga', italic: true, color: C.rose}, {t: ' bir qadam'}]} start={T.finale + 14} y={560} size={96} color={C.cream} stagger={1.6} dur={36} />
      <Kinetic segs={[{t: 'yaqinroq.'}]} start={T.finale + 26} y={673} size={96} color={C.cream} stagger={1.8} dur={36} />

      <svg width={WM.w} height={71 * S} viewBox="0 0 412 71" style={{position: 'absolute', left: WM.x, top: WM.y, overflow: 'visible'}}>
        <defs>
          <clipPath id="wmClip">
            <rect x={-10} y={-20} width={440} height={77} />
          </clipPath>
          <linearGradient id="shine" x1="0" y1="0" x2="1" y2="0.35">
            <stop offset={clamp(shine - 0.12)} stopColor="#fff" stopOpacity={0} />
            <stop offset={clamp(shine)} stopColor="#fff" stopOpacity={0.9} />
            <stop offset={clamp(shine + 0.12)} stopColor="#fff" stopOpacity={0} />
          </linearGradient>
          <radialGradient id="dotFill" cx="0.38" cy="0.34" r="0.75">
            <stop offset="0" stopColor="#fff4f8" />
            <stop offset="0.45" stopColor="#f59ab9" />
            <stop offset="1" stopColor="#c8406f" />
          </radialGradient>
        </defs>
        <g clipPath="url(#wmClip)">
          {wordmark.glyphs.map((g, i) => {
            // letters rise left→right; the i-stem waits so the pearl lands on a freshly risen stem
            const st = i === 2 ? T.dotLand - 18 : T.dotLand - 32 + i * 2;
            const p = ease.swift(prog(frame, st, 30));
            return (
              <g key={g.id} transform={`translate(0 ${(1 - p) * 62})`} opacity={clamp(p * 1.6)}>
                <path d={g.d} fill={C.cream} />
                <path d={g.d} fill="url(#shine)" />
              </g>
            );
          })}
        </g>
        <circle cx={wordmark.dot.cx} cy={wordmark.dot.cy} r={wordmark.dot.r} fill="url(#dotFill)" opacity={ease.outCubic(prog(frame, T.dotLand - 3, 8))} />
      </svg>

      {/* rule + url */}
      <div
        style={{
          position: 'absolute',
          top: 1192,
          left: 540 - 70 * rule,
          width: 140 * rule,
          height: 1.5,
          background: 'rgba(244,169,194,0.6)',
        }}
      />
      <Kinetic segs={[{t: 'fairhaven.uz'}]} font="sans" weight={500} size={46} tracking={0.08} color={C.cream} start={T.dotLand + 6} y={1218} stagger={1} dur={30} />
      <Kinetic
        segs={[{t: 'Rasmiy distribyutor · O‘zbekiston'}]}
        font="sans"
        weight={400}
        size={27}
        tracking={0.08}
        color={C.rose}
        start={T.dotLand + 14}
        y={1288}
        stagger={0.45}
        dur={28}
      />
    </AbsoluteFill>
  );
};
