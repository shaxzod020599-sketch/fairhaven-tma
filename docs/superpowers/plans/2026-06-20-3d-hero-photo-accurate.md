# 3D Hero Photo-Accurate Bottle (v3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the rejected v2 3D hero with a photo-accurate opaque white plastic vitamin bottle modeled from the real Fairhaven product photo (`/tmp/fairhaven-bottle.png`).

**Architecture:** Rewrite `web/src/components/Hero3D.jsx` with a LatheGeometry body profile (parallel walls, tapered neck), a flat short white cap, a central white label sleeve with black "Fairhaven Health / FH PRO®" text on both sides, soft studio lighting, subtle Bloom/Vignette post-processing, and Float + mouse-tilt animation (no auto-rotation). Home.jsx integration and mobile fallback are unchanged from v2.

**Tech Stack:** React Three Fiber 8.18, @react-three/drei 9.122, @react-three/postprocessing 2.19, troika-three-text (via drei `<Text>`).

**Spec:** `docs/superpowers/specs/2026-06-20-3d-hero-photo-accurate-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `web/src/components/Hero3D.jsx` | **Rewrite** | The entire 3D scene — lathe body, flat cap, label sleeve, text, lights, post-processing, interaction. Gate stays in Home.jsx. |
| `web/src/pages/Home.jsx` | No change | v2 integration (lazy import, gate, Suspense fallback) is correct. |
| `web/src/site.css` | No change | `.hero3d-wrap` styles are correct. |

Single file rewrite. No new files.

---

## Task 1: Lathe body geometry + opaque white plastic

**Files:**
- Rewrite: `web/src/components/Hero3D.jsx` (entire file)

- [ ] **Step 1: Replace Hero3D.jsx with the lathe-body skeleton**

Full file content (lathe profile from spec, opaque `meshStandardMaterial`, flat cap, placeholder lights, NO text/label yet — just verify the silhouette renders):

```jsx
import React, { useRef, useState, useEffect, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Float, Text, Environment, Lightformer } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';

// Lathe profile points (x=radius, y=height), bottom → top — photo silhouette.
const BODY_POINTS = [
  [0.55, -1.2], [0.54, -1.1], [0.52, -0.9],
  [0.52, 0.9], [0.50, 1.0], [0.42, 1.18], [0.40, 1.25],
].map(([x, y]) => new THREE.Vector2(x, y));

function BottleBody() {
  return (
    <mesh castShadow>
      <latheGeometry args={[BODY_POINTS, 64]} />
      <meshStandardMaterial color="#FAFAFA" roughness={0.5} metalness={0} />
    </mesh>
  );
}

// Flat short wide cap — seats on the neck at y≈1.34.
function BottleCap() {
  return (
    <group position={[0, 1.34, 0]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.42, 0.42, 0.18, 64]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.35} metalness={0.05} />
      </mesh>
      {/* flat top disc — slightly recessed shade */}
      <mesh position={[0, 0.092, 0]}>
        <cylinderGeometry args={[0.40, 0.40, 0.008, 64]} />
        <meshStandardMaterial color="#F0F0F0" roughness={0.4} />
      </mesh>
    </group>
  );
}

function Scene() {
  const [active, setActive] = useState(true);
  const wrapRef = useRef();
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setActive(e.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={wrapRef} className="hero3d-wrap">
      <Canvas
        dpr={[1, 2]}
        gl={{ powerPreference: 'high-performance', antialias: true, alpha: true }}
        frameloop={active ? 'always' : 'never'}
        camera={{ position: [0, 0.2, 4.6], fov: 36 }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.25} />
          <directionalLight position={[3, 5, 2]} intensity={1.8} />
          <directionalLight position={[-3, 2, 1]} intensity={0.4} color="#cee2de" />
          <Float speed={1.2} rotationIntensity={0.06} floatIntensity={0.1}>
            <BottleBody />
            <BottleCap />
          </Float>
          <ContactShadows position={[0, -1.45, 0]} opacity={0.45} scale={6} blur={2} far={4} color="#5a3a44" />
          <Environment resolution={256}>
            <group rotation={[-Math.PI / 3, 0, 0]}>
              <Lightformer intensity={3.0} position={[0, 5, -2]} scale={[2, 6, 1]} />
              <Lightformer intensity={0.8} position={[-5, 1, 1]} scale={[3, 5, 1]} color="#e9c5d4" />
              <Lightformer intensity={0.8} position={[5, 1, 1]} scale={[3, 5, 1]} color="#cee2de" />
              <Lightformer intensity={0.5} position={[0, -2, 4]} scale={[10, 5, 1]} />
            </group>
          </Environment>
        </Suspense>
      </Canvas>
    </div>
  );
}

export default function Hero3D() {
  return <Scene />;
}
```

- [ ] **Step 2: Build and verify silhouette**

Run: `cd web && npm run build`
Expected: exit 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/Hero3D.jsx
git commit -m "✨ Hero3D v3: lathe body + flat cap (photo-accurate silhouette)"
```

---

## Task 2: Central white label sleeve + black wordmark (both sides)

**Files:**
- Modify: `web/src/components/Hero3D.jsx`

- [ ] **Step 1: Add Label component after BottleCap**

Insert this component (white sleeve at middle ~55% of body, text front + mirrored back):

```jsx
function BottleLabel() {
  // White sleeve — middle band, radius slightly proud of body (0.525 > body 0.52).
  // Spans y ∈ [-0.55, 0.45] = height 1.0, centered at y=-0.05.
  return (
    <group>
      <mesh position={[0, -0.05, 0]}>
        <cylinderGeometry args={[0.525, 0.525, 1.0, 64, 1, true]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.5} side={THREE.DoubleSide} />
      </mesh>

      {/* Thin black rule under the wordmark */}
      <mesh position={[0, -0.22, 0.527]}>
        <boxGeometry args={[0.5, 0.006, 0.001]} />
        <meshBasicMaterial color="#1A1A1A" />
      </mesh>

      {/* Front face text (+Z) */}
      <LabelText />

      {/* Back face text (-Z, mirrored) */}
      <group rotation={[0, Math.PI, 0]}>
        <LabelText />
      </group>
    </group>
  );
}

function LabelText() {
  return (
    <group>
      <Text
        position={[0, 0.18, 0.528]}
        fontSize={0.085}
        color="#1A1A1A"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.12}
      >
        FAIRHAVEN HEALTH
      </Text>
      <Text
        position={[0, -0.02, 0.528]}
        fontSize={0.28}
        color="#1A1A1A"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.02}
        outlineWidth={0.003}
        outlineColor="#1A1A1A"
      >
        FH PRO
      </Text>
      <Text
        position={[0.38, 0.08, 0.528]}
        fontSize={0.045}
        color="#6B6B6B"
        anchorX="center"
        anchorY="middle"
      >
        ®
      </Text>
    </group>
  );
}
```

- [ ] **Step 2: Render `<BottleLabel />` inside the Float group**

In `Scene`, inside `<Float>`, after `<BottleCap />`, add `<BottleLabel />`.

- [ ] **Step 3: Build and verify**

Run: `cd web && npm run build`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/Hero3D.jsx
git commit -m "✨ Hero3D v3: central white label + black FH PRO wordmark (both sides)"
```

---

## Task 3: Mouse tilt + scroll parallax (no auto-rotation)

**Files:**
- Modify: `web/src/components/Hero3D.jsx`

- [ ] **Step 1: Add InteractionController + a group ref**

Add a group wrapping the bottle parts so tilt applies to the whole bottle. Insert the controller:

```jsx
function InteractionController({ groupRef }) {
  const target = useRef({ rotX: 0, rotY: 0, posY: 0 });
  useEffect(() => {
    const onMove = (e) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = (e.clientY / window.innerHeight) * 2 - 1;
      target.current.rotX = -y * 0.10;
      target.current.rotY = x * 0.18;
    };
    const onScroll = () => {
      target.current.posY = window.scrollY * -0.0006;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);
  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const t = target.current;
    // NO accumulated yaw — label always faces camera.
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, t.rotX, 0.06);
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, t.rotY, 0.06);
    g.position.y = THREE.MathUtils.lerp(g.position.y, t.posY, 0.06);
  });
  return null;
}
```

- [ ] **Step 2: Wrap bottle parts in a group + mount controller**

In `Scene`, replace the bare `<Float>...</Float>` with:

```jsx
const bottleGroup = useRef();
// ... inside <Canvas><Suspense>:
<Float speed={1.2} rotationIntensity={0.06} floatIntensity={0.1}>
  <group ref={bottleGroup}>
    <BottleBody />
    <BottleCap />
    <BottleLabel />
  </group>
</Float>
<InteractionController groupRef={bottleGroup} />
```

- [ ] **Step 3: Build and verify**

Run: `cd web && npm run build`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/Hero3D.jsx
git commit -m "✨ Hero3D v3: mouse tilt + scroll parallax (no auto-rotation)"
```

---

## Task 4: Subtle post-processing (Bloom + Vignette)

**Files:**
- Modify: `web/src/components/Hero3D.jsx`

- [ ] **Step 1: Add EffectComposer inside Suspense**

After `<ContactShadows />` and before `<Environment />`, add:

```jsx
<EffectComposer enableNormalPass={false}>
  <Bloom
    intensity={0.3}
    luminanceThreshold={0.85}
    luminanceSmoothing={0.2}
    mipmapBlur
  />
  <Vignette offset={0.3} darkness={0.4} />
</EffectComposer>
```

- [ ] **Step 2: Build and verify chunk size**

Run: `cd web && npm run build`
Expected: exit 0. Hero3D chunk gzip ≤ ~320KB (postprocessing adds ~16KB over v2's 316KB).

- [ ] **Step 3: Commit**

```bash
git add web/src/components/Hero3D.jsx
git commit -m "✨ Hero3D v3: subtle Bloom + Vignette post-processing"
```

---

## Task 5: Render verification + regression check

**Files:** none (verification only)

- [ ] **Step 1: Render-verify all routes with puppeteer**

Run the puppeteer script against `http://localhost:5174/` at desktop viewport (1440x900) — confirm: 3D canvas present, 8 product cards render, no page errors. Then test `/shop`, `/about`, `/contact`, `/faq` — confirm no regression. Then mobile (375px) — confirm no canvas, static `hero-product-card` fallback present, Hero3D chunk NOT requested.

- [ ] **Step 2: Visual screenshot check**

Screenshot the hero region and confirm: tall white opaque bottle, flat white cap, central white label with visible black "FH PRO" text, soft shadow beneath.

- [ ] **Step 3: Commit (if any tweaks made)**

If the screenshot reveals issues (text too small, cap misaligned, label floating off the body), fix and commit. Otherwise skip.

---

## Self-Review (run after writing, before execution)

**Spec coverage:**
- Lathe body → Task 1 ✓
- Flat short cap → Task 1 ✓
- Opaque white plastic materials → Task 1 ✓
- Central white label sleeve → Task 2 ✓
- Black wordmark both sides → Task 2 ✓
- Soft studio lighting → Task 1 ✓
- Contact shadow → Task 1 ✓
- Float (no auto-rotation) → Task 1 + Task 3 ✓
- Mouse tilt + scroll parallax → Task 3 ✓
- Bloom + Vignette (subtle) → Task 4 ✓
- Mobile fallback (unchanged) → no task needed (Home.jsx already correct) ✓
- Performance guards (unchanged) → Task 1 carries them over ✓

**Placeholder scan:** None. Every step has complete code.

**Type consistency:** `BottleBody`, `BottleCap`, `BottleLabel`, `LabelText`, `InteractionController` — names consistent across tasks. `bottleGroup` ref name consistent.

**Gaps:** None.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-20-3d-hero-photo-accurate.md`.** Inline execution (this session) is appropriate — single file, tightly coupled tasks. Proceeding inline.
