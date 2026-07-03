import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, useTexture } from '@react-three/drei';
import * as THREE from 'three';

import { scrollBus } from './scrollBus.js';

/**
 * The descent gallery is built from the OFFICIAL Fairhaven product
 * photography (bg removed) — pixel-identical to fairhavenhealth.com.
 * Each product is an alpha-keyed billboard with a soft shadow; the camera
 * glides down past them as the testimonials cascade.
 */

const JOURNEY_DEPTH = 15;

/* Each product is paired with ONE testimonial step: same scroll moment,
   OPPOSITE side of that card (cards alternate L,R,L,R,L,R). Neighbouring
   products are a full step (~100vh) away — offscreen while a quote reads.
   `step` aligns via scrollBus.stepCenters (measured from the real DOM). */
const PRODUCTS = [
  { img: '/assets/p3d/fhpro-women.png', x: 1.9, d: 0.02, z: -1.15, h: 2.9 }, // hero
  { img: '/assets/p3d/fertilaid-men.png', x: 2.0, step: 0, z: -1.9, h: 2.45 }, // card L → R
  { img: '/assets/p3d/peapod.png', x: -2.0, step: 1, z: -1.9, h: 2.5 }, // card R → L
  { img: '/assets/p3d/lactation.png', x: 2.0, step: 2, z: -2.0, h: 2.4 }, // card L → R
  { img: '/assets/p3d/menopause.png', x: -2.0, step: 3, z: -1.9, h: 2.45 }, // card R → L
  { img: '/assets/p3d/ovaboost.png', x: 2.0, step: 4, z: -2.0, h: 2.4 }, // card L → R
];

/* Soft elliptical drop shadow, drawn once. */
function makeShadowTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 64, 8, 128, 64, 120);
  g.addColorStop(0, 'rgba(66, 34, 48, 0.38)');
  g.addColorStop(0.55, 'rgba(66, 34, 48, 0.16)');
  g.addColorStop(1, 'rgba(66, 34, 48, 0)');
  ctx.scale(1, 0.5);
  ctx.translate(0, 64);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function ProductBillboard({ conf, shadowTex }) {
  const groupRef = useRef();
  const texture = useTexture(conf.img);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const aspect = texture.image
    ? texture.image.width / texture.image.height
    : 0.55;
  const w = conf.h * aspect;

  // Step-paired products track their quote's measured position (resize-safe).
  useFrame(() => {
    const g = groupRef.current;
    if (!g || conf.step == null) return;
    const center = scrollBus.stepCenters[conf.step];
    if (center != null) g.position.y = -center * JOURNEY_DEPTH;
  });

  return (
    <group
      ref={groupRef}
      position={[conf.x, -(conf.d ?? 0) * JOURNEY_DEPTH, conf.z]}
    >
      <Float speed={0.8} rotationIntensity={0} floatIntensity={0.16}>
        <mesh renderOrder={1}>
          <planeGeometry args={[w, conf.h]} />
          <meshBasicMaterial
            map={texture}
            transparent
            toneMapped={false}
            depthWrite={false}
          />
        </mesh>
        {/* grounded soft shadow */}
        <mesh position={[0.05, -conf.h / 2 - 0.06, -0.01]} renderOrder={0}>
          <planeGeometry args={[w * 1.15, conf.h * 0.22]} />
          <meshBasicMaterial
            map={shadowTex}
            transparent
            toneMapped={false}
            depthWrite={false}
          />
        </mesh>
      </Float>
    </group>
  );
}

/* ── Atmosphere: slow-drifting pollen motes ─────────────────────────────── */

const MOTE_COUNT = 130;

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
        opacity={0.4}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* ── Camera rig — critically damped glide, no roll ──────────────────────── */

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
    const kJourney = 1 - Math.exp(-delta * 2.4);
    const kMouse = 1 - Math.exp(-delta * 4);
    s.journey += (scrollBus.journey - s.journey) * kJourney;
    s.mx += (mouse.current.x - s.mx) * kMouse;
    s.my += (mouse.current.y - s.my) * kMouse;

    const sway = Math.sin(s.journey * Math.PI * 2) * 0.16;
    camera.position.y = -s.journey * JOURNEY_DEPTH;
    camera.position.x = sway + s.mx * 0.12;
    camera.position.z = 5.05;
    camera.lookAt(0, camera.position.y - 0.2, -1.6);
  });

  return null;
}

function SceneContents({ reducedMotion }) {
  const shadowTex = useMemo(makeShadowTexture, []);
  useEffect(() => () => shadowTex.dispose(), [shadowTex]);

  return (
    <>
      {/* Distant products melt into the cream atmosphere. */}
      <fog attach="fog" args={['#fdfaf7', 7, 13]} />
      <Suspense fallback={null}>
        {PRODUCTS.map((conf, i) => (
          <ProductBillboard conf={conf} shadowTex={shadowTex} key={i} />
        ))}
      </Suspense>
      <Motes />
      <CameraRig reducedMotion={reducedMotion} />
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
        dpr={[1, 1.75]}
        frameloop={active ? 'always' : 'never'}
        camera={{ position: [0, 0.08, 5.05], fov: 32 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      >
        <SceneContents reducedMotion={reducedMotion} />
      </Canvas>
    </div>
  );
}
