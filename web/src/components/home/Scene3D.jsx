import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  ContactShadows,
  Environment,
  Float,
  Lightformer,
  useTexture,
} from '@react-three/drei';
import * as THREE from 'three';

import { bottleSpec } from '../fhProModel.mjs';
import { scrollBus } from './scrollBus.js';

/* ── Geometry (shared with the product-hero bottle) ─────────────────────── */

const BODY_POINTS = [
  [0, bottleSpec.baseY],
  [0.56, bottleSpec.baseY],
  [0.63, -1.30],
  [0.675, -1.20],
  [bottleSpec.bodyRadius, -1.08],
  [bottleSpec.bodyRadius, 0.42],
  [0.672, 0.53],
  [0.635, 0.66],
  [0.575, 0.78],
  [0.515, 0.87],
  [0.475, 0.92],
  [0.465, bottleSpec.neckTop],
  [0, bottleSpec.neckTop],
].map(([x, y]) => new THREE.Vector2(x, y));

function createCurvedLabelGeometry() {
  const segments = 64;
  const positions = [];
  const uvs = [];
  const indices = [];
  const height = bottleSpec.labelTop - bottleSpec.labelBottom;

  for (let i = 0; i <= segments; i += 1) {
    const u = i / segments;
    const angle = (u - 0.5) * bottleSpec.labelArc;
    const x = Math.sin(angle) * bottleSpec.labelRadius;
    const z = Math.cos(angle) * bottleSpec.labelRadius;
    positions.push(x, bottleSpec.labelBottom, z);
    positions.push(x, bottleSpec.labelBottom + height, z);
    uvs.push(u, 0, u, 1);
  }
  for (let i = 0; i < segments; i += 1) {
    const bottom = i * 2;
    const top = bottom + 1;
    indices.push(bottom, bottom + 2, top, bottom + 2, bottom + 3, top);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function Bottle({ sleeveColor = '#8d1748', withPhotoLabel = false, scale = 1 }) {
  const labelGeometry = useMemo(
    () => (withPhotoLabel ? createCurvedLabelGeometry() : null),
    [withPhotoLabel]
  );
  useEffect(() => () => { if (labelGeometry) labelGeometry.dispose(); }, [labelGeometry]);

  const splitY = -0.245;
  const whiteHeight = bottleSpec.labelTop - splitY;
  const berryHeight = splitY - bottleSpec.labelBottom;

  return (
    <group scale={scale}>
      <mesh castShadow>
        <latheGeometry args={[BODY_POINTS, 72]} />
        <meshPhysicalMaterial
          color="#fbfbfa"
          roughness={0.58}
          metalness={0}
          clearcoat={0.08}
          clearcoatRoughness={0.72}
        />
      </mesh>
      {/* cap */}
      <mesh position={[0, 1.19, 0]} castShadow>
        <cylinderGeometry args={[bottleSpec.capRadius, bottleSpec.capRadius, 0.36, 72]} />
        <meshPhysicalMaterial color="#ffffff" roughness={0.42} clearcoat={0.12} />
      </mesh>
      <mesh position={[0, 1.015, 0]}>
        <cylinderGeometry args={[0.495, 0.495, 0.095, 72]} />
        <meshStandardMaterial color="#f7f7f6" roughness={0.46} />
      </mesh>
      {/* label sleeve: white top + tinted bottom */}
      <mesh position={[0, splitY + whiteHeight / 2, 0]}>
        <cylinderGeometry args={[0.683, 0.683, whiteHeight, 72, 1, true]} />
        <meshStandardMaterial color="#ffffff" roughness={0.64} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, bottleSpec.labelBottom + berryHeight / 2, 0]}>
        <cylinderGeometry args={[0.683, 0.683, berryHeight, 72, 1, true]} />
        <meshStandardMaterial color={sleeveColor} roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      {withPhotoLabel && labelGeometry && (
        <Suspense fallback={null}>
          <PhotoLabel geometry={labelGeometry} />
        </Suspense>
      )}
    </group>
  );
}

function PhotoLabel({ geometry }) {
  const texture = useTexture('/assets/fh-pro-women-label.jpg');
  const { gl } = useThree();

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
  }, [gl, texture]);

  return (
    <mesh geometry={geometry} renderOrder={2}>
      <meshBasicMaterial map={texture} toneMapped={false} polygonOffset polygonOffsetFactor={-2} />
    </mesh>
  );
}

/* ── Atmosphere: slow-drifting pollen motes ─────────────────────────────── */

const MOTE_COUNT = 220;
const JOURNEY_DEPTH = 15; // world units the camera descends over the journey

function Motes() {
  const pointsRef = useRef();
  const seeds = useMemo(() => {
    const arr = new Float32Array(MOTE_COUNT * 3);
    for (let i = 0; i < MOTE_COUNT; i += 1) {
      arr[i * 3] = (Math.random() - 0.5) * 14;
      arr[i * 3 + 1] = 3 - Math.random() * (JOURNEY_DEPTH + 8);
      arr[i * 3 + 2] = -1.5 - Math.random() * 7;
    }
    return arr;
  }, []);

  useFrame(({ clock }) => {
    const points = pointsRef.current;
    if (!points) return;
    points.rotation.y = clock.elapsedTime * 0.012;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[seeds, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#c98bab"
        size={0.055}
        sizeAttenuation
        transparent
        opacity={0.5}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* ── Descending gallery of bottles ──────────────────────────────────────── */

const GALLERY = [
  // [x, journey-depth 0..1, z, sleeve, spin, scale, photo]
  // Kept clear of the centered copy: hero bottle right, the rest drift by
  // along the edges as the camera descends.
  { x: 2.15, d: 0.02, z: -1.15, sleeve: '#8d1748', spin: 0.10, scale: 0.92, photo: true },
  { x: -2.4, d: 0.20, z: -2.4, sleeve: '#1e4d92', spin: -0.14, scale: 0.82 },
  { x: 2.5, d: 0.38, z: -3.0, sleeve: '#2f6f5e', spin: 0.12, scale: 0.75 },
  { x: -2.5, d: 0.56, z: -2.2, sleeve: '#5f4a8f', spin: 0.16, scale: 0.85 },
  { x: 2.4, d: 0.74, z: -2.6, sleeve: '#7d2f50', spin: -0.11, scale: 0.8 },
  { x: -2.6, d: 0.92, z: -2.0, sleeve: '#8d1748', spin: 0.13, scale: 0.88 },
];

function SpinningBottle({ conf }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.elapsedTime * conf.spin;
  });
  return (
    <group
      position={[conf.x, -conf.d * JOURNEY_DEPTH, conf.z]}
      ref={ref}
    >
      <Float speed={1.1} rotationIntensity={0.04} floatIntensity={0.25}>
        <Bottle sleeveColor={conf.sleeve} withPhotoLabel={conf.photo} scale={conf.scale} />
      </Float>
    </group>
  );
}

/* ── Camera rig driven by the scroll bus ────────────────────────────────── */

function CameraRig({ reducedMotion }) {
  const mouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (reducedMotion) return undefined;
    const onMove = (e) => {
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [reducedMotion]);

  useFrame(({ camera }, delta) => {
    const ease = 1 - Math.exp(-delta * 5);
    const journey = scrollBus.journey;
    const targetY = -journey * JOURNEY_DEPTH;
    const sway = Math.sin(journey * Math.PI * 2.2) * 0.55;
    const targetX = sway + mouse.current.x * 0.22;

    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, ease);
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, ease);
    camera.position.z = THREE.MathUtils.lerp(
      camera.position.z,
      5.05 + Math.sin(journey * Math.PI) * 0.7,
      ease
    );
    camera.lookAt(0, camera.position.y - 0.35, -1.2);
  });

  return null;
}

function StudioEnvironment() {
  return (
    <Environment resolution={128}>
      <group rotation={[-Math.PI / 3, 0, 0]}>
        <Lightformer intensity={2.7} position={[0, 5, -2]} scale={[2, 6, 1]} />
        <Lightformer intensity={1.1} position={[-4, 1, 2]} scale={[3, 5, 1]} color="#f4dbe5" />
        <Lightformer intensity={0.9} position={[4, 1, 1]} scale={[3, 5, 1]} color="#dcebe8" />
        <Lightformer intensity={0.65} position={[0, -2, 4]} scale={[9, 4, 1]} />
      </group>
    </Environment>
  );
}

function SceneContents({ reducedMotion }) {
  return (
    <>
      <ambientLight intensity={0.72} />
      <directionalLight position={[3.5, 5.5, 3]} intensity={1.6} />
      <directionalLight position={[-3, 2, 2]} intensity={0.38} color="#dcebe8" />

      {GALLERY.map((conf, i) => (
        <SpinningBottle conf={conf} key={i} />
      ))}

      <Motes />
      <CameraRig reducedMotion={reducedMotion} />
      <ContactShadows
        position={[0, bottleSpec.baseY - 0.05, 0]}
        opacity={0.28}
        scale={6}
        blur={2.6}
        far={3.5}
        color="#5d3543"
      />
      <Suspense fallback={null}>
        <StudioEnvironment />
      </Suspense>
    </>
  );
}

/**
 * Fixed full-viewport canvas behind the scrollytelling homepage.
 * Pauses rendering whenever the scrolly root leaves the viewport.
 */
export default function Scene3D({ active = true, reducedMotion = false }) {
  return (
    <div className="scrolly-canvas" aria-hidden="true">
      <Canvas
        dpr={[1, 1.6]}
        frameloop={active ? 'always' : 'never'}
        camera={{ position: [0, 0.08, 5.05], fov: 35 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      >
        <SceneContents reducedMotion={reducedMotion} />
      </Canvas>
    </div>
  );
}
