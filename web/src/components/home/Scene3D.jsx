import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, RoundedBox, useTexture } from '@react-three/drei';
import * as THREE from 'three';

import { scrollBus } from './scrollBus.js';

/**
 * Dimensional product vitrines: the shop's own catalog photography
 * (current packaging, bg removed) mounted on glassy 3D plates with layered
 * accents. The whole vitrine banks toward the cursor and pitches with
 * scroll velocity — real depth, zero warped geometry.
 */

const JOURNEY_DEPTH = 15;

/* Cards alternate L,R,L,R,L,R — each vitrine shares its quote's scroll
   moment on the OPPOSITE side (neighbours are a full step away). Layout
   slots are fixed; the images come from the admin-editable content. */
const SLOTS = [
  { x: 1.9, d: 0.02, z: -1.15, h: 2.75, hero: true },
  { x: 2.05, step: 0, z: -1.9, h: 2.35 },
  { x: -2.05, step: 1, z: -1.9, h: 2.3 },
  { x: 2.05, step: 2, z: -2.0, h: 2.3 },
  { x: -2.05, step: 3, z: -1.9, h: 2.35 },
  { x: 2.05, step: 4, z: -2.0, h: 2.3 },
];

const FALLBACK_IMAGES = [
  '/assets/p3d/fhpro-women.png',
  '/assets/p3d/fhpro-men.png',
  '/assets/p3d/prenatal.png',
  '/assets/p3d/fertilaid-men.png',
  '/assets/p3d/lactation.png',
  '/assets/p3d/fertilaid-women.png',
];

/* Boutique arch backdrop for the hero product — tall rounded-top panel in
   plum-wash gradient with a hairline inner frame. Drawn once on canvas. */
function makeArchTexture() {
  const W = 512;
  const H = 760;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const r = W / 2 - 8;

  const arch = () => {
    ctx.beginPath();
    ctx.moveTo(8, H - 8);
    ctx.lineTo(8, r + 8);
    ctx.arc(W / 2, r + 8, r, Math.PI, 0);
    ctx.lineTo(W - 8, H - 8);
    ctx.closePath();
  };

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(246, 231, 238, 0.96)');
  g.addColorStop(0.55, 'rgba(238, 214, 226, 0.94)');
  g.addColorStop(1, 'rgba(224, 190, 207, 0.96)');
  arch();
  ctx.fillStyle = g;
  ctx.fill();

  // hairline inner frame — the "expensive" detail
  ctx.save();
  ctx.translate(0, 14);
  ctx.scale((W - 56) / W, (H - 44) / H);
  ctx.translate(28 * (W / (W - 56)), 0);
  arch();
  ctx.strokeStyle = 'rgba(151, 57, 97, 0.32)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function HeroArch() {
  const ref = useRef();
  const tex = useMemo(makeArchTexture, []);
  useEffect(() => () => tex.dispose(), [tex]);

  useFrame((_, delta) => {
    const m = ref.current;
    if (!m) return;
    // Dissolve with the hero (slightly earlier), drift slower than the bottle.
    const f = 1 - clamp01((scrollBus.hero - 0.08) / 0.3);
    m.material.opacity = f;
    m.visible = f > 0.02;
    m.position.y = 0.1 + scrollBus.hero * 1.2;
  });

  return (
    <mesh ref={ref} position={[2.05, 0.1, -3.2]}>
      <planeGeometry args={[3.6, 5.35]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

/* Soft elliptical drop shadow, drawn once. */
function makeShadowTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 64, 8, 128, 64, 120);
  g.addColorStop(0, 'rgba(66, 34, 48, 0.36)');
  g.addColorStop(0.55, 'rgba(66, 34, 48, 0.15)');
  g.addColorStop(1, 'rgba(66, 34, 48, 0)');
  ctx.scale(1, 0.5);
  ctx.translate(0, 64);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* Shared pointer state for the vitrine banking. */
const pointer = { x: 0, y: 0 };

const clamp01 = (v) => Math.min(1, Math.max(0, v));

function ProductVitrine({ conf, shadowTex }) {
  const yRef = useRef();
  const tiltRef = useRef();
  const fadeRef = useRef(1);
  const texture = useTexture(conf.img);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const aspect = texture.image
    ? texture.image.width / texture.image.height
    : 0.58;
  const w = conf.h * aspect;
  const plateW = Math.max(w * 1.3, conf.h * 0.78);
  const plateH = conf.h * 1.14;
  const side = conf.x >= 0 ? 1 : -1;
  const baseYaw = -side * 0.16;
  const prevJourney = useRef(0);

  useFrame(({ clock }, delta) => {
    // Follow the paired quote's measured position (resize-safe).
    const g = yRef.current;
    if (g && conf.step != null) {
      const center = scrollBus.stepCenters[conf.step];
      if (center != null) g.position.y = -center * JOURNEY_DEPTH;
    }
    // Bank toward the cursor; pitch with scroll velocity — living 3D.
    const t = tiltRef.current;
    if (t) {
      const vel = (scrollBus.journey - prevJourney.current) / Math.max(delta, 0.001);
      prevJourney.current = scrollBus.journey;
      const idle = conf.hero ? Math.sin(clock.elapsedTime * 0.32) * 0.07 : 0;
      const targetY = baseYaw + idle + pointer.x * 0.09;
      const targetX = THREE.MathUtils.clamp(vel * 1.6, -0.12, 0.12) - pointer.y * 0.05;
      const k = 1 - Math.exp(-delta * 4);
      t.rotation.y += (targetY - t.rotation.y) * k;
      t.rotation.x += (targetX - t.rotation.x) * k;
    }
    // Fade discipline: the hero vitrine is fully gone by half the first
    // screen; step vitrines only materialise near their own quote — the
    // windows never intersect, so the top pair can't stack. Dissolves pair
    // with a gentle shrink so hand-offs read as staged, not layered.
    if (g) {
      const camY = -scrollBus.journey * JOURNEY_DEPTH;
      const dy = Math.abs(camY - g.position.y);
      const target = conf.hero
        ? 1 - clamp01((scrollBus.hero - 0.12) / 0.33)
        : clamp01((2.15 - dy) / 0.95);
      fadeRef.current += (target - fadeRef.current) * (1 - Math.exp(-delta * 6));
      const f = fadeRef.current;
      g.visible = f > 0.02;
      g.scale.setScalar(0.9 + 0.1 * f);
      g.traverse((child) => {
        if (child.isMesh && child.material) {
          const base = child.userData.baseOpacity ??
            (child.userData.baseOpacity = child.material.opacity ?? 1);
          child.material.opacity = base * f;
        }
      });
    }
  });

  return (
    <group
      ref={yRef}
      position={[conf.x, -(conf.d ?? 0) * JOURNEY_DEPTH, conf.z]}
    >
      <Float speed={0.8} rotationIntensity={0} floatIntensity={0.15}>
        <group ref={tiltRef} rotation={[0, baseYaw, 0]}>
          {/* glassy backing plate — gives the vitrine its physical body */}
          <RoundedBox
            args={[plateW, plateH, 0.09]}
            radius={0.09}
            smoothness={3}
            position={[0, 0, -0.11]}
          >
            <meshPhysicalMaterial
              color="#ffffff"
              transparent
              opacity={0.42}
              roughness={0.16}
              clearcoat={0.9}
              clearcoatRoughness={0.3}
            />
          </RoundedBox>
          {/* pastel accent disc floating between plate and product */}
          <mesh position={[side * plateW * 0.34, plateH * 0.3, -0.06]}>
            <circleGeometry args={[conf.h * 0.3, 48]} />
            <meshBasicMaterial color="#e9c5d4" transparent opacity={0.85} toneMapped={false} />
          </mesh>
          <mesh position={[-side * plateW * 0.3, -plateH * 0.34, -0.08]}>
            <circleGeometry args={[conf.h * 0.16, 40]} />
            <meshBasicMaterial color="#cee2de" transparent opacity={0.7} toneMapped={false} />
          </mesh>
          {/* the product — real catalog photography */}
          <mesh renderOrder={2}>
            <planeGeometry args={[w, conf.h]} />
            <meshBasicMaterial map={texture} transparent toneMapped={false} depthWrite={false} />
          </mesh>
        </group>
        {/* grounded soft shadow */}
        <mesh position={[0.04, -plateH / 2 - 0.12, -0.02]} renderOrder={0}>
          <planeGeometry args={[plateW * 1.05, plateH * 0.2]} />
          <meshBasicMaterial map={shadowTex} transparent toneMapped={false} depthWrite={false} />
        </mesh>
      </Float>
    </group>
  );
}

/* ── Atmosphere: pollen motes + deep pastel orbs ────────────────────────── */

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

const ORBS = [
  { x: -4.5, dy: 0.15, z: -6, r: 1.4, color: '#e9c5d4', o: 0.35 },
  { x: 4.8, dy: 0.42, z: -7, r: 1.8, color: '#dbcad4', o: 0.3 },
  { x: -4.2, dy: 0.7, z: -6.5, r: 1.3, color: '#cee2de', o: 0.32 },
  { x: 4.4, dy: 0.95, z: -6, r: 1.5, color: '#e9c5d4', o: 0.3 },
];

function DepthOrbs() {
  return ORBS.map((orb, i) => (
    <mesh position={[orb.x, -orb.dy * JOURNEY_DEPTH, orb.z]} key={i}>
      <circleGeometry args={[orb.r, 48]} />
      <meshBasicMaterial color={orb.color} transparent opacity={orb.o} toneMapped={false} />
    </mesh>
  ));
}

/* ── Camera rig — critically damped glide, no roll ──────────────────────── */

function CameraRig({ reducedMotion }) {
  const smooth = useRef({ journey: 0, mx: 0, my: 0 });

  useEffect(() => {
    if (reducedMotion) return undefined;
    const onMove = (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [reducedMotion]);

  useFrame(({ camera }, delta) => {
    const s = smooth.current;
    const kJourney = 1 - Math.exp(-delta * 2.4);
    const kMouse = 1 - Math.exp(-delta * 4);
    s.journey += (scrollBus.journey - s.journey) * kJourney;
    s.mx += (pointer.x - s.mx) * kMouse;
    s.my += (pointer.y - s.my) * kMouse;

    const sway = Math.sin(s.journey * Math.PI * 2) * 0.15;
    camera.position.y = -s.journey * JOURNEY_DEPTH;
    camera.position.x = sway + s.mx * 0.12;
    camera.position.z = 5.05;
    camera.lookAt(0, camera.position.y - 0.2, -1.6);
  });

  return null;
}

function SceneContents({ reducedMotion, products }) {
  const shadowTex = useMemo(makeShadowTexture, []);
  useEffect(() => () => shadowTex.dispose(), [shadowTex]);

  const gallery = SLOTS.map((slot, i) => ({
    ...slot,
    img: products?.[i]?.img || FALLBACK_IMAGES[i],
  }));

  return (
    <>
      <fog attach="fog" args={['#fdfaf7', 7, 13]} />
      {/* just enough light for the glass plates; photos are unlit */}
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 4, 5]} intensity={0.7} />
      <DepthOrbs />
      <HeroArch />
      <Suspense fallback={null}>
        {gallery.map((conf) => (
          <ProductVitrine conf={conf} shadowTex={shadowTex} key={conf.img + (conf.step ?? 'h')} />
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
export default function Scene3D({ active = true, reducedMotion = false, products }) {
  return (
    <div className="scrolly-canvas" aria-hidden="true">
      <Canvas
        dpr={[1, 1.75]}
        frameloop={active ? 'always' : 'never'}
        camera={{ position: [0, 0.08, 5.05], fov: 33 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      >
        <SceneContents reducedMotion={reducedMotion} products={products} />
      </Canvas>
    </div>
  );
}
