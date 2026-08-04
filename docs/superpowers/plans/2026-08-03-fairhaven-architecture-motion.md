# FairHaven Architecture Motion Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and render a deterministic 48-second FairHaven architecture presentation as 1080p H.264 MP4 plus a 1080p poster PNG.

**Architecture:** Keep the video in an isolated `media/fairhaven-architecture/` Remotion project so production services remain untouched. Static architecture data feeds focused React/SVG primitives; one composition selects scene layers from the current frame and ends on a complete system map.

**Tech Stack:** Remotion 4.0.505, React 19.2.8, TypeScript 5, SVG, Node.js 24, Remotion CLI.

## Global Constraints

- Composition ID: `FairHavenArchitecture`.
- Duration: 1440 frames at 30 FPS, 1920×1080.
- Primary copy: Uzbek Latin; technical domains/routes/states remain exact.
- Colors, typography, safe margins, scenes, and timing follow `docs/superpowers/specs/2026-08-03-fairhaven-architecture-motion-design.md`.
- Render must be deterministic: no `Date.now()`, `Math.random()`, external fetch, remote fonts, or network media.
- No credential, IP password, customer data, production order ID, or secret-like placeholder.
- Production application files and dependencies remain unchanged.

---

## File structure

- `media/fairhaven-architecture/package.json`: isolated scripts and pinned runtime dependencies.
- `media/fairhaven-architecture/package-lock.json`: reproducible dependency graph.
- `media/fairhaven-architecture/tsconfig.json`: strict React/Remotion TypeScript configuration.
- `media/fairhaven-architecture/src/index.ts`: Remotion root registration.
- `media/fairhaven-architecture/src/Root.tsx`: composition metadata.
- `media/fairhaven-architecture/src/theme.ts`: visual tokens, timing, and layout constants.
- `media/fairhaven-architecture/src/data.ts`: typed architecture nodes and flow definitions.
- `media/fairhaven-architecture/src/components.tsx`: reusable node, path, title, badge, shield, and formula primitives.
- `media/fairhaven-architecture/src/Architecture.tsx`: seven-scene composition and full-map finale.
- `media/fairhaven-architecture/scripts/validate.mjs`: deterministic contract and forbidden-content checks.
- `output/architecture/FairHaven-Architecture-1080p.mp4`: final presentation video.
- `output/architecture/FairHaven-Architecture-Poster.png`: final full-map still.

---

### Task 1: Isolated Remotion project and contract validator

**Files:**
- Create: `media/fairhaven-architecture/package.json`
- Create: `media/fairhaven-architecture/tsconfig.json`
- Create: `media/fairhaven-architecture/scripts/validate.mjs`
- Create: `media/fairhaven-architecture/src/index.ts`
- Create: `media/fairhaven-architecture/src/Root.tsx`

**Interfaces:**
- Produces: composition ID `FairHavenArchitecture`, metadata `{width: 1920, height: 1080, fps: 30, durationInFrames: 1440}`.
- Consumes: `Architecture` React component exported from `src/Architecture.tsx` in Task 3.

- [ ] **Step 1: Write contract validator before composition exists**

Validator must read source files as text and fail unless composition ID, metadata, seven scene identifiers, two protected public prefixes, blocked private routes, and output scripts are present. It must reject `Date.now`, `Math.random`, `trycloudflare`, `fhm_t_`, `fhm_s_`, and query values resembling real credentials.

- [ ] **Step 2: Run validator and prove red state**

Run: `node media/fairhaven-architecture/scripts/validate.mjs`

Expected: non-zero exit because composition source is absent.

- [ ] **Step 3: Add pinned project configuration and composition registration**

Use dependencies `@remotion/cli`, `remotion`, `react`, and `react-dom`; use `tsx`/strict TypeScript with no emit. Register `FairHavenArchitecture` through `registerRoot()` and `<Composition>`.

- [ ] **Step 4: Install and type-check scaffold**

Run: `npm install`

Run: `npm run typecheck`

Expected: type-check waits only on Task 3 composition implementation, with no production workspace dependency change.

---

### Task 2: Typed architecture model and motion primitives

**Files:**
- Create: `media/fairhaven-architecture/src/theme.ts`
- Create: `media/fairhaven-architecture/src/data.ts`
- Create: `media/fairhaven-architecture/src/components.tsx`

**Interfaces:**
- Produces: `NodeId`, `ArchitectureNode`, `Flow`, `NODES`, `FLOWS`, `SCENES`, `COLORS`, `springIn()`, `fadeWindow()`, `NodeCard`, `FlowLine`, `SceneHeading`, `StatusPill`, `SecurityRing`, and `OperationalPulse`.
- Consumes: Remotion `useCurrentFrame`, `useVideoConfig`, `interpolate`, `spring`, `Easing`, and `<AbsoluteFill>`.

- [ ] **Step 1: Define fixed timing and visual tokens**

Create exact scene starts `[0, 120, 330, 510, 780, 1020, 1230]`, final frame `1439`, safe margin `96`, FairHaven colors from spec, and shared spring/fade helpers with clamped interpolation.

- [ ] **Step 2: Define architecture nodes and flows**

Model customer surfaces, admin, Medicalka, Uzum, Nginx/TLS, Backend, Channel Hub, MongoDB, Billz, and Telegram API. Model separate customer, partner, internal, stock, order, analytics, and notification flows. Exact public allowlist labels: `/medicalka/v1`, `/uzum`; exact blocked labels: `/internal`, `/health`.

- [ ] **Step 3: Build reusable presentational primitives**

Use pure SVG/CSS React. `NodeCard` receives `{node, active, dimmed, delay}`. `FlowLine` receives `{flow, progress, active, packetCount}` and animates dash offset plus deterministic packets. Icons use inline SVG geometry or single-letter technical glyphs; no emoji or remote assets.

- [ ] **Step 4: Type-check primitives**

Run: `npm run typecheck`

Expected: zero TypeScript errors for theme, data, and primitives.

---

### Task 3: Seven-scene presentation composition

**Files:**
- Create: `media/fairhaven-architecture/src/Architecture.tsx`
- Modify: `media/fairhaven-architecture/src/Root.tsx`

**Interfaces:**
- Produces: `Architecture: React.FC`, full-map frame at 1395, final hold through frame 1439.
- Consumes: all typed nodes, flows, tokens, and primitives from Task 2.

- [ ] **Step 1: Implement identity and entry scenes**

Frames 0–329 show title, operational pulse, customer/operator cards, and partner cards. No more than five primary nodes appear before protected edge enters.

- [ ] **Step 2: Implement protected edge and service-core scenes**

Frames 330–779 show `api.fairhaven.uz`, TLS shield, allowlisted paths, blocked private paths, Backend `:3000`, Channel Hub `127.0.0.1:3100`, and loopback-only internal link.

- [ ] **Step 3: Implement lifecycle and stock scenes**

Frames 780–1229 animate `received → reserved → sold`, cancellation branch, duplicate merge, Billz-to-mirror stock pulse, sellable formula, and analytics fan-out. Label production write behavior separately from current write guard.

- [ ] **Step 4: Implement security finale and full-map hold**

Frames 1230–1439 activate six protection rings, ease camera to complete map, and hold final message for at least 75 frames.

- [ ] **Step 5: Run contract and type checks**

Run: `npm run validate && npm run typecheck`

Expected: validator prints all architecture/timing/security contracts passed; TypeScript returns zero errors.

---

### Task 4: Render, inspect, and publish artifacts

**Files:**
- Create: `output/architecture/FairHaven-Architecture-1080p.mp4`
- Create: `output/architecture/FairHaven-Architecture-Poster.png`
- Create: temporary sampled frames outside Git tracking for visual inspection.

**Interfaces:**
- Consumes: composition ID `FairHavenArchitecture` and frame `1395` for poster.
- Produces: H.264 MP4 and PNG artifact linked in final handoff.

- [ ] **Step 1: Render sampled scene frames**

Render frames `60, 210, 405, 645, 900, 1110, 1320, 1395` to temporary PNG files. Inspect every frame for safe margins, overlap, clipping, label contrast, and story continuity.

- [ ] **Step 2: Render poster**

Run: `npm run poster`

Expected: exact 1920×1080 PNG at final-map frame 1395.

- [ ] **Step 3: Render video**

Run: `npm run render`

Expected: 48-second 1920×1080 H.264 MP4 at 30 FPS.

- [ ] **Step 4: Probe media metadata and scan secrets**

Use Remotion/available media probe to verify codec, dimensions, frame rate, and duration. Scan tracked source and outputs for forbidden domains, credential prefixes, private data, `Date.now`, and `Math.random`.

- [ ] **Step 5: Run final repository verification**

Run: `npm run validate && npm run typecheck`

Run: `git diff --check`

Expected: all commands exit zero.

- [ ] **Step 6: Commit and push**

Stage only motion source, plan, package lock, MP4, and poster. Commit message: `feat: add FairHaven architecture motion presentation`. Push current `feat/billz-channel-hub` branch.
