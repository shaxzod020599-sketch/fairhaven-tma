import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  Environment,
  Float,
  Lightformer,
  useTexture,
} from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';

import { bottleSpec } from '../fhProModel.mjs';
import { scrollBus } from './scrollBus.js';
import { makeLabelTexture, LABEL_SPECS } from './bottleLabels.js';

/* ── Geometry (photo-accurate, shared with the product-hero bottle) ─────── */

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

function createRibbedCapGeometry() {
  const height = 0.36;
  const geometry = new THREE.CylinderGeometry(
    bottleSpec.capRadius, bottleSpec.capRadius, height, 192, 1, false
  );
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const angle = Math.atan2(z, x);
    const ridge = 1 + 0.014 * (0.5 + 0.5 * Math.cos(angle * 48));
    positions.setX(i, x * ridge);
    positions.setZ(i, z * ridge);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/* ── Bottle: body + ribbed cap + white sleeve + printed label ───────────── */

function BottleShell() {
  const capGeometry = useMemo(createRibbedCapGeometry, []);
  useEffect(() => () => capGeometry.dispose(), [capGeometry]);

  return (
    <>
      {/* HDPE body — satin plastic with a soft clearcoat so the studio
          softboxes draw long vertical highlights down the flanks. */}
      <mesh castShadow>
        <latheGeometry args={[BODY_POINTS, 96]} />
        <meshPhysicalMaterial
          color="#fbfbfa"
          roughness={0.4}
          metalness={0}
          clearcoat={0.35}
          clearcoatRoughness={0.45}
          sheen={0.25}
          sheenColor="#ffffff"
          envMapIntensity={0.95}
        />
      </mesh>
      <mesh position={[0, 1.19, 0]} geometry={capGeometry} castShadow>
        <meshPhysicalMaterial
          color="#ffffff"
          roughness={0.38}
          clearcoat={0.2}
          clearcoatRoughness={0.5}
          envMapIntensity={0.9}
        />
      </mesh>
      <mesh position={[0, 1.015, 0]}>
        <cylinderGeometry args={[0.495, 0.495, 0.095, 96]} />
        <meshStandardMaterial color="#f7f7f6" roughness={0.42} envMapIntensity={0.8} />
      </mesh>
      <mesh position={[0, 1.376, 0]}>
        <cylinderGeometry args={[0.487, 0.487, 0.018, 96]} />
        <meshStandardMaterial color="#ffffff" roughness={0.44} />
      </mesh>
      {/* full-wrap white sleeve under the printed face */}
      <mesh position={[0, (bottleSpec.labelTop + bottleSpec.labelBottom) / 2, 0]}>
        <cylinderGeometry
          args={[0.683, 0.683, bottleSpec.labelTop - bottleSpec.labelBottom, 96, 1, true]}
        />
        <meshStandardMaterial
          color="#ffffff"
          roughness={0.5}
          side={THREE.DoubleSide}
          envMapIntensity={0.7}
        />
      </mesh>
    </>
  );
}

function PrintedLabel({ spec }) {
  const geometry = useMemo(createCurvedLabelGeometry, []);
  const texture = useMemo(() => makeLabelTexture(spec), [spec]);
  useEffect(() => () => {
    geometry.dispose();
    texture.dispose();
  }, [geometry, texture]);

  return (
    <mesh geometry={geometry} renderOrder={2}>
      {/* Lit paper — the curved face shades around the cylinder instead of
          reading as a flat unlit sticker. */}
      <meshStandardMaterial
        map={texture}
        roughness={0.42}
        envMapIntensity={0.55}
        polygonOffset
        polygonOffsetFactor={-2}
      />
    </mesh>
  );
}

function PhotoLabel() {
  const texture = useTexture('/assets/fh-pro-women-label.jpg');
  const geometry = useMemo(createCurvedLabelGeometry, []);
  const { gl } = useThree();

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
  }, [gl, texture]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} renderOrder={2}>
      <meshStandardMaterial
        map={texture}
        roughness={0.42}
        envMapIntensity={0.55}
        polygonOffset
        polygonOffsetFactor={-2}
      />
    </mesh>
  );
}

/* ── Atmosphere: slow-drifting pollen motes ─────────────────────────────── */

const MOTE_COUNT = 200;
const JOURNEY_DEPTH = 15;

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
    if (pointsRef.current) pointsRef.current.rotation.y = clock.elapsedTime * 0.01;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[seeds, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#c98bab"
        size={0.05}
        sizeAttenuation
        transparent
        opacity={0.45}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* ── Descending gallery ─────────────────────────────────────────────────── */

const GALLERY = [
  // Hero bottle keeps the real photo label; the rest carry printed labels.
  { x: 2.15, d: 0.02, z: -1.15, scale: 0.92, tiltZ: -0.05, phase: 0.0, photo: true },
  { x: -2.4, d: 0.20, z: -2.4, scale: 0.82, tiltZ: 0.07, phase: 1.3, spec: LABEL_SPECS[0] },
  { x: 2.5, d: 0.38, z: -3.0, scale: 0.75, tiltZ: -0.06, phase: 2.1, spec: LABEL_SPECS[1] },
  { x: -2.5, d: 0.56, z: -2.2, scale: 0.85, tiltZ: 0.05, phase: 3.4, spec: LABEL_SPECS[2] },
  { x: 2.4, d: 0.74, z: -2.6, scale: 0.8, tiltZ: -0.07, phase: 4.2, spec: LABEL_SPECS[3] },
  { x: -2.6, d: 0.92, z: -2.0, scale: 0.88, tiltZ: 0.06, phase: 5.0, spec: LABEL_SPECS[4] },
];

/**
 * Gentle sway instead of a full spin — the label always stays readable.
 * Bottles on the left face slightly right (toward center) and vice versa.
 */
function GalleryBottle({ conf }) {
  const swayRef = useRef();
  const faceCenter = conf.x > 0 ? -0.35 : 0.35;

  useFrame(({ clock }) => {
    const g = swayRef.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.rotation.y = faceCenter + Math.sin(t * 0.35 + conf.phase) * 0.22;
    g.rotation.x = Math.sin(t * 0.28 + conf.phase * 1.7) * 0.03;
  });

  return (
    <group position={[conf.x, -conf.d * JOURNEY_DEPTH, conf.z]} rotation={[0, 0, conf.tiltZ]}>
      <Float speed={0.9} rotationIntensity={0.03} floatIntensity={0.22}>
        <group ref={swayRef} scale={conf.scale}>
          <BottleShell />
          {conf.photo ? (
            <Suspense fallback={null}>
              <PhotoLabel />
            </Suspense>
          ) : (
            <PrintedLabel spec={conf.spec} />
          )}
        </group>
      </Float>
    </group>
  );
}

/* ── Camera rig — critically damped, no stepping ────────────────────────── */

function CameraRig({ reducedMotion }) {
  const mouse = useRef({ x: 0, y: 0 });
  const smooth = useRef({ journey: 0, mx: 0, my: 0 });

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
    const s = smooth.current;
    // Exponential smoothing (frame-rate independent). The scroll bus value
    // is itself eased by the DOM driver, so the camera glides butter-smooth.
    const kJourney = 1 - Math.exp(-delta * 3.2);
    const kMouse = 1 - Math.exp(-delta * 4.5);
    s.journey += (scrollBus.journey - s.journey) * kJourney;
    s.mx += (mouse.current.x - s.mx) * kMouse;
    s.my += (mouse.current.y - s.my) * kMouse;

    const sway = Math.sin(s.journey * Math.PI * 2.2) * 0.42;
    camera.position.y = -s.journey * JOURNEY_DEPTH;
    camera.position.x = sway + s.mx * 0.18;
    camera.position.z = 5.05 + Math.sin(s.journey * Math.PI) * 0.55;
    camera.rotation.z = Math.sin(s.journey * Math.PI * 2) * 0.012;
    camera.lookAt(0, camera.position.y - 0.3, -1.4);
  });

  return null;
}

function StudioEnvironment() {
  return (
    <Environment resolution={256}>
      {/* Product-shot studio: overhead softbox, two tall vertical strips for
          flank highlights, warm bounce floor. */}
      <Lightformer intensity={3.2} position={[0, 5, -2]} rotation={[-Math.PI / 3, 0, 0]} scale={[2.5, 7, 1]} />
      <Lightformer intensity={1.6} position={[-5, 0.5, 1.5]} rotation={[0, Math.PI / 2.6, 0]} scale={[1.2, 8, 1]} />
      <Lightformer intensity={1.4} position={[5, 0.5, 1]} rotation={[0, -Math.PI / 2.6, 0]} scale={[1.2, 8, 1]} color="#fdf0f5" />
      <Lightformer intensity={0.7} position={[0, -3, 4]} rotation={[Math.PI / 3, 0, 0]} scale={[10, 4, 1]} color="#f7ece5" />
      <Lightformer intensity={0.5} position={[0, 1, 6]} scale={[9, 5, 1]} />
    </Environment>
  );
}

function SceneContents({ reducedMotion }) {
  return (
    <>
      {/* Cream fog — distant bottles melt into the atmosphere. */}
      <fog attach="fog" args={['#fdfaf7', 6.5, 13.5]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[3.5, 5.5, 3]} intensity={1.9} />
      <directionalLight position={[-4, 3, -2]} intensity={0.85} color="#ffffff" />
      <directionalLight position={[-3, 2, 2]} intensity={0.3} color="#dcebe8" />

      {GALLERY.map((conf, i) => (
        <GalleryBottle conf={conf} key={i} />
      ))}

      <Motes />
      <CameraRig reducedMotion={reducedMotion} />
      <Suspense fallback={null}>
        <StudioEnvironment />
      </Suspense>

      {/* Subtle studio glow + edge falloff — lifts the "flat render" feel. */}
      <EffectComposer enableNormalPass={false}>
        <Bloom intensity={0.22} luminanceThreshold={0.9} luminanceSmoothing={0.25} mipmapBlur />
        <Vignette offset={0.28} darkness={0.26} />
      </EffectComposer>
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
        dpr={[1, 2]}
        frameloop={active ? 'always' : 'never'}
        camera={{ position: [0, 0.08, 5.05], fov: 35 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      >
        <SceneContents reducedMotion={reducedMotion} />
      </Canvas>
    </div>
  );
}
