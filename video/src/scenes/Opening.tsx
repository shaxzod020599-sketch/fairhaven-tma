import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {C, FPS, T} from '../brand';
import {clamp, ease, heartbeat, HEARTBEATS, mix, prog} from '../lib/anim';
import {Kinetic} from '../lib/Kinetic';
import {spermPose} from '../lib/sperm';
import {CellWorld} from './CellWorld';

// Ovum framing at the moment of contact — the 3D macro camera matches this.
export const OPEN_CENTER: [number, number] = [540, 900];
export const OPEN_RADIUS_END = 300;

export const shockWaves = (t: number, beats: number[]) => {
  const waves: [number, number, number][] = [];
  for (const b of beats) {
    const x = (t - b) / 0.95;
    if (x < 0 || x > 1) continue;
    const e = ease.outCubic(x);
    waves.push([1.08 + 2.7 * e, 0.5 * Math.pow(1 - x, 1.6), 0.018 + 0.07 * x]);
  }
  while (waves.length < 2) waves.push([0, 0, 0.05]);
  return waves.slice(-2);
};

export const Opening: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;

  const push = ease.inOutCubic(prog(frame, 0, T.contact));
  const radius = mix(270, OPEN_RADIUS_END, push);
  const rot = mix(-0.05, 0, ease.outCubic(prog(frame, 0, T.contact)));

  // Swim: appears top-right on beat 1, reaches the rim at contact.
  const swim = prog(frame, 26, T.contact - 26 - 2);
  const u = ease.glide(swim) * 0.35 + swim * 0.65;
  const pose = spermPose(u, t, 1);
  const spermAlpha = clamp((frame - 26) / 10);

  const flash = frame < T.contact - 5 ? 0 : ease.inExpo(prog(frame, T.contact - 5, 5));
  const warm = ease.inOutCubic(prog(frame, 96, 54)) * 0.55;
  const [wa, wb] = shockWaves(t, HEARTBEATS.slice(0, 3));

  return (
    <AbsoluteFill style={{backgroundColor: C.night}}>
      <CellWorld
        params={{
          time: t,
          center: OPEN_CENTER,
          radius,
          rot,
          pulse: heartbeat(t),
          glow: 1,
          sperm: {...pose, alpha: spermAlpha},
          waveA: wa,
          waveB: wb,
          flash,
          flashPos: pose.head,
          warm,
        }}
      />
      <Kinetic
        segs={[{t: 'Ikki yurak.'}]}
        start={14}
        exit={128}
        exitMode="blur"
        y={1330}
        size={128}
        color={C.cream}
        stagger={2.2}
        dur={40}
      />
      <Kinetic
        segs={[{t: 'Bitta ', color: C.cream}, {t: 'orzu.', italic: true, color: C.rose}]}
        start={70}
        exit={134}
        exitMode="blur"
        y={1478}
        size={128}
        color={C.cream}
        stagger={2.2}
        dur={40}
      />
    </AbsoluteFill>
  );
};
