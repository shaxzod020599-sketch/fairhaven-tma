import React, {useLayoutEffect, useMemo} from 'react';
import {ThreeCanvas} from '@remotion/three';
import {useLoader, useThree} from '@react-three/fiber';
import {staticFile, useCurrentFrame} from 'remotion';
import * as THREE from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {FPS, H, T, W} from '../brand';
import {DECAL_FRAG, DECAL_VERT, TAIL_N} from '../gl/ovum';
import {clamp, cubicBezier, ease, mix, prog} from '../lib/anim';
import {spermPose} from '../lib/sperm';
import {OPEN_CENTER, OPEN_RADIUS_END} from './Opening';

// Geometry of the FH PRO bottle — same spec the fairhaven.uz hero uses (web/src/components/fhProModel.mjs).
const spec = {
  baseY: -1.34,
  bodyRadius: 0.68,
  neckTop: 0.96,
  capRadius: 0.49,
  labelBottom: -0.98,
  labelTop: 0.54,
  labelRadius: 0.687,
  labelArc: 2.3,
};

// Where the printed egg-cell icon sits on the label (texture px 665,767 of 815x940).
const ICON_THETA = (665 / 815 - 0.5) * spec.labelArc;
const ICON_Y = spec.labelBottom + (1 - 767 / 940) * (spec.labelTop - spec.labelBottom);
const OVUM_R = 0.135; // world units — radius of the decal cell
const DECAL_R = 0.6893;
const PATCH = {x0: -1.8, x1: 2.0, y0: -1.75, y1: 2.9}; // ovum units

const FOV = 24;
const TAN = Math.tan(((FOV / 2) * Math.PI) / 180);

const BODY_POINTS = [
  [0, spec.baseY],
  [0.56, spec.baseY],
  [0.63, -1.3],
  [0.675, -1.2],
  [spec.bodyRadius, -1.08],
  [spec.bodyRadius, 0.42],
  [0.672, 0.53],
  [0.635, 0.66],
  [0.575, 0.78],
  [0.515, 0.87],
  [0.475, 0.92],
  [0.465, spec.neckTop],
  [0, spec.neckTop],
].map(([x, y]) => new THREE.Vector2(x, y));

// ---------------------------------------------------------------- camera path
const pullCurve = cubicBezier(0.3, 0, 0.1, 1);

/** Surface distance so the decal ovum matches the opening's final framing. */
const MACRO_DIST = (OVUM_R * (H / 2)) / (OPEN_RADIUS_END * TAN);
const MACRO_TARGET_DY = -((H / 2 - OPEN_CENTER[1]) / OPEN_RADIUS_END) * OVUM_R;

const HERO = {dist: 12.28, targetY: 0.455};
const FAMILY = {dist: 14.45, targetY: -0.25};

export const bottleState = (f: number) => {
  const k = pullCurve(prog(f, T.contact, T.hero + 6 - T.contact));
  const toFam = ease.inOutCubic(prog(f, T.toFamily, 30));

  // log-space dolly: perceptually even zoom
  const dStart = MACRO_DIST;
  const dHero = HERO.dist;
  let dist = Math.exp(mix(Math.log(dStart), Math.log(dHero), k));
  let targetY = mix(ICON_Y + MACRO_TARGET_DY, HERO.targetY, ease.inOutCubic(clamp(k * 1.15)));
  const targetZ = mix(spec.labelRadius, 0, ease.inOutCubic(clamp(k * 1.1)));
  dist = mix(dist, FAMILY.dist, toFam);
  targetY = mix(targetY, FAMILY.targetY, toFam);

  const yawIn = ease.inOutCubic(prog(f, T.contact + 4, 66));
  const heroDrift = ease.inOutCubic(prog(f, T.hero - 10, T.toFamily - T.hero + 10));
  let yaw = mix(-ICON_THETA, -0.2, yawIn) + heroDrift * 0.36;
  yaw = mix(yaw, 0, toFam) + ease.inOutCubic(prog(f, T.toFamily + 20, 40)) * 0.0;

  const roll = mix(-0.09, 0, ease.outCubic(prog(f, T.contact, 70)));
  const bob = Math.sin((f / FPS) * 1.6) * 0.018 * clamp((f - T.hero + 20) / 30);
  return {dist, targetY, targetZ, yaw, roll, bob};
};

// ---------------------------------------------------------------- pieces
const makeLabelGeometry = (radius: number, arc: number, y0: number, y1: number, thetaCenter = 0, seg = 96) => {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    const a = thetaCenter + (u - 0.5) * arc;
    const x = Math.sin(a) * radius;
    const z = Math.cos(a) * radius;
    positions.push(x, y0, z, x, y1, z);
    uvs.push(u, 0, u, 1);
  }
  for (let i = 0; i < seg; i++) {
    const b = i * 2;
    indices.push(b, b + 2, b + 1, b + 2, b + 3, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
};

const ribbedCap = () => {
  const g = new THREE.CylinderGeometry(spec.capRadius, spec.capRadius, 0.36, 256, 1, false);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const ridge = 1 + 0.014 * (0.5 + 0.5 * Math.cos(a * 48));
    pos.setX(i, x * ridge);
    pos.setZ(i, z * ridge);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
};

const shadowTexture = () => {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(74,24,46,0.55)');
  g.addColorStop(0.35, 'rgba(74,24,46,0.28)');
  g.addColorStop(1, 'rgba(74,24,46,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

const Studio: React.FC = () => {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useLayoutEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.035).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.62;
    return () => {
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
};

const Decal: React.FC<{frame: number; pxWorld: number}> = ({frame, pxWorld}) => {
  const geometry = useMemo(() => {
    const arc = ((PATCH.x1 - PATCH.x0) * OVUM_R) / DECAL_R;
    const center = ICON_THETA + (((PATCH.x0 + PATCH.x1) / 2) * OVUM_R) / DECAL_R;
    return makeLabelGeometry(DECAL_R, arc, ICON_Y + PATCH.y0 * OVUM_R, ICON_Y + PATCH.y1 * OVUM_R, center, 64);
  }, []);
  const uniforms = useMemo(
    () => ({
      uPatch: {value: new THREE.Vector4(PATCH.x0, PATCH.x1, PATCH.y0, PATCH.y1)},
      uPx: {value: 0.004},
      uTime: {value: 0},
      uPulse: {value: 0},
      uGlow: {value: 0.8},
      uSperm: {value: 1},
      uHead: {value: new THREE.Vector2()},
      uHeadDir: {value: new THREE.Vector2()},
      uTail: {value: Array.from({length: TAIL_N}, () => new THREE.Vector2())},
      uWaveA: {value: new THREE.Vector3(0, 0, 0.05)},
      uWaveB: {value: new THREE.Vector3(0, 0, 0.05)},
      uFert: {value: 0},
      uGlowR: {value: 1.75},
    }),
    [],
  );
  const t = frame / FPS;
  const pose = spermPose(1, t, mix(1, 0.35, clamp((frame - T.contact) / 60)));
  uniforms.uTime.value = t;
  uniforms.uPx.value = pxWorld / OVUM_R;
  uniforms.uHead.value.set(...pose.head);
  uniforms.uHeadDir.value.set(...pose.dir);
  pose.tail.forEach((p, i) => uniforms.uTail.value[i].set(p[0], p[1]));
  // afterglow of the contact, then a calm print-like glow
  uniforms.uGlow.value = mix(1.4, 0.55, ease.outCubic(prog(frame, T.contact, 50)));
  uniforms.uPulse.value = mix(0.8, 0, ease.outCubic(prog(frame, T.contact, 30)));

  return (
    <mesh geometry={geometry} renderOrder={3}>
      <shaderMaterial
        vertexShader={DECAL_VERT}
        fragmentShader={DECAL_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.CustomBlending}
        blendSrc={THREE.OneFactor}
        blendDst={THREE.OneMinusSrcAlphaFactor}
        toneMapped={false}
        polygonOffset
        polygonOffsetFactor={-4}
      />
    </mesh>
  );
};

const Bottle: React.FC<{frame: number; pxWorld: number}> = ({frame, pxWorld}) => {
  const label = useLoader(THREE.TextureLoader, staticFile('label-clean.jpg'));
  const gl = useThree((s) => s.gl);
  useMemo(() => {
    label.colorSpace = THREE.SRGBColorSpace;
    label.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    label.needsUpdate = true;
  }, [label, gl]);
  const labelGeo = useMemo(() => makeLabelGeometry(spec.labelRadius, spec.labelArc, spec.labelBottom, spec.labelTop, 0, 128), []);
  const cap = useMemo(ribbedCap, []);
  const split = -0.245;

  return (
    <group>
      <mesh>
        <latheGeometry args={[BODY_POINTS, 160]} />
        <meshPhysicalMaterial color="#fbfbfa" roughness={0.46} clearcoat={0.35} clearcoatRoughness={0.38} />
      </mesh>
      <mesh position={[0, 1.19, 0]} geometry={cap}>
        <meshPhysicalMaterial color="#ffffff" roughness={0.36} clearcoat={0.3} clearcoatRoughness={0.4} />
      </mesh>
      <mesh position={[0, 1.015, 0]}>
        <cylinderGeometry args={[0.495, 0.495, 0.095, 128]} />
        <meshStandardMaterial color="#f5f4f3" roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.376, 0]}>
        <cylinderGeometry args={[0.487, 0.487, 0.018, 128]} />
        <meshStandardMaterial color="#ffffff" roughness={0.45} />
      </mesh>
      {/* sleeve behind the photographic label */}
      <mesh position={[0, split + (spec.labelTop - split) / 2, 0]}>
        <cylinderGeometry args={[0.683, 0.683, spec.labelTop - split, 128, 1, true]} />
        <meshStandardMaterial color="#ffffff" roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, spec.labelBottom + (split - spec.labelBottom) / 2, 0]}>
        <cylinderGeometry args={[0.683, 0.683, split - spec.labelBottom, 128, 1, true]} />
        <meshStandardMaterial color="#7e1f45" roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={labelGeo} renderOrder={2}>
        <meshStandardMaterial
          map={label}
          emissiveMap={label}
          emissive="#ffffff"
          emissiveIntensity={0.62}
          roughness={0.38}
          metalness={0}
          polygonOffset
          polygonOffsetFactor={-2}
        />
      </mesh>
      <Decal frame={frame} pxWorld={pxWorld} />
    </group>
  );
};

const Rig: React.FC<{frame: number}> = ({frame}) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const shadow = useMemo(shadowTexture, []);
  const s = bottleState(frame);

  camera.fov = FOV;
  camera.near = 0.05;
  camera.far = 80;
  camera.position.set(0, s.targetY, s.targetZ + s.dist);
  camera.up.set(Math.sin(s.roll), Math.cos(s.roll), 0);
  camera.lookAt(0, s.targetY, s.targetZ);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // world size of one screen pixel at the icon (for shader anti-aliasing)
  const pxWorld = (2 * s.dist * TAN) / H;

  // key light sweeps across during the hero hold
  const sweep = ease.inOutCubic(prog(frame, T.hero - 30, 200));
  const keyX = mix(-5.5, 5.5, sweep);
  const shadowOn = clamp((frame - T.contact - 8) / 30);

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[keyX, 5.5, 4.5]} intensity={1.9} color="#fff8f4" />
      <directionalLight position={[-4, 2, 3]} intensity={0.45} color="#f4dbe5" />
      <directionalLight position={[3.5, 1.5, -4]} intensity={0.9} color="#dcebe8" />
      <group position={[0, s.bob, 0]} rotation={[0, s.yaw, 0]}>
        <Bottle frame={frame} pxWorld={pxWorld} />
      </group>
      <mesh position={[0, spec.baseY - 0.004 + s.bob * 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <planeGeometry args={[3.4, 3.4]} />
        <meshBasicMaterial map={shadow} transparent opacity={shadowOn * 0.9} depthWrite={false} toneMapped={false} />
      </mesh>
    </>
  );
};

export const Bottle3D: React.FC<{style?: React.CSSProperties}> = ({style}) => {
  const frame = useCurrentFrame();
  return (
    <ThreeCanvas
      width={W}
      height={H}
      style={{position: 'absolute', inset: 0, ...style}}
      gl={{antialias: true, alpha: true, premultipliedAlpha: true}}
      camera={{fov: FOV, position: [0, 0, 10], near: 0.05, far: 80}}
    >
      <Studio />
      <Rig frame={frame} />
    </ThreeCanvas>
  );
};
