import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  Environment,
  Float,
  Lightformer,
  useTexture,
} from '@react-three/drei';
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
    bottleSpec.capRadius, bottleSpec.capRadius, height, 96, 1, false
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
        <latheGeometry args={[BODY_POINTS, 64]} />
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
        <cylinderGeometry args={[0.495, 0.495, 0.095, 64]} />
        <meshStandardMaterial color="#f7f7f6" roughness={0.42} envMapIntensity={0.8} />
      </mesh>
      <mesh position={[0, 1.376, 0]}>
        <cylinderGeometry args={[0.487, 0.487, 0.018, 64]} />
        <meshStandardMaterial color="#ffffff" roughness={0.44} />
      </mesh>
      {/* full-wrap white sleeve under the printed face */}
      <mesh position={[0, (bottleSpec.labelTop + bottleSpec.labelBottom) / 2, 0]}>
        <cylinderGeometry
          args={[0.683, 0.683, bottleSpec.labelTop - bottleSpec.labelBottom, 64, 1, true]}
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

const MOTE_COUNT = 140;
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
  // Standard showcase composition: upright bottles alternating left/right at
  // a consistent distance, fully in frame. Hero keeps the real photo label.
  { x: 2.15, d: 0.02, z: -1.15, scale: 0.92, phase: 0.0, photo: true },
  { x: -1.85, d: 0.20, z: -2.3, scale: 0.85, phase: 1.3, spec: LABEL_SPECS[0] },
  { x: 1.95, d: 0.38, z: -2.5, scale: 0.82, phase: 2.1, spec: LABEL_SPECS[1] },
  { x: -1.9, d: 0.56, z: -2.3, scale: 0.85, phase: 3.4, spec: LABEL_SPECS[2] },
  { x: 1.9, d: 0.74, z: -2.4, scale: 0.83, phase: 4.2, spec: LABEL_SPECS[3] },
  { x: -1.85, d: 0.92, z: -2.2, scale: 0.86, phase: 5.0, spec: LABEL_SPECS[4] },
];

/**
 * Upright product-shot pose with a slow, barely-there sway — labels stay
 * readable and the motion reads as calm, not busy. Bottles angle gently
 * toward the center copy.
 */
function GalleryBottle({ conf }) {
  const swayRef = useRef();
  const faceCenter = conf.x > 0 ? -0.28 : 0.28;

  useFrame(({ clock }) => {
    const g = swayRef.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.rotation.y = faceCenter + Math.sin(t * 0.25 + conf.phase) * 0.13;
  });

  return (
    <group position={[conf.x, -conf.d * JOURNEY_DEPTH, conf.z]}>
      <Float speed={0.7} rotationIntensity={0.02} floatIntensity={0.14}>
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
    const kJourney = 1 - Math.exp(-delta * 2.4);
    const kMouse = 1 - Math.exp(-delta * 4);
    s.journey += (scrollBus.journey - s.journey) * kJourney;
    s.mx += (mouse.current.x - s.mx) * kMouse;
    s.my += (mouse.current.y - s.my) * kMouse;

    // Straight, calm descent: tiny lateral drift, no roll, fixed gaze line.
    const sway = Math.sin(s.journey * Math.PI * 2) * 0.2;
    camera.position.y = -s.journey * JOURNEY_DEPTH;
    camera.position.x = sway + s.mx * 0.14;
    camera.position.z = 5.05 + Math.sin(s.journey * Math.PI) * 0.25;
    camera.lookAt(0, camera.position.y - 0.25, -1.6);
  });

  return null;
}

function StudioEnvironment() {
  return (
    <Environment resolution={128}>
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
        dpr={[1, 1.5]}
        frameloop={active ? 'always' : 'never'}
        camera={{ position: [0, 0.08, 5.05], fov: 35 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      >
        <SceneContents reducedMotion={reducedMotion} />
      </Canvas>
    </div>
  );
}
