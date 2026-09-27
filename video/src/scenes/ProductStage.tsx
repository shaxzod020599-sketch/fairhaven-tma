import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {C, F, T} from '../brand';
import {clamp, ease, mix, prog} from '../lib/anim';
import {Kinetic} from '../lib/Kinetic';
import {Bottle3D} from './Bottle3D';

// Arch (the fairhaven.uz hero frame) → berry circle (a cell) morph.
const ARCH = {x0: 150, x1: 930, y0: 380, y1: 1780};
export const HER_CIRCLE = {cx: 540, cy: 875, r: 375};

const roundedPath = (x0: number, y0: number, x1: number, y1: number, rt: number, rb: number) => {
  const w = x1 - x0;
  rt = Math.min(rt, w / 2, (y1 - y0) / 2);
  rb = Math.min(rb, w / 2, (y1 - y0) / 2);
  return [
    `M ${x0} ${y0 + rt}`,
    `A ${rt} ${rt} 0 0 1 ${x0 + rt} ${y0}`,
    `L ${x1 - rt} ${y0}`,
    `A ${rt} ${rt} 0 0 1 ${x1} ${y0 + rt}`,
    `L ${x1} ${y1 - rb}`,
    rb > 0.01 ? `A ${rb} ${rb} 0 0 1 ${x1 - rb} ${y1}` : '',
    `L ${x0 + rb} ${y1}`,
    rb > 0.01 ? `A ${rb} ${rb} 0 0 1 ${x0} ${y1 - rb}` : '',
    'Z',
  ].join(' ');
};

export const CircleFill: React.FC<{id: string; light: string; mid: string; dark: string}> = ({id, light, mid, dark}) => (
  <radialGradient id={id} cx="0.36" cy="0.3" r="0.8">
    <stop offset="0" stopColor={light} />
    <stop offset="0.55" stopColor={mid} />
    <stop offset="1" stopColor={dark} />
  </radialGradient>
);

const Pill: React.FC<{label: string; start: number; frame: number}> = ({label, start, frame}) => {
  const p = ease.swift(prog(frame, start, 26));
  const out = ease.inCubic(prog(frame, T.toFamily - 8, 14));
  return (
    <div
      style={{
        padding: '14px 26px 13px',
        borderRadius: 999,
        border: `1.5px solid rgba(151,57,97,0.38)`,
        background: 'rgba(255,255,255,0.55)',
        fontFamily: F.sans,
        fontWeight: 600,
        fontSize: 22,
        letterSpacing: '0.16em',
        color: C.plum,
        opacity: p * (1 - out),
        transform: `translateY(${(1 - p) * 26 - out * 20}px) scale(${mix(0.9, 1, p)})`,
      }}
    >
      {label}
    </div>
  );
};

export const ProductStage: React.FC = () => {
  const frame = useCurrentFrame();

  // arch reveal while the camera settles
  const archIn = ease.swift(prog(frame, T.contact + 16, 50));
  const stroke = ease.inOutCubic(prog(frame, T.contact + 34, 70));
  // arch → circle
  const m = ease.inOutCubic(prog(frame, T.toFamily, 30));
  const c = HER_CIRCLE;
  const x0 = mix(ARCH.x0, c.cx - c.r, m);
  const x1 = mix(ARCH.x1, c.cx + c.r, m);
  const y0 = mix(ARCH.y0, c.cy - c.r, m);
  const y1 = mix(ARCH.y1, c.cy + c.r, m);
  const rt = mix((ARCH.x1 - ARCH.x0) / 2, c.r, m);
  const rb = mix(0, c.r, m);
  const d = roundedPath(x0, y0, x1, y1, rt, rb);
  const archScale = mix(1.07, 1, archIn);

  // her-group leaves to the left on the "him" beat
  const slide = ease.inOutCubic(prog(frame, T.him - 4, 22));
  const slideX = -1180 * slide;
  const blurX = Math.sin(slide * Math.PI) * 22;

  const sideText = clamp((frame - T.contact - 40) / 30) * (1 - m);

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{transform: `translateX(${slideX}px)`, filter: blurX > 0.5 ? `blur(${(blurX * 0.35).toFixed(1)}px)` : undefined}}>
        <svg width={1080} height={1920} style={{position: 'absolute', inset: 0}}>
          <defs>
            <linearGradient id="archFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f0d6e1" />
              <stop offset="0.55" stopColor="#f6e7ec" />
              <stop offset="1" stopColor="#fbf4f1" />
            </linearGradient>
            <CircleFill id="berryFill" light="#d4628f" mid="#b83a6b" dark="#8e2152" />
          </defs>
          <g style={{transformOrigin: '540px 1080px', transform: `scale(${archScale})`}} opacity={archIn}>
            <path d={d} fill="url(#archFill)" opacity={1 - m} />
            <path d={d} fill="url(#berryFill)" opacity={m} />
            <circle cx={c.cx} cy={c.cy} r={c.r + 22} fill="none" stroke={C.berry} strokeWidth={1.5} strokeOpacity={0.35 * ease.outCubic(prog(frame, T.toFamily + 20, 20))} />
            <path
              d={d}
              fill="none"
              stroke={C.plum}
              strokeOpacity={0.4 * (1 - m)}
              strokeWidth={2}
              pathLength={1}
              strokeDasharray="1 1"
              strokeDashoffset={1 - stroke}
            />
          </g>
        </svg>

        {/* vertical brand note, as on the fairhaven.uz hero */}
        <div
          style={{
            position: 'absolute',
            left: 62,
            top: 1080,
            transform: 'translate(-50%, -50%) rotate(-90deg)',
            fontFamily: F.sans,
            fontWeight: 600,
            fontSize: 19,
            letterSpacing: '0.34em',
            color: C.plum,
            opacity: 0.55 * sideText,
            whiteSpace: 'nowrap',
          }}
        >
          EST. 2003 · SEATTLE, USA
        </div>

        <Bottle3D />

        {/* S2 copy */}
        <Kinetic
          segs={[{t: 'AQSh sifati · 2003-yildan'}]}
          upper
          font="sans"
          weight={600}
          size={24}
          tracking={0.3}
          color={C.plum}
          start={T.hero - 14}
          exit={T.toFamily - 12}
          exitDur={12}
          y={196}
          stagger={0.8}
          dur={28}
        />
        <Kinetic segs={[{t: 'Ilm bilan yaratilgan'}]} start={T.hero - 8} exit={T.toFamily - 10} exitDur={13} y={246} size={98} color={C.ink} stagger={1.4} />
        <Kinetic
          segs={[{t: 'g‘amxo‘rlik.', italic: true, color: C.plum}]}
          start={T.hero + 4}
          exit={T.toFamily - 7}
          exitDur={13}
          y={362}
          size={98}
          color={C.ink}
          stagger={1.6}
        />
        <div style={{position: 'absolute', top: 506, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 14}}>
          <Pill label="cGMP" start={T.hero + 22} frame={frame} />
          <Pill label="NON-GMO" start={T.hero + 28} frame={frame} />
          <Pill label="MADE IN USA" start={T.hero + 34} frame={frame} />
        </div>

        {/* S3 — her */}
        <Kinetic
          segs={[{t: 'Ayol', italic: true, color: C.berry}, {t: ' uchun.'}]}
          start={T.her + 10}
          y={1362}
          size={132}
          color={C.ink}
          stagger={2}
          dur={36}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
