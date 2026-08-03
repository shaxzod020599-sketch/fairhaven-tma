# FairHaven Architecture Motion Presentation Design

Date: 2026-08-03

## Decision

Create one silent, presentation-ready Remotion video explaining FairHaven's
production architecture through animated data flow. Primary output is a
1920×1080 H.264 MP4; secondary output is a full-system poster PNG.

Video must stay understandable to a business operator while remaining correct
for engineers. It shows system boundaries, order and stock flow, integrations,
and security controls without exposing credentials or infrastructure secrets.

## Audience and outcome

Audience: FairHaven owner, operators, technical partners, and integration
teams. Viewer should understand these points after one viewing:

1. Customers use Telegram bot, Mini App, and `fairhaven.uz`; operators use
   `admin.fairhaven.uz`.
2. Medicalka and Uzum enter through protected `api.fairhaven.uz` routes.
3. Backend owns customer, product, order, settings, and admin workflows.
4. Channel Hub isolates Billz credentials, sales-channel adapters, stock
   mirror, channel keys, and channel-order lifecycle.
5. MongoDB stores operational state; Billz remains source of stock truth.
6. Nginx/TLS, strict route allowlists, separate credentials, loopback-only
   internal traffic, collection boundaries, and write guards form layered
   protection.

## Canonical architecture

### Entry surfaces

- Customer: Telegram bot, Telegram Mini App, `fairhaven.uz`.
- Operator: `admin.fairhaven.uz`.
- Partners: Medicalka and Uzum.
- Public integration edge: `api.fairhaven.uz` behind TLS and Nginx.

### Runtime services

- Backend `:3000`: customers, products, settings, bot orders, admin API, and
  operator analytics.
- Channel Hub `127.0.0.1:3100`: Medicalka and Uzum adapters, Billz sync,
  inventory mirror, channel orders, channel credentials, and guarded Billz
  writes.
- Backend-to-Hub internal API: loopback-only, authenticated, and never proxied
  by public Nginx.

### Data systems

- MongoDB: shared database with enforced write/read collection boundaries.
- Billz API: stock source of truth and guarded reservation/sale destination.
- Telegram API: customer bot responses and operator notifications.

### Core flows

1. Bot order: customer → Backend → internal desired-state command → Channel
   Hub → guarded Billz reservation/sale.
2. Marketplace order: Medicalka/Uzum → TLS/Nginx → Channel Hub → immediate
   accepted response → asynchronous Billz work.
3. Catalog and stock: Billz → Channel Hub mirror → channel-specific visibility
   and availability → Medicalka/Uzum/Admin.
4. Operator view: Admin → Backend → local Hub read endpoints → combined sales,
   stock, order, and integration health.

## Storyboard

Total duration: 48 seconds, 30 FPS, 1440 frames.

### Scene 1 — System identity, 0–4s

FairHaven wordmark and title appear over clean white canvas. Thin burgundy
operational pulse draws left to right. Subtitle: “Bitta ekotizim. Barcha sotuv
kanallari.”

### Scene 2 — Entry surfaces, 4–11s

Customer and operator cards enter from left; Medicalka and Uzum enter from
right. Center remains empty, creating a clear question: where do all flows
meet? Small labels identify customer, operator, and partner boundaries.

### Scene 3 — Protected edge, 11–17s

`api.fairhaven.uz` gateway rises in center. TLS shield closes around it. Only
`/medicalka/v1` and `/uzum` lanes illuminate; `/internal` and `/health` visibly
stop at closed gates. Customer/admin traffic forms a separate lane toward
Backend.

### Scene 4 — Two-service core, 17–26s

Backend `:3000` and Channel Hub `:3100` expand side by side. Backend owns bot,
shop, admin, users, products, and orders. Channel Hub owns adapters, keys,
inventory mirror, channel orders, and Billz bridge. Loopback internal line
connects them; line never reaches public edge.

### Scene 5 — Order lifecycle, 26–34s

One order packet travels through `received → reserved → sold`; cancellation
branches safely downward. Marketplace response returns before Billz work,
while bot orders wait for operator confirmation. Duplicate packet merges into
original order to illustrate idempotency.

### Scene 6 — Stock and analytics, 34–41s

Billz sends stock pulse into Channel Hub mirror. Formula appears briefly:
`sellable = stock − reserved − pending − minStock`. Result fans out to
Medicalka, Uzum, and Admin analytics. MongoDB glows beneath both services as
operational memory, not as public entry point.

### Scene 7 — Layered security and full map, 41–48s

Protection rings activate in sequence: TLS/Nginx allowlist, separate channel
keys, loopback internal token, MongoDB collection boundary, Billz write guard,
and redacted logs. Camera eases back to full architecture. Final message:
“FairHaven — nazorat qilinadigan yagona savdo tizimi.”

## Visual system

- Canvas: `#FFFFFF`; quiet surface: `#F7F7F7`.
- Primary FairHaven burgundy: `#973961`; deep burgundy: `#6F2547`.
- Ink: `#111111`; secondary ink: `#5F6166`; border: `#DADCE0`.
- Live/healthy flow: restrained teal `#168577`.
- Protection and warning: amber `#C98118`; blocked paths: muted red `#B8414B`.
- Typeface: Arial/Helvetica/system sans. Technical IDs and ports use system
  monospace.
- Cards: 18–24px radius, quiet borders, minimal shadow, large presentation
  labels.
- Safe margin: 96px. No critical label below 30px at 1080p.

## Motion language

- Camera movement uses slow ease-in/ease-out; nodes use damped springs.
- Data packets follow deterministic SVG paths with staggered timing.
- Active path stays saturated; unrelated paths dim to 20–35% opacity.
- Pulse line carries visual continuity between scenes.
- No random animation, decorative particles, spinning logos, or continuous
  motion that competes with explanation.
- Scene transitions overlap by 8–12 frames to avoid slide-deck harshness.
- Final map holds at least 75 frames for reading.

## Composition rules

- Maximum seven primary nodes visible before final overview.
- One sentence or one short label per visual idea.
- Uzbek Latin copy; domain names, routes, service names, and lifecycle states
  remain exact technical identifiers.
- No real token, secret, IP credential, customer data, order ID, or private
  database value appears.
- Current TEST MODE is not presented as production Billz writing. Write guard
  appears enabled as protection; actual sale flow is labeled as production
  behavior after activation.

## Deliverables

- `FairHaven-Architecture-1080p.mp4` — 1920×1080, 30 FPS, H.264.
- `FairHaven-Architecture-Poster.png` — final full-map frame.
- Remotion source under a dedicated project artifact directory, isolated from
  production application code.

## Verification

- Render completes deterministically with zero missing assets.
- MP4 duration is 48 seconds, 1920×1080, 30 FPS, H.264.
- Poster is exact 1920×1080 final architecture frame.
- Frames sampled at every scene boundary show no clipping, overlap, or unsafe
  text margins.
- Full video is visually reviewed for pacing and label readability.
- Diagram matches current repository architecture and deployed public API.
- Secret-pattern scan finds no credential-like values in source or outputs.

## Out of scope

- Voice-over, music, live production metrics, clickable interaction, external
  stock footage, customer data, and changes to production services.
