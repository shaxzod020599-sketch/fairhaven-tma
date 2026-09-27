import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {C, F, FPS, T} from '../brand';
import {clamp, ease, heartbeat, HEARTBEATS, mix, prog, springAt} from '../lib/anim';
import {Kinetic} from '../lib/Kinetic';
import wordmark from '../wordmark.json';
import {CellWorld} from './CellWorld';
import {shockWaves} from './Opening';

// Wordmark placement (412 x 71 viewBox → 800 px wide)
const WM = {x: 140, y: 1036, w: 800};
const S = WM.w / 412;
export const DOT = {x: WM.x + wordmark.dot.cx * S, y: WM.y + wordmark.dot.cy * S, r: wordmark.dot.r * S};

const START = {x: 540, y: 968, r: 70};
const CTRL = {x: 360, y: 880};

export const Finale: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;

  // pearl grows out of the collapsing ring, beats once, then flies into the "i"
  const grow = springAt(frame, T.finale - 6, {damping: 14, stiffness: 110});
  const fly = ease.inOutCubic(prog(frame, 792, T.dotLand - 792));
  const u = fly;
  const px = (1 - u) * (1 - u) * START.x + 2 * (1 - u) * u * CTRL.x + u * u * DOT.x;
  const py = (1 - u) * (1 - u) * START.y + 2 * (1 - u) * u * CTRL.y + u * u * DOT.y;
  const r = mix(START.r * grow, DOT.r * 1.12, ease.inOutCubic(prog(frame, 796, T.dotLand - 796)));

  const land = prog(frame, T.dotLand, 40);
  const [wa, wb] = shockWaves(t, [HEARTBEATS[3]]);
  // landing ping travels in ovum units (radius shrinks, so scale the wave radius up)
  const ping = land > 0 && land < 1 ? ([1.1 + 9 * ease.outCubic(land), 0.8 * Math.pow(1 - land, 1.4), 0.25 + 0.6 * land] as [number, number, number]) : wa;

  const worldIn = ease.inOutCubic(prog(frame, T.finale - 8, 30));

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{opacity: worldIn}}>
        <CellWorld
          params={{
            time: t,
            center: [px, py],
            radius: Math.max(0.5, r),
            pulse: heartbeat(t) + (land > 0 ? Math.exp(-land * 5) * 1.2 : 0),
            glow: mix(1.15, 1.9, fly),
            waveA: ping,
            waveB: wb,
            warm: 0,
          }}
        />
      </AbsoluteFill>

      <Kinetic segs={[{t: 'Orzuga', italic: true, color: C.rose}, {t: ' bir qadam'}]} start={744} y={560} size={112} color={C.cream} stagger={1.8} dur={38} />
      <Kinetic segs={[{t: 'yaqinroq.'}]} start={758} y={690} size={112} color={C.cream} stagger={2} dur={38} />

      <svg
        width={WM.w}
        height={71 * S}
        viewBox="0 0 412 71"
        style={{position: 'absolute', left: WM.x, top: WM.y, overflow: 'visible'}}
      >
        <defs>
          <clipPath id="wmClip">
            <rect x={-10} y={-20} width={440} height={77} />
          </clipPath>
          <linearGradient id="shine" x1="0" y1="0" x2="1" y2="0.35">
            <stop offset={clamp(mix(-0.3, 1.1, prog(frame, 846, 40)) - 0.12)} stopColor="#fff" stopOpacity={0} />
            <stop offset={clamp(mix(-0.3, 1.1, prog(frame, 846, 40)))} stopColor="#fff" stopOpacity={0.9} />
            <stop offset={clamp(mix(-0.3, 1.1, prog(frame, 846, 40)) + 0.12)} stopColor="#fff" stopOpacity={0} />
          </linearGradient>
          <radialGradient id="dotFill" cx="0.38" cy="0.34" r="0.75">
            <stop offset="0" stopColor="#fff4f8" />
            <stop offset="0.45" stopColor="#f59ab9" />
            <stop offset="1" stopColor="#c8406f" />
          </radialGradient>
        </defs>
        <g clipPath="url(#wmClip)">
          {wordmark.glyphs.map((g, i) => {
            const st = 800 + i * 2.4 + (i === 2 ? 20 : 0);
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
          top: 1226,
          left: 540 - 70 * ease.swift(prog(frame, 846, 30)),
          width: 140 * ease.swift(prog(frame, 846, 30)),
          height: 1.5,
          background: 'rgba(244,169,194,0.6)',
        }}
      />
      <Kinetic segs={[{t: 'fairhaven.uz'}]} font="sans" weight={500} size={46} tracking={0.08} color={C.cream} start={850} y={1256} stagger={1} dur={30} />
      <Kinetic
        segs={[{t: 'Rasmiy distribyutor · O‘zbekiston'}]}
        font="sans"
        weight={400}
        size={27}
        tracking={0.08}
        color={C.rose}
        start={858}
        y={1326}
        stagger={0.6}
        dur={28}
      />
    </AbsoluteFill>
  );
};
