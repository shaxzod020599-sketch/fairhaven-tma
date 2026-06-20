# 3D Hero Design — Fairhaven Health Web

**Date:** 2026-06-19
**Status:** Approved
**Scope:** Procedural 3D vitamin bottle in homepage hero, desktop-only WebGL with mobile static fallback.

## Context

The standalone `web/` site (separate from the Telegram mini-app `frontend/`) currently ships a flat 2D homepage with a CSS-bottle hero card. Goal: upgrade the hero to an interactive procedural 3D vitamin bottle to give the site a premium feel that distinguishes it from the reference (fairhavenhealth.com, which is a flat Shopify store). The rest of the site stays 2D.

## Decision

**Stack:** React Three Fiber (`@react-three/fiber`) + drei helpers (`@react-three/drei`), which are React-idiomatic wrappers over Three.js. Chosen over vanilla Three.js for declarative JSX scene composition and drei's ready-made `Float`, `Environment`, `ContactShadows` — eliminates ~200 lines of boilerplate.

**Scope boundary:** 3D lives ONLY in the hero of `Home.jsx`. Product cards, PDP, shop, and all other pages remain 2D. This keeps bundle impact bounded (~60KB gzip for three ecosystem) and mobile performance safe.

## Architecture

### New dependency
```
three
@react-three/fiber
@react-three/drei
```
Added to `web/package.json`. All three are dev + runtime peer — no SSR concern (client-only Vite SPA).

### New component: `web/src/components/Hero3D.jsx`
Self-contained R3F scene. Exports default `Hero3D`. Internal structure:

```
<Canvas>                      // dpr={[1,2]}, gl={{ antialias, powerPreference }}
  <Suspense fallback={null}>
    <ambientLight intensity={0.6} />
    <directionalLight position={[3,5,2]} intensity={1.2} castShadow />
    <Environment preset="studio" />            // drei — soft studio lighting
    <Float speed={1.5} rotationIntensity={0.3} floatIntensity={0.4}>
      <BottleGroup />                          // bottle + capsules + label
    </Float>
    <ContactShadows position={[0,-1.4,0]} opacity={0.4} blur={2.5} />  // drei
    <CameraController />                        // mouse/scroll/gyro logic
    <VisibilityGate />                          // frameloop pause offscreen
  </Suspense>
</Canvas>
```

### Procedural bottle geometry (`BottleGroup`)
Assembled from primitive geometries — no external GLB asset (keeps it asset-free and fully procedural):

1. **Body** — `CylinderGeometry(rTop=0.55, rBottom=0.6, h=1.8, segments=64)` with slight taper. `MeshPhysicalMaterial`: transmission 0.9, roughness 0.08, thickness 0.5, ior 1.5, color `#fdfaf7` — realistic cream glass.
2. **Shoulder** — `SphereGeometry` top hemisphere, scaled, fused to body.
3. **Cap** — `CylinderGeometry(r=0.3, h=0.35)` at top. `MeshStandardMaterial` color `#7d2f50` (plum deep), roughness 0.4 — matte cap.
4. **Label band** — `CylinderGeometry` slightly larger radius wrapping the body mid-section. `MeshStandardMaterial` color `#973961` (plum) with `FH PRO` text via `<Text>` from drei, color `#ffffff`.
5. **Capsules (inside)** — 3-5 `CapsuleGeometry` instances, colored pastels (pink `#e9c5d4`, mint `#cee2de`, blue `#d6e4f2`), floating in suspension. Use `MeshStandardMaterial` with slight transmission to read as soft gel pills.

All grouped in a `<group ref={bottleRef}>` for unified rotation/float.

### Interactivity
Implemented as a custom hook `useBottleInteraction` returning a ref + useFrame callback:

1. **Auto-rotate** — `bottleRef.rotation.y += 0.005` every frame (constant slow spin).
2. **Hover tilt** — `onPointerMove` on canvas → normalized mouse XY (−1..1) → lerp `bottleRef.rotation.x` toward mouseY * 0.15 and add `mouseX * 0.2` to Y rotation target. Eased with `THREE.MathUtils.lerp(current, target, 0.08)`.
3. **Scroll parallax** — window scroll listener → `bottleRef.position.y` shifts by `scrollY * -0.001`, and `rotation.z` tilts slightly. Detached on unmount.
4. **Gyroscope (desktop touch devices only)** — `DeviceOrientationEvent` → gamma/beta → bottle tilt. Only relevant for desktop touchscreens with orientation sensors (rare). Mobile is hard-fallback to static (no WebGL), so gyro never runs there. Omit entirely in v1 if it adds complexity — nice-to-have, not core.

### Performance guards
- **DPR cap:** `<Canvas dpr={[1, 2]}>` — never renders above 2x pixel ratio (retina-safe, no 4K waste).
- **Power mode:** `gl={{ powerPreference: 'high-performance', antialias: true }}`.
- **Visibility pause:** `IntersectionObserver` on the canvas wrapper — when hero leaves viewport, set `<Canvas frameloop="never">`; resume on re-entry. Stops the render loop when user scrolls to products/footer.
- **No shadow maps on the bottle** — `ContactShadows` is a baked plane shadow, cheaper than real-time shadow maps.

### Mobile fallback
Detection in `Hero3D.jsx` wrapper:
```jsx
const isDesktop = window.matchMedia('(min-width: 1024px) and (pointer: fine)').matches;
```
If `!isDesktop` → render static SVG (existing `BottleIcon` scaled large in a cream card with soft shadow). No WebGL context created on mobile — battery and thermal protected. Re-evaluates on resize.

### Loading state
`<Suspense fallback={<StaticBottle />}>` — drei `<Text>` and `<Environment>` suspend. While loading, show the static SVG bottle (same as mobile fallback). Seamless — user sees the bottle immediately, then it "comes alive" as 3D loads.

## Integration

### `web/src/pages/Home.jsx` change
Replace the existing `.hero-visual` block:
```jsx
// Before
<div className="hero-visual">
  <div className="hero-glow" />
  <div className="hero-product-card">...</div>
</div>

// After
<div className="hero-visual">
  <div className="hero-glow" />
  <Hero3D />
</div>
```
No other JSX changes. `hero-glow` radial gradient stays behind the 3D canvas (canvas is transparent).

### CSS (`web/src/site.css`)
- `.hero-visual` keeps `position: relative; height: 460px` — canvas fills it.
- `.hero-visual canvas` — `width: 100%; height: 100%; display: block;` transparent background.
- `.hero-product-card` (static fallback) — existing styles reused for mobile.
- Desktop: `.hero-visual` cursor `grab` to signal interactivity.

## Materials & colors (final values)

| Element | Material | Color | Notes |
|---|---|---|---|
| Glass body | MeshPhysicalMaterial | `#fdfaf7` cream | transmission 0.9, roughness 0.08, ior 1.5 |
| Cap | MeshStandardMaterial | `#7d2f50` plum deep | matte, roughness 0.4 |
| Label band | MeshStandardMaterial | `#973961` plum | emissive 0.1 for slight glow |
| Capsules | MeshStandardMaterial | pastels (pink/mint/blue) | roughness 0.3, slight metalness 0.1 |
| Text "FH PRO" | drei `<Text>` | `#ffffff` | attached to label band |

## Out of scope (explicit)

- No 3D on product cards, PDP, shop, or any page other than Home hero.
- No GLB model loading — fully procedural (asset-free).
- No 3D on mobile (static SVG fallback).
- No physics simulation on capsules — they `Float` with drei, not rigid-body.
- No backend changes — purely frontend visual.

## Risk & mitigation

| Risk | Mitigation |
|---|---|
| Bundle bloat (~180KB three + fiber + drei) | Code-split via dynamic import of `Hero3D` in Home.jsx; static SVG shows instantly while chunk loads |
| WebGL not supported (old browsers) | try/catch around Canvas mount; static SVG fallback on error |
| iOS Safari gyro permission UX | Desktop-only 3D means gyro rarely triggers; if it does, gate behind a tap "Enable motion" affordance |
| Mobile battery drain | Hard fallback to static — no WebGL context created on mobile at all |

## Success criteria

1. Desktop homepage hero shows a slowly rotating procedural vitamin bottle with glass material.
2. Mouse hover tilts the bottle smoothly (eased).
3. Scrolling down nudges the bottle with parallax.
4. Mobile shows static SVG bottle (no WebGL).
5. Hero canvas pauses when scrolled out of view.
6. `npm run build` passes; bundle grows by <70KB gzip.
7. No regression on other routes (render verify all 7 routes still OK).
