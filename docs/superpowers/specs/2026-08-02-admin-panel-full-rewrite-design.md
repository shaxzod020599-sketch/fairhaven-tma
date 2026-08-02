# FairHaven Admin Panel Full Rewrite Design

Date: 2026-08-02

## Decision

Build `admin/` from zero. Existing uncommitted `admin/` source is not reused as a foundation. Before replacement it is copied to the Codex task workspace for recovery. Existing backend, bot, Billz channel-hub, Medicalka, Uzum, MongoDB models, and public storefront remain in place.

First delivery stops at a verified localhost demo. No commit, push, production token, production database, deployment, or destructive migration before user approval after the demo.

## Outcome

One Russian-language operator app works at `/admin` in normal browsers and Telegram Mini App. It lets one to three non-technical operators run daily FairHaven operations without switching between catalog and channel tools.

Success means:

- browser bot-login and Telegram `initData` authentication both work;
- every existing admin capability remains available;
- product cards combine FairHaven product data, Billz truth, and channel controls;
- orders expose only legal status transitions and preserve operational history;
- Medicalka, Uzum, and Billz connection flows match their real integration direction;
- Excel import cannot mutate data before a successful dry run and explicit confirmation;
- desktop, tablet, and mobile/TMA layouts remain usable;
- localhost runs against in-memory MongoDB and demo data without production credentials;
- automated tests and browser evidence prove core flows.

## Architecture

### Application boundary

`admin/` is a standalone Vite + React application served under `/admin`. It owns no customer storefront code. Backend continues serving `/api/admin/*` and static admin assets.

Application uses route-driven feature modules:

- `/admin` dashboard and attention inbox;
- `/admin/orders` and `/admin/orders/:id` operator workbench;
- `/admin/products` and `/admin/products/:id` unified catalog editor;
- `/admin/connections` Medicalka, Uzum, Billz, and default IKPU;
- `/admin/customers` and `/admin/customers/:telegramId`;
- `/admin/promos`;
- `/admin/collections`;
- `/admin/admins`;
- `/admin/settings`;
- `/admin/gallery`;
- `/admin/activity` audit and broadcast history;
- `/admin/quick/*` phone-first TMA shell using same feature data and actions.

Native History API routing keeps route, selected entity, filters, pagination, and saved views in URL. Browser refresh and bot deep-links reopen same work item without adding a router dependency.

### Frontend boundaries

- `app/`: router, providers, full/quick shells, access gate.
- `api/`: HTTP client, typed request helpers, feature API modules, query serialization.
- `ui/`: design tokens and reusable primitives only.
- `features/`: one directory per business area; feature state stays local unless truly global.
- `lib/`: formatting, validation, Telegram adapter, polling, drafts, keyboard commands.
- `test/`: render helpers, MSW-like fetch fixture, browser fixtures.

No page file owns unrelated feature logic. Target upper bound: 350 lines per source file; split earlier when responsibilities diverge.

### Backend boundary

Existing endpoints stay compatible. New behavior is additive:

- richer dashboard and global search read endpoints;
- order detail, legal transition, rejection reason, claim, internal note, customer edit, and printable receipt endpoints;
- customer profile edit and block flag;
- audit log read endpoint and mutation recording;
- analytics summaries;
- broadcast preview, admin test-send, confirmed send, and history;
- paired Medicalka key issuance;
- Excel dry-run token followed by confirmed apply.

No existing collection or field is renamed or removed. New schema fields use safe defaults so old documents remain valid.

## Design System

Visual direction: FairHaven clinical editorial workspace.

- Canvas: white `#FFFFFF`; secondary surface `#F7F7F7`.
- Primary accent: burgundy `#973961`; pressed `#7D2F50`; pale accent `#F7EAF0`.
- Ink: `#111111`; secondary ink `#5F6166`; border `#DADCE0`.
- Error uses clear red; warning uses amber; operational success may use restrained teal only as semantic feedback, never theme chrome.
- Typography: Arial/Helvetica. Money, stock, SKU, IDs, and timestamps use system monospace.
- Cards: 16px radius, quiet border, minimal shadow. Actions: pill geometry.
- Left navigation stays white. Active item uses burgundy type and pale burgundy background.
- Motion communicates change: 160–280ms fades, slide-in workbench, count transitions. Reduced-motion preference disables nonessential movement.
- Focus rings remain visible. All controls reachable by keyboard. Touch targets minimum 44px.

Every page implements loading skeleton, empty state, recoverable error state, stale-data notice, success feedback, and destructive-action confirmation.

### Visual execution note

Subject: FairHaven vitamin-delivery operators. Single job: notice operational risk and resolve it without losing context.

Layout sketch:

```text
┌ white rail ┬ command/search/status bar ──────────────────────┐
│ FH / OPS   │ live operational brief                          │
│ navigation ├ attention pulse ── urgent work ── sync health  │
│            ├ primary workspace ───────────┬ detail workbench │
│ identity   │ supporting data              │ contextual action│
└────────────┴──────────────────────────────┴──────────────────┘
```

Signature element: burgundy “operational pulse” line. It connects attention counts and order status steps, then reappears as Billz truth line inside product dossiers. It encodes live operational flow rather than decorating cards.

Deliberate risk: dashboard does not open with generic equal-size KPI tiles. It opens with a concise operational brief and attention pulse; metrics sit below as quiet ruled cells. Product view uses dossier cards rather than a generic spreadsheet. This keeps FairHaven identity while preserving dense operator utility.

Self-critique: cream canvas, serif display, gradients, dark navigation, decorative numbered sections, and scattered animations were removed because they would read as generic AI dashboard styling or conflict with locked FairHaven brand. Arial remains because store continuity matters more than novelty; hierarchy comes from width, weight, microtype, and whitespace.

## Shells

### Full shell

Desktop uses white navigation rail, compact top command bar, route content, and optional right workbench pane. Tablet collapses navigation to icons. Mobile replaces rail with five-item bottom navigation plus “More”.

Command bar contains global search, alert count, sync state, current admin, and full/quick mode switch.

### Quick shell

Quick shell prioritizes attention orders, claim, call, map, next legal status, short internal note, product availability, and connection health. Full mode remains reachable on every device.

Telegram adapter requests fullscreen, publishes safe-area variables, validates expected Mini App context, supports BackButton, haptic feedback, and deep-link route parsing. Browser mode works without Telegram globals.

## Authentication

Frontend sends Telegram signed `initData` when present and otherwise relies on HttpOnly web-session cookie. It never stores an admin identity or secret in localStorage.

Access gate calls `GET /api/admin/whoami`:

- authenticated admin enters application;
- browser unauthenticated user starts bot-confirmed one-time login and polls status;
- non-admin TMA user sees access-denied state;
- expired or failed login is retryable.

Backend unified middleware validates either path and verifies `role: admin` before protected routes. Development bypass works only outside production with explicit `ADMIN_DEV_BYPASS=1`.

## Products

Products use one unified card or dense list row expanding into same editor. Card shows primary image, brand, name, category, SKU, FairHaven price, and availability.

Billz block is visually dominant:

- linked: Billz price, stock, reserve, pending quantity, sync age, deletion/conflict warning;
- unlinked: explanation and “Связать с Billz” action;
- picker opens with first page before typing, then debounced server filter and pagination;
- already-linked Billz items are disabled with explanation;
- creation may start from Billz item and prefill name, SKU, barcode, brand, and price.

Channel matrix lives inside same editor:

- FairHaven bot follows Billz automatically with explicit override only when existing backend contract permits;
- Medicalka and Uzum each expose enabled, own price, availability mode, and protected minimum stock;
- UI renders channels from configuration so Yandex can be added without rebuilding product form structure;
- IKPU belongs to product; empty value clearly means shop default.

Descriptions in Russian, Uzbek Cyrillic, and Uzbek Latin plus multiple images remain supported. Duplicate creates a draft with identifiers cleared. Form drafts autosave locally without secrets.

## Connections

Medicalka wizard has explain, confirm, reveal, acknowledgement, and next-step stages. Catalog token and order secret are issued together. Existing credentials stay active unless operator explicitly selects revocation. Revealed secret never reappears after close. Close remains disabled until acknowledgement.

Uzum wizard imports manager-provided client ID and client secret; application never generates them. Secret inputs are cleared after submission and never logged.

Billz card shows mirror freshness, product counts, last error, and manual sync action. Manual sync is rate-limited and reports progress without discarding last known state.

Default IKPU setting lives here because it supports integrations, while per-product override remains in product editor.

## Orders

Attention inbox merges new, older-than-30-minutes, payment issue, Billz conflict, and sync-error orders. Oldest urgent item appears first.

Order workbench includes customer, contact actions, map, items, totals, payment, public note, internal notes, claim owner, previous order count, customer block status, Billz state, status history, and printable receipt.

Status machine:

- pending → confirmed or cancelled;
- confirmed → preparing or cancelled;
- preparing → delivering or cancelled;
- delivering → delivered or cancelled;
- delivered → returned;
- cancelled and returned are terminal.

Cancellation requires reason and confirmation. Returned requires reason. Backend owns transition validation; frontend renders server-provided available actions.

Polling every ten seconds keeps last good data. New-order diff triggers badge, optional sound after permission, and TMA haptic feedback. Duplicate notifications are suppressed.

## Parity Features

- Dashboard: today/7/30-day period, revenue, order count, average check, revenue trend, top products, low stock, channel conflicts, and recent activity.
- Promos: search, validation, usage count, date ordering, CRUD, toggle.
- Collections: paginated product search, ordered selection, visibility, CRUD.
- Customers: list/detail, phone/name edit, order history, LTV, block flag.
- Admins: customer search promotion, demotion, last-admin guard.
- Settings: grouped editor, validation, delete, save-all.
- Gallery: multi-upload preserving aspect ratio, copy URL, usage warning, delete confirmation.
- Global search: order ID, customer name/phone, product/SKU, and promo code.
- Undo: five-second reversible UI for status, availability, and price changes when server precondition still holds.

## Excel

Export returns complete catalog with FairHaven price/availability and Billz stock/price/reserve.

Import always uploads for dry run first. Response groups new products, updates with old/new field diff, unchanged rows, and errors. Successful dry run returns a short-lived server token bound to file hash and admin. Apply endpoint accepts that token; it never deletes products. Changed file or expired token forces another dry run.

## Audit and Broadcast

Audit records admin, action, entity type/ID, safe before/after summary, request time, and request source. Secrets, raw Telegram initData, cookies, and credential fields are excluded.

Broadcast supports all eligible customers, bought in last 30 days, and inactive for 90 days. Flow requires preview count, test-send to current admin, then explicit confirmation. Delivery uses bounded rate, skips blocked users, records success/failure counts, and never exposes bot token.

## Data Safety

- All MongoDB changes additive.
- Existing values keep behavior through defaults.
- No production database during localhost demo.
- `mongodump` automation remains external to panel.
- Dangerous operations use explicit target confirmation.
- Secrets use existing vault/environment mechanism; demo uses no real credentials.
- Existing dirty backend work is preserved and reviewed before overlap.

## Verification

Frontend:

- unit tests for status machine presentation, URL filters, formatters, validators, drafts, polling diff, and undo;
- component tests for authentication, product/Billz picker, connection wizard, order workbench, Excel dry run, and broadcast confirmation;
- accessibility checks for focus, labels, dialog containment, and keyboard operation;
- production build with zero warnings treated as target.

Backend:

- Node tests against `mongodb-memory-server` for every new endpoint and schema default;
- authorization tests for Telegram, browser session, non-admin, and production bypass rejection;
- contract tests for legal transitions, paired keys, dry-run/apply binding, audit redaction, and broadcast guards.

Browser:

- localhost smoke at 375×812, 768×1024, and 1440×1000;
- desktop and quick shells;
- product creation from Billz, channel edit, full order progression, connection wizard, Excel dry run, and auth states;
- screenshots saved outside repository as task evidence.

## Localhost Checkpoint

Demo command starts in-memory MongoDB, deterministic seed, backend, and Vite admin without production bot token. User receives localhost URL and tested flows. Work remains uncommitted and unpushed until user approves demo.
