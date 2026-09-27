import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame} from 'remotion';
import {C, FPS, T} from '../brand';
import {clamp, ease, heartbeat, mix, prog, springAt} from '../lib/anim';
import {Kinetic} from '../lib/Kinetic';
import {Pearl} from '../lib/Pearl';
import {CircleFill, HER_CIRCLE} from './ProductStage';

// PNG cut-outs are 23 px padded; the bottle itself is ~318 x 604 px.
const PNG = {w: 365, h: 652, bx: 23, by: 23, bw: 318, bh: 604};

const BottlePng: React.FC<{src: string; cx: number; top: number; height: number; rot?: number; shadow: string}> = ({src, cx, top, height, rot = 0, shadow}) => {
  const s = height / PNG.bh;
  return (
    <Img
      src={staticFile(src)}
      style={{
        position: 'absolute',
        width: PNG.w * s,
        height: PNG.h * s,
        left: cx - (PNG.bx + PNG.bw / 2) * s,
        top: top - PNG.by * s,
        transform: `rotate(${rot}deg)`,
        transformOrigin: '50% 92%',
        filter: `drop-shadow(0 ${height * 0.045}px ${height * 0.05}px ${shadow})`,
      }}
    />
  );
};

// Family layout: two overlapping cells — her (berry) and him (blue) — and the new one between them.
const FAM = {r: 300, herX: 355, himX: 725, cy: 820, bottleH: 640, bottleTop: 604, herBottleX: 272, himBottleX: 808};
export const FAMILY_PEARL = {x: 540, y: 690};

export const FamilyStage: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;

  // "him" enters from the right on the beat
  const enter = ease.inOutCubic(prog(frame, T.him - 2, 22));
  const himIn = 1180 * (1 - enter);
  const blur = Math.sin(enter * Math.PI) * 8;
  const settle = springAt(frame, T.him + 12, {damping: 12, stiffness: 120});

  // family: both cells meet, overlap, and make a third
  const fam = ease.inOutCubic(prog(frame, T.family - 4, 26));
  const herBack = ease.inOutCubic(prog(frame, T.family - 2, 26));
  const herBlur = Math.sin(herBack * Math.PI) * 8;

  const himCx = mix(HER_CIRCLE.cx, FAM.himX, fam);
  const himR = mix(HER_CIRCLE.r, FAM.r, fam);
  const himCy = mix(HER_CIRCLE.cy, FAM.cy, fam);
  const herCx = mix(-440, FAM.herX, herBack);

  const himBottleH = mix(850, FAM.bottleH, fam);
  const himBottleX = mix(540, FAM.himBottleX, fam);
  const himBottleTop = mix(450, FAM.bottleTop, fam);
  const herBottleX = mix(-460, FAM.herBottleX, herBack);

  const lens = ease.outCubic(prog(frame, T.family + 12, 18));
  const pearlIn = springAt(frame, T.family + 20, {damping: 11, stiffness: 150});
  const pulse = heartbeat(t - (T.family + 30) / FPS + 0.02) * 0.9;

  // iris: the pearl opens into the numbers scene
  const iris = ease.inOutExpo(prog(frame, T.numbers - 8, 22));
  const pearlR = 34 * pearlIn * (1 + 0.08 * pulse);
  const ring = (cx: number, cy: number, r: number, color: string, o: number) => (
    <circle cx={cx} cy={cy} r={r + 22} fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.35 * o} />
  );

  return (
    <AbsoluteFill>
      <svg width={1080} height={1920} style={{position: 'absolute', inset: 0}}>
        <defs>
          <CircleFill id="blueFill" light="#5b95d0" mid="#2f6cad" dark="#1d4f88" />
          <CircleFill id="berryFill2" light="#d4628f" mid="#b83a6b" dark="#8e2152" />
          <radialGradient id="lensFill" cx="0.5" cy="0.4" r="0.65">
            <stop offset="0" stopColor="#c45b8e" />
            <stop offset="1" stopColor="#6f2350" />
          </radialGradient>
          <clipPath id="herClip">
            <circle cx={herCx} cy={FAM.cy} r={FAM.r} />
          </clipPath>
        </defs>
        {herBack > 0 && (
          <g style={{filter: herBlur > 0.3 ? `blur(${herBlur.toFixed(1)}px)` : undefined}}>
            <circle cx={herCx} cy={FAM.cy} r={FAM.r} fill="url(#berryFill2)" />
            {ring(herCx, FAM.cy, FAM.r, C.berry, herBack)}
          </g>
        )}
        <g transform={`translate(${himIn} 0)`} style={{filter: blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : undefined}}>
          <circle cx={himCx} cy={himCy} r={himR} fill="url(#blueFill)" />
          {ring(himCx, himCy, himR, C.blue, 1)}
        </g>
        <g clipPath="url(#herClip)" opacity={lens}>
          <circle cx={himCx + himIn} cy={himCy} r={himR} fill="url(#lensFill)" />
        </g>
      </svg>

      {herBack > 0 && (
        <div style={{position: 'absolute', inset: 0, filter: herBlur > 0.3 ? `blur(${herBlur.toFixed(1)}px)` : undefined}}>
          <BottlePng src="bottles/fhpro-women.png" cx={herBottleX} top={FAM.bottleTop} height={FAM.bottleH} rot={mix(-12, -3, herBack)} shadow="rgba(60,10,30,0.35)" />
        </div>
      )}
      <div style={{position: 'absolute', inset: 0, transform: `translateX(${himIn}px)`, filter: blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : undefined}}>
        <BottlePng
          src="bottles/fhpro-men.png"
          cx={himBottleX}
          top={himBottleTop}
          height={himBottleH}
          rot={mix(6 * (1 - settle), 3, fam)}
          shadow="rgba(10,25,60,0.35)"
        />
      </div>
      <Pearl x={FAMILY_PEARL.x} y={FAMILY_PEARL.y} r={pearlR} glow={1 + pulse} opacity={clamp(pearlIn * 3)} />

      <Kinetic segs={[{t: 'Erkak', italic: true, color: C.blue}, {t: ' uchun.'}]} start={T.him + 8} exit={T.family - 8} exitMode="up" y={1362} size={132} color={C.ink} stagger={2} dur={36} />
      <Kinetic segs={[{t: 'Oila', italic: true, color: C.plum}, {t: ' uchun.'}]} start={T.family + 8} y={1362} size={132} color={C.ink} stagger={2} dur={36} />

      {iris > 0 && (
        <AbsoluteFill
          style={{
            clipPath: `circle(${mix(pearlR, 2300, iris)}px at ${FAMILY_PEARL.x}px ${FAMILY_PEARL.y}px)`,
            background: 'radial-gradient(circle at 50% 45%, #a8426f 0%, #973961 45%, #5a1734 100%)',
          }}
        />
      )}
    </AbsoluteFill>
  );
};
