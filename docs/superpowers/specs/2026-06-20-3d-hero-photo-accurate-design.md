# 3D Hero Redesign — Photo-Accurate Bottle (v3)

**Date:** 2026-06-20
**Status:** Approved (brainstorming)
**Reference:** `/tmp/fairhaven-bottle.png` (real Fairhaven product photo supplied by user)
**Supersedes:** `2026-06-19-3d-hero-design.md` (v2 — wrong material/shape)

## Why redesign

Prior 3D hero (v2) was rejected: "umuman yaxshi emas" — bottle shape wrong, label wrong, glass material wrong, lighting flat. Root cause: modeled from a *description*, not the actual product. User supplied a real photo (`76.avif` → converted to PNG) of a Fairhaven bottle. This spec models **directly from that photo**.

## Reference photo analysis

The real Fairhaven bottle in the photo:
- **Shape:** tall slim cylinder, ~3:1 height-to-width ratio. Straight walls, no bulbous shoulder. Slight taper only at the very top where the cap seats.
- **Cap:** **LOW and FLAT** — not tall. A short, wide disc-cap (~18% of total height) sitting flush on the body. White.
- **Body:** opaque matte white plastic (HDPE). Solid — no see-through, no capsules visible inside.
- **Label:** **central rectangle** — does NOT wrap the full body height. Occupies roughly the middle 55% vertically. White background.
- **Text on label:** large black **"FH PRO"** wordmark centered, smaller **"Fairhaven Health"** above it. Black, high-contrast.
- **Accent:** thin dark rule line under the wordmark.
- **Lighting:** soft, even studio — no harsh rim, no dramatic contrast. Gentle gradient top-to-bottom.

## Decision

**Photo-accurate model.** Opaque matte-white plastic body, flat short white cap, central white label with black "Fairhaven Health / FH PRO" text. Soft studio lighting. No auto-rotation (text stays readable — matches the static product-photo aesthetic). Gentle Float (breathing) + mouse tilt for life.

## Stack

Unchanged: React Three Fiber + drei + @react-three/postprocessing (already installed, fiber-8 compatible versions).

## Geometry — photo-accurate

### Body (LatheGeometry from a profile)
Replace the plain cylinder with a **lathe profile** that matches the real silhouette:
```
points (x = radius, y = height), bottom → top:
(0.55, -1.2)   base (slightly wider for stability)
(0.54, -1.1)   base inward bevel
(0.52, -0.9)   straight wall begins
(0.52, 0.9)    straight wall (parallel sides — the long middle)
(0.50, 1.0)    gentle inward taper near top
(0.42, 1.18)   neck transition (narrower)
(0.40, 1.25)   neck (where cap seats)
```
Lathe revolves these around Y → a bottle silhouette with parallel mid-walls and a tapered neck. This is the classic supplement-bottle profile from the photo — far better than the v2 sphere-shoulder.

### Cap (flat, short, wide)
- `CylinderGeometry(rTop=0.40, rBottom=0.42, height=0.18)` — low disc, wider at base.
- Position: y ≈ 1.34 (seats on the neck).
- Separate thin top disc for the flat cap face.
- Material: white plastic, `roughness=0.35` (slightly glossier than body, as real caps are).
- **No torus rim** (v2's rim was a fabrication; photo shows a clean flush cap).

### Label (central rectangle, white)
- Vertical band at `y ∈ [-0.55, 0.45]` (middle ~55% of body), radius slightly proud of body wall (0.525).
- `cylinderGeometry(r=0.525, height=1.0, openEnded=true)` — a thin white sleeve.
- Material: `meshStandardMaterial color="#FFFFFF" roughness=0.5`.

### Label text (black, both sides)
Front (+Z) and back (-Z, mirrored via `<group rotation={[0, Math.PI, 0]}>`):
- "Fairhaven Health" — top of label, small, `fontSize=0.09`, black `#1A1A1A`, letter-spacing 0.12.
- "FH PRO" — center, large, `fontSize=0.30`, black. Visual weight comes from the large size + tight letter-spacing (0.02); troika `<Text>` does not load a bold font file, so we rely on size + an optional thin outline (`outlineWidth={0.003} outlineColor="#1A1A1A"`) to make the glyphs read heavier.
- "®" — small superscript next to FH PRO, `fontSize=0.05`, gray `#6B6B6B`.
- Thin black rule under wordmark: `<mesh>` thin box, color `#1A1A1A`.

## Materials (all opaque — no transmission)

| Part | Type | Color | Roughness | Metalness |
|---|---|---|---|---|
| Body | meshStandardMaterial | `#FAFAFA` warm-white | 0.5 | 0 |
| Cap | meshStandardMaterial | `#FFFFFF` | 0.35 | 0.05 |
| Cap top disc | meshStandardMaterial | `#F0F0F0` | 0.4 | 0 |
| Label sleeve | meshStandardMaterial | `#FFFFFF` | 0.5 | 0 |
| Text | troika `<Text>` | `#1A1A1A` black | — | — |
| Rule line | meshBasicMaterial | `#1A1A1A` | — | — |

**No transmission, no transparency, no opacity anywhere.** This is the fix for v2's hazy ghost look.

## Lighting (soft studio, matches photo)

- `ambientLight intensity={0.25}` — gentle fill.
- Key `directionalLight position={[3, 5, 2]} intensity={1.8}` — main light, upper-right.
- Fill `directionalLight position={[-3, 2, 1]} intensity={0.4} color="#cee2de"` — cool rim from left for subtle separation.
- `Environment` inline Lightformers: one bright strip (intensity 3.0) for edge reflection, two soft side cards (plum/mint tint, intensity 0.8).

This is softer than v2 (which had 2.2 key + flat 0.18 ambient). Photo shows even, gentle lighting — no harsh shadows.

## Post-processing (subtle — not the v2 over-bloom)

- `Bloom intensity={0.3} luminanceThreshold={0.85} luminanceSmoothing={0.2} mipmapBlur` — only catches the brightest specular peaks, very gentle.
- `Vignette offset={0.3} darkness={0.4}` — mild, for focus. Less darkness than v2 (0.55).
- Keep R3F default tone mapping (ACESFilmic) + sRGB — do NOT override.

## Animation — NO auto-rotation (key change from v2)

The photo is static; the bottle should feel alive but always show the label:
- **Float** (drei): `speed={1.2} rotationIntensity={0.06} floatIntensity={0.1}` — very gentle breathing/sway. Bottle never turns away from camera.
- **Mouse tilt:** eased lerp, `rotation.x ∈ ±0.10`, `rotation.y ∈ ±0.18`. No accumulated yaw.
- **Scroll parallax:** `position.y` shifts `scrollY * -0.0006`, eased.
- **No `yawRef` accumulation** (v2's auto-rotate removed entirely).

Label text therefore always faces the user — readable at all times, like a product photo.

## Mobile fallback (unchanged from v2)

- `matchMedia('(min-width:1024px) and (pointer:fine)')` + WebGL check in `Home.jsx`.
- Mobile/no-WebGL → static SVG `HeroFallback` (no Hero3D chunk loaded — verified in v2 audit).

## Performance guards (unchanged)

- `dpr={[1,2]}`, `frameloop` pause on `IntersectionObserver`, `powerPreference: high-performance`, `alpha:true`, `antialias:true`.
- Hero3D stays a lazy-loaded separate chunk (code-split).

## Out of scope

- No GLB import (procedural lathe geometry).
- No transparent glass, no inner capsules.
- No auto-rotation.
- 3D stays hero-only; no changes to other pages.

## Acceptance criteria

1. Desktop hero shows a tall white opaque plastic bottle, ~3:1 ratio, flat short white cap, matching the reference photo silhouette.
2. Central white label with black "Fairhaven Health / FH PRO®" text, readable from both front and back.
3. Bottle does NOT auto-rotate — label always faces camera.
4. Gentle Float + mouse tilt only; scroll parallax.
5. Mobile shows static SVG fallback; Hero3D chunk not loaded.
6. `npm run build` passes; Hero3D chunk ≤ v2 size (~316KB gzip).
7. No regression on other routes.

## Comparison vs v2 (what's different)

| Aspect | v2 (rejected) | v3 (this spec) |
|---|---|---|
| Source | description | real photo |
| Body shape | cylinder + sphere shoulder + neck | lathe profile (parallel walls, tapered top) |
| Cap | tall plum cylinder + torus rim | short flat wide white disc |
| Label | full-height plum wrap | central ~55% white rectangle |
| Text color | white on plum | black on white |
| Material | opaque warm-white `#F4ECEA` | opaque white `#FAFAFA` |
| Rotation | auto-yaw 0.12 | none (Float + tilt only) |
| Bloom | 0.45 | 0.3 (subtler) |
| Vignette | 0.55 | 0.4 (lighter) |
