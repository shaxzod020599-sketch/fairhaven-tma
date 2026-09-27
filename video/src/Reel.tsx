import React from 'react';
import {AbsoluteFill, Audio, staticFile, useCurrentFrame} from 'remotion';
import {C, T} from './brand';
import {clamp, ease, mix, prog} from './lib/anim';
import {Grain} from './lib/Grain';
import {Show} from './lib/Show';
import {Opening, OPEN_CENTER} from './scenes/Opening';
import {ProductStage} from './scenes/ProductStage';
import {FamilyStage} from './scenes/FamilyStage';
import {Numbers} from './scenes/Numbers';
import {Finale} from './scenes/Finale';

const Studio: React.FC = () => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(ellipse 80% 60% at 50% 56%, rgba(240,210,222,0.75) 0%, rgba(240,210,222,0) 70%), ${C.cream}`,
    }}
  >
    <AbsoluteFill style={{background: 'radial-gradient(ellipse 75% 65% at 50% 50%, rgba(0,0,0,0) 55%, rgba(110,50,75,0.12) 100%)'}} />
  </AbsoluteFill>
);

/** Light burst at the moment of contact — hides the cut into the 3D label. */
const ContactFlash: React.FC = () => {
  const f = useCurrentFrame();
  const up = ease.inExpo(prog(f, T.contact - 6, 6));
  const down = 1 - ease.outCubic(prog(f, T.contact + 1, 22));
  const a = f <= T.contact ? up : down;
  if (a <= 0.001) return null;
  const ring = ease.outCubic(prog(f, T.contact, 26));
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${OPEN_CENTER[0] + 200}px ${OPEN_CENTER[1] - 200}px, rgba(255,250,252,${a}) 0%, rgba(255,226,236,${a * 0.96}) ${mix(18, 60, ring)}%, rgba(255,190,212,${a * 0.85}) 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};

const grainFor = (f: number) => (f < T.contact ? 0.13 : f < T.numbers ? 0.06 : 0.12);

export const Reel: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{backgroundColor: C.night}}>
      <Show from={0} to={T.contact + 2}>
        <Opening />
      </Show>
      <Show from={T.contact - 2} to={T.numbers + 30}>
        <Studio />
      </Show>
      <Show from={T.contact - 2} to={T.him + 26}>
        <ProductStage />
      </Show>
      <Show from={T.him - 6} to={T.numbers + 26}>
        <FamilyStage />
      </Show>
      <Show from={T.finale - 10} to={900}>
        <Finale />
      </Show>
      <Show from={T.numbers + 10} to={T.finale + 30}>
        <Numbers />
      </Show>
      <ContactFlash />
      <Grain opacity={grainFor(f)} />
      <Audio src={staticFile('soundtrack.wav')} />
    </AbsoluteFill>
  );
};
