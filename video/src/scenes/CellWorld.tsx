import React, {useMemo} from 'react';
import {ThreeCanvas} from '@remotion/three';
import * as THREE from 'three';
import {W, H} from '../brand';
import {FULLSCREEN_VERT, MACRO_FRAG, TAIL_N} from '../gl/ovum';
import type {V2} from '../lib/sperm';

export type CellParams = {
  time: number;
  center: V2; // px, y down (DOM convention)
  radius: number; // px
  rot?: number;
  pulse: number;
  glow?: number;
  sperm?: {head: V2; dir: V2; tail: V2[]; alpha: number};
  waveA?: [number, number, number];
  waveB?: [number, number, number];
  flash?: number;
  flashPos?: V2;
  warm?: number;
  fert?: number;
};

const Plane: React.FC<{params: CellParams}> = ({params}) => {
  const uniforms = useMemo(
    () => ({
      uRes: {value: new THREE.Vector2(W, H)},
      uCenter: {value: new THREE.Vector2()},
      uRadius: {value: 300},
      uRot: {value: 0},
      uFlash: {value: 0},
      uFlashPos: {value: new THREE.Vector2()},
      uWarm: {value: 0},
      uTime: {value: 0},
      uPulse: {value: 0},
      uGlow: {value: 1},
      uSperm: {value: 0},
      uHead: {value: new THREE.Vector2()},
      uHeadDir: {value: new THREE.Vector2(-1, -1)},
      uTail: {value: Array.from({length: TAIL_N}, () => new THREE.Vector2())},
      uWaveA: {value: new THREE.Vector3(0, 0, 0.05)},
      uWaveB: {value: new THREE.Vector3(0, 0, 0.05)},
      uFert: {value: 0},
      uGlowR: {value: 99},
    }),
    [],
  );

  const p = params;
  uniforms.uTime.value = p.time;
  uniforms.uCenter.value.set(p.center[0], H - p.center[1]);
  uniforms.uRadius.value = p.radius;
  uniforms.uRot.value = p.rot ?? 0;
  uniforms.uPulse.value = p.pulse;
  uniforms.uGlow.value = p.glow ?? 1;
  uniforms.uFlash.value = p.flash ?? 0;
  uniforms.uFlashPos.value.set(...(p.flashPos ?? [0, 0]));
  uniforms.uWarm.value = p.warm ?? 0;
  uniforms.uFert.value = p.fert ?? 0;
  const wa = p.waveA ?? [0, 0, 0.05];
  const wb = p.waveB ?? [0, 0, 0.05];
  uniforms.uWaveA.value.set(wa[0], wa[1], wa[2]);
  uniforms.uWaveB.value.set(wb[0], wb[1], wb[2]);
  if (p.sperm && p.sperm.alpha > 0) {
    uniforms.uSperm.value = p.sperm.alpha;
    uniforms.uHead.value.set(...p.sperm.head);
    uniforms.uHeadDir.value.set(...p.sperm.dir);
    p.sperm.tail.forEach((pt, i) => uniforms.uTail.value[i].set(pt[0], pt[1]));
  } else {
    uniforms.uSperm.value = 0;
  }

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial vertexShader={FULLSCREEN_VERT} fragmentShader={MACRO_FRAG} uniforms={uniforms} depthTest={false} depthWrite={false} toneMapped={false} />
    </mesh>
  );
};

export const CellWorld: React.FC<{params: CellParams; style?: React.CSSProperties}> = ({params, style}) => (
  <ThreeCanvas width={W} height={H} style={{position: 'absolute', inset: 0, ...style}} gl={{antialias: false, alpha: false}} flat linear>
    <Plane params={params} />
  </ThreeCanvas>
);
