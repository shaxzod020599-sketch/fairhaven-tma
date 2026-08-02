# FairHaven Admin Panel Full Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `admin/` with a new production-shaped FairHaven operator application and prove it on localhost against an in-memory MongoDB demo.

**Architecture:** Standalone Vite + React application under `/admin`, split into app shell, API, UI primitives, shared libraries, and business features. Existing backend contracts remain; additive models and routes supply operator history, analytics, search, audit, broadcast, and guarded Excel application.

**Tech Stack:** React 18, Vite, native History API routing, Vitest, Testing Library, Node test runner, Express, Mongoose, mongodb-memory-server, native SVG charts, CSS Modules-style feature sheets, Playwright browser verification.

## Global Constraints

- UI language: Russian.
- Brand: white `#FFFFFF`, burgundy `#973961`, pressed `#7D2F50`, black ink.
- Typography: Arial/Helvetica; money, stock, SKU, IDs, timestamps use system monospace.
- Standalone app path: `/admin`; quick shell path: `/admin/quick`.
- Authentication: Telegram signed `initData` or bot-confirmed HttpOnly cookie; no password and no locally stored identity.
- MongoDB changes are additive; no field or collection rename/removal.
- Localhost uses in-memory MongoDB, deterministic seed, empty bot token, disabled Billz bridge, and disabled stock reconciler.
- Existing backend/channel-hub integration work is preserved.
- Existing `admin/` is backed up outside repository before replacement and is not imported into new source.
- No commit, push, deploy, production credential, or production database before user accepts localhost demo.

---

## File Map

### Application

- `admin/src/app/`: providers, router, access gate, full shell, quick shell.
- `admin/src/api/`: shared request client plus one module per backend resource.
- `admin/src/ui/`: Button, Field, Card, Dialog, Toast, DataState, Badge, Pagination, CommandPalette, icons.
- `admin/src/lib/`: formatters, validators, Telegram bridge, query-state, polling-diff, draft store, undo controller.
- `admin/src/features/`: dashboard, orders, products, connections, customers, admins, promos, collections, settings, gallery, activity.
- `admin/src/styles/`: tokens, reset, shell, utilities, print.
- `admin/src/test/`: test setup, fetch server, builders, render helper.

### Backend additions

- `backend/models/AuditLog.js`: redacted mutation trail.
- `backend/models/Broadcast.js`: guarded broadcast lifecycle and counts.
- `backend/models/ImportPreview.js`: short-lived Excel dry-run binding.
- `backend/services/adminAudit.js`: safe diff/redaction writer.
- `backend/services/adminSearch.js`: cross-entity search aggregation.
- `backend/services/broadcastService.js`: segment resolution and bounded sending.
- `backend/services/orderWorkflow.js`: legal status transitions and history.
- `backend/controllers/adminOperationsController.js`: operator actions, search, analytics, audit, broadcast.
- `backend/tests/adminOperations.test.js`: all additive backend contracts.

---

### Task 1: Recoverable Replacement and Testable App Foundation

**Files:**

- Backup: `admin/` → `/Users/tm/Documents/Codex/2026-08-02/tol/work/fairhaven-admin-pre-rewrite/`
- Create: `admin/package.json`
- Create: `admin/index.html`
- Create: `admin/vite.config.js`
- Create: `admin/src/main.jsx`
- Create: `admin/src/app/App.jsx`
- Create: `admin/src/test/setup.js`
- Create: `admin/src/app/App.test.jsx`
- Create: `admin/src/styles/tokens.css`
- Create: `admin/src/styles/reset.css`

**Interfaces:**

- Produces: `App()` root; Vite base `/admin/`; scripts `dev`, `build`, `test`, `test:run`.
- Consumes: no application interfaces.

- [ ] Copy current `admin/` to recovery directory and verify source count matches before replacement.
- [ ] Remove only repository `admin/` after backup verification.
- [ ] Create package with React 18, React DOM 18, Vite, Vitest, jsdom, Testing Library, and user-event.
- [ ] Write failing root render test asserting Russian application landmark and loading state.
- [ ] Run `npm test -- --run src/app/App.test.jsx`; expected failure because `App` is absent.
- [ ] Implement minimal root and token/reset imports.
- [ ] Re-run test; expected pass.
- [ ] Run `npm run build`; expected `/admin/assets/*` output and no unresolved imports.
- [ ] Review diff. Do not commit.

### Task 2: Design System and Responsive Shells

**Files:**

- Create: `admin/src/ui/Button.jsx`
- Create: `admin/src/ui/Field.jsx`
- Create: `admin/src/ui/Card.jsx`
- Create: `admin/src/ui/Badge.jsx`
- Create: `admin/src/ui/Dialog.jsx`
- Create: `admin/src/ui/ToastProvider.jsx`
- Create: `admin/src/ui/DataState.jsx`
- Create: `admin/src/ui/Pagination.jsx`
- Create: `admin/src/ui/Icon.jsx`
- Create: `admin/src/app/navigation.js`
- Create: `admin/src/app/FullShell.jsx`
- Create: `admin/src/app/QuickShell.jsx`
- Create: `admin/src/styles/components.css`
- Create: `admin/src/styles/shell.css`
- Test: `admin/src/ui/Dialog.test.jsx`
- Test: `admin/src/app/Shells.test.jsx`

**Interfaces:**

- Produces: `Button`, `Field`, `Card`, `Badge`, `Dialog`, `ToastProvider/useToast`, `DataState`, `Pagination`, `Icon`, `NAV_ITEMS`, `FullShell`, `QuickShell`.
- Consumes: native `useRoute` and `navigate` primitives.

- [ ] Write dialog test for focus entry, Escape close, labelled title, and destructive confirmation label.
- [ ] Write shell tests for full navigation, mobile bottom navigation, quick/full switch, and active route.
- [ ] Run focused tests; expected missing component failures.
- [ ] Implement primitives with semantic elements, 44px touch targets, visible focus ring, reduced motion, and burgundy tokens.
- [ ] Implement white rail/full shell and quick shell using shared navigation definitions.
- [ ] Re-run focused tests; expected pass.
- [ ] Render shells at 375, 768, and 1440 widths with no horizontal document overflow.
- [ ] Review diff. Do not commit.

### Task 3: Authentication, Telegram Bridge, Router, and API Core

**Files:**

- Create: `admin/src/api/client.js`
- Create: `admin/src/api/auth.js`
- Create: `admin/src/lib/telegram.js`
- Create: `admin/src/app/AccessGate.jsx`
- Create: `admin/src/app/LoginPage.jsx`
- Create: `admin/src/app/router.jsx`
- Create: `admin/src/app/RouteError.jsx`
- Test: `admin/src/api/client.test.js`
- Test: `admin/src/app/AccessGate.test.jsx`
- Test: `admin/src/lib/telegram.test.js`

**Interfaces:**

- Produces: `apiRequest(path, options)`, `downloadRequest(path)`, `whoAmI()`, `startWebLogin()`, `pollWebLogin(token)`, `logout()`, `telegram`, `AccessGate`, `router`.
- Error shape: `{ message: string, code: string, status: number, details?: object }`.

- [ ] Write client tests proving `initData` header only when present, cookies stay enabled, object body serializes, FormData content type is untouched, and non-JSON errors normalize.
- [ ] Write access tests for admin success, browser login, TMA non-admin denial, expired poll, and retry.
- [ ] Write Telegram tests for missing global, safe-area publication, deep-link path extraction, fullscreen, BackButton, and haptic feature detection.
- [ ] Run focused tests; expected failures.
- [ ] Implement API client and auth module without localStorage identity.
- [ ] Implement guarded Telegram bridge and route tree for every required page plus `/admin/quick/*`.
- [ ] Implement access/login states using existing `/api/admin/whoami` and `/api/web/auth/*` contracts.
- [ ] Re-run focused tests; expected pass.
- [ ] Review diff. Do not commit.

### Task 4: Additive Operator Domain and Audit Contracts

**Files:**

- Modify: `backend/models/Order.js`
- Modify: `backend/models/User.js`
- Create: `backend/models/AuditLog.js`
- Create: `backend/services/orderWorkflow.js`
- Create: `backend/services/adminAudit.js`
- Create: `backend/controllers/adminOperationsController.js`
- Modify: `backend/routes/adminRoutes.js`
- Test: `backend/tests/adminOperations.test.js`

**Interfaces:**

- `orderWorkflow.allowedTransitions(status)` returns destination array.
- `orderWorkflow.transition({ order, to, reason, admin })` validates and appends history.
- `adminAudit.record({ req, action, entityType, entityId, before, after })` stores redacted summary.
- Routes: detail/claim/notes/customer/status/receipt under `/api/admin/orders/:id`; customer edit/block under `/api/admin/users/:telegramId`; audit list under `/api/admin/activity`.

- [ ] Write in-memory Mongo tests for safe schema defaults on old documents.
- [ ] Write transition tests for every legal edge and reject illegal/backward edges.
- [ ] Write tests requiring reason for cancelled/returned, preserving actor/time/history, claim conflict, internal note author, and user block edit.
- [ ] Write audit tests proving token, secret, cookie, authorization, and initData keys are absent from stored before/after.
- [ ] Run `node --test tests/adminOperations.test.js`; expected failures.
- [ ] Add `returned`, `statusHistory`, `internalNotes`, `claimedBy`, `claimedAt`, and `customerBlocked` using safe defaults.
- [ ] Implement workflow, audit service, controller, and routes.
- [ ] Re-run backend focused tests and existing authorization/order integrity tests; expected pass.
- [ ] Review diff. Do not commit.

### Task 5: Orders Attention Inbox and Workbench

**Files:**

- Create: `admin/src/api/orders.js`
- Create: `admin/src/features/orders/orderModel.js`
- Create: `admin/src/features/orders/OrdersPage.jsx`
- Create: `admin/src/features/orders/AttentionTabs.jsx`
- Create: `admin/src/features/orders/OrderList.jsx`
- Create: `admin/src/features/orders/OrderWorkbench.jsx`
- Create: `admin/src/features/orders/OrderTimeline.jsx`
- Create: `admin/src/features/orders/OrderActions.jsx`
- Create: `admin/src/features/orders/order-print.css`
- Create: `admin/src/lib/pollDiff.js`
- Test: `admin/src/features/orders/OrdersPage.test.jsx`
- Test: `admin/src/features/orders/orderModel.test.js`

**Interfaces:**

- Produces: `ordersApi`, `statusMeta`, `attentionReason(order, now)`, `OrderWorkbench`, `diffById(previous, next)`.
- Consumes: Task 2 UI, Task 3 client, Task 4 server actions.

- [ ] Write model tests for urgency ordering, status labels, returned state, legal server actions, and stable polling diff.
- [ ] Write page tests for debounced URL search, pagination, stale-data retention, new-order badge, claim, reason dialog, note, customer edit, timeline, and print action.
- [ ] Run focused tests; expected failures.
- [ ] Implement API and pure model first.
- [ ] Implement inbox/list/workbench components; action buttons come from server available-actions response.
- [ ] Add ten-second polling, single notification per new order, optional sound permission, and TMA haptic.
- [ ] Add A5/thermal print stylesheet excluding navigation and controls.
- [ ] Re-run focused tests; expected pass.
- [ ] Review diff. Do not commit.

### Task 6: Unified Product Catalog, Billz Picker, and Channel Matrix

**Files:**

- Create: `admin/src/api/products.js`
- Create: `admin/src/features/products/channelDefinitions.js`
- Create: `admin/src/features/products/productValidation.js`
- Create: `admin/src/features/products/ProductsPage.jsx`
- Create: `admin/src/features/products/ProductCard.jsx`
- Create: `admin/src/features/products/ProductEditor.jsx`
- Create: `admin/src/features/products/BillzPanel.jsx`
- Create: `admin/src/features/products/BillzPicker.jsx`
- Create: `admin/src/features/products/ChannelMatrix.jsx`
- Create: `admin/src/features/products/ImageManager.jsx`
- Create: `admin/src/lib/draftStore.js`
- Test: `admin/src/features/products/ProductsPage.test.jsx`
- Test: `admin/src/features/products/productValidation.test.js`

**Interfaces:**

- Produces: `productsApi`, `CHANNEL_DEFINITIONS`, `validateProductDraft`, `ProductEditor`, `BillzPicker`, `ChannelMatrix`, `draftStore`.
- Channel definition fields: `key`, `label`, `supportsPrice`, `supportsMinStock`, `statusModes`.

- [ ] Write tests for required name/category/nonnegative prices, one product IKPU, default IKPU explanation, and cleared identifiers on duplicate.
- [ ] Write product page tests proving Billz list opens before typing, `search` parameter debounce, linked rows disabled, creation prefill, link action, stock/reserve display, per-channel price/status/minimum stock, multilingual text, images, autosaved draft, pagination, error versus empty, and Excel entry point.
- [ ] Run focused tests; expected failures.
- [ ] Implement configuration-driven channel matrix.
- [ ] Implement unified cards and editor with dominant Billz panel.
- [ ] Implement paginated picker and duplicate/draft behavior.
- [ ] Re-run focused tests; expected pass.
- [ ] Review diff. Do not commit.

### Task 7: Connections and Credential Safety

**Files:**

- Modify: `backend/controllers/channelController.js`
- Modify: `backend/routes/adminRoutes.js`
- Create: `admin/src/api/connections.js`
- Create: `admin/src/features/connections/ConnectionsPage.jsx`
- Create: `admin/src/features/connections/MedicalkaWizard.jsx`
- Create: `admin/src/features/connections/UzumWizard.jsx`
- Create: `admin/src/features/connections/BillzSyncCard.jsx`
- Create: `admin/src/features/connections/DefaultIkpuCard.jsx`
- Test: `backend/tests/channelAdmin.test.js`
- Test: `admin/src/features/connections/ConnectionsPage.test.jsx`

**Interfaces:**

- Route `POST /api/admin/channels/keys/pair` returns one-time `{ token, secret, issuedAt }` and optionally revokes named old IDs.
- Produces: `connectionsApi`, `MedicalkaWizard`, `UzumWizard`, `BillzSyncCard`.

- [ ] Add backend tests proving pair issuance returns both once, stores only hashes, revokes only explicitly selected keys, and audit contains no plaintext.
- [ ] Write UI tests for explain → confirm → reveal → acknowledgement → next steps; close disabled before acknowledgement; copy actions; secret cleared after close.
- [ ] Write Uzum tests proving imported credentials, no generation wording, and cleared form.
- [ ] Write Billz/default IKPU tests for last-good data, sync failure, manual refresh, and saved default.
- [ ] Run focused tests; expected failures.
- [ ] Implement paired backend endpoint and audit integration.
- [ ] Implement connection cards and wizards.
- [ ] Re-run focused tests; expected pass.
- [ ] Review diff. Do not commit.

### Task 8: Dashboard, Analytics, Global Search, and Command Palette

**Files:**

- Create: `backend/services/adminSearch.js`
- Extend: `backend/controllers/adminOperationsController.js`
- Modify: `backend/routes/adminRoutes.js`
- Create: `admin/src/api/dashboard.js`
- Create: `admin/src/features/dashboard/DashboardPage.jsx`
- Create: `admin/src/features/dashboard/MetricCards.jsx`
- Create: `admin/src/features/dashboard/RevenueChart.jsx`
- Create: `admin/src/features/dashboard/AttentionPanel.jsx`
- Create: `admin/src/ui/CommandPalette.jsx`
- Test: `backend/tests/adminOperations.test.js`
- Test: `admin/src/features/dashboard/DashboardPage.test.jsx`
- Test: `admin/src/ui/CommandPalette.test.jsx`

**Interfaces:**

- `GET /api/admin/dashboard?period=1d|7d|30d` returns metrics, revenue series, top products, low stock, conflicts, recent activity, and generatedAt.
- `GET /api/admin/search?q=` returns grouped route targets for orders, customers, products, promos.

- [ ] Write aggregation tests against known demo orders for each period, average check, trend buckets, top products, low stock, and conflict count.
- [ ] Write search tests for partial phone, order suffix, product name/SKU, and promo code with capped groups.
- [ ] Write UI tests for stale dashboard preservation, “updated N seconds ago”, period URL state, chart labels, Cmd/Ctrl+K open, keyboard navigation, and route selection.
- [ ] Run focused tests; expected failures.
- [ ] Implement server aggregation/search and routes.
- [ ] Implement dashboard and accessible native SVG chart.
- [ ] Mount command palette in both shells.
- [ ] Re-run focused tests; expected pass.
- [ ] Review diff. Do not commit.

### Task 9: Customers and Administrators

**Files:**

- Create: `admin/src/api/customers.js`
- Create: `admin/src/api/admins.js`
- Create: `admin/src/features/customers/CustomersPage.jsx`
- Create: `admin/src/features/customers/CustomerDetail.jsx`
- Create: `admin/src/features/admins/AdminsPage.jsx`
- Create: `admin/src/features/admins/AddAdminDialog.jsx`
- Test: `admin/src/features/customers/CustomersPage.test.jsx`
- Test: `admin/src/features/admins/AdminsPage.test.jsx`

**Interfaces:**

- Produces: `customersApi`, `adminsApi`, `CustomersPage`, `CustomerDetail`, `AdminsPage`.
- Consumes: existing list/detail/admin routes plus Task 4 edit/block routes.

- [ ] Write customer tests for debounced URL search, pagination, detail, phone/name edit, order count, LTV, block confirmation, and stale rows after failure.
- [ ] Write admin tests for customer search promotion, already-admin state, demotion confirmation, and last-admin error explanation.
- [ ] Run focused tests; expected failures.
- [ ] Implement pages and dialogs with no raw-ID promotion form.
- [ ] Re-run focused tests; expected pass.
- [ ] Review diff. Do not commit.

### Task 10: Promos, Collections, Settings, and Gallery Parity

**Files:**

- Create: `admin/src/api/promos.js`
- Create: `admin/src/api/collections.js`
- Create: `admin/src/api/settings.js`
- Create: `admin/src/api/gallery.js`
- Create: `admin/src/features/promos/PromosPage.jsx`
- Create: `admin/src/features/collections/CollectionsPage.jsx`
- Create: `admin/src/features/collections/ProductSelector.jsx`
- Create: `admin/src/features/settings/SettingsPage.jsx`
- Create: `admin/src/features/gallery/GalleryPage.jsx`
- Test: one colocated page test per feature.

**Interfaces:**

- Produces: resource API modules and four route pages.
- Consumes: existing CRUD/upload routes and shared primitives.

- [ ] Write promo tests for search, start-before-expiry validation, discount bounds, CRUD, toggle, and usage display.
- [ ] Write collection tests for paginated product search, ordered selection, keyboard reorder, visibility, and CRUD.
- [ ] Write settings tests for groups, field validation, save-all, delete confirmation, and mixed values.
- [ ] Write gallery tests for multi-upload queue, preserved aspect preview, copy URL, usage warning, retry, and delete confirmation.
- [ ] Run focused tests; expected failures.
- [ ] Implement resource modules and pages.
- [ ] Re-run focused tests; expected pass.
- [ ] Review diff. Do not commit.

### Task 11: Guarded Excel Import and Export

**Files:**

- Modify: `backend/controllers/excelController.js`
- Create: `backend/models/ImportPreview.js`
- Modify: `backend/routes/adminRoutes.js`
- Create: `admin/src/api/excel.js`
- Create: `admin/src/features/products/ExcelDialog.jsx`
- Test: `backend/tests/adminOperations.test.js`
- Test: `admin/src/features/products/ExcelDialog.test.jsx`

**Interfaces:**

- Dry run returns `{ previewToken, expiresAt, summary, creates, updates, unchanged, errors }`.
- Apply accepts `{ previewToken }` and refuses missing, expired, consumed, wrong-admin, or hash-mismatched preview.

- [ ] Write backend tests for complete export columns, dry-run-only mutation count zero, exact old/new diff, row errors, no deletion, preview binding, single use, and expiry.
- [ ] Write UI tests for dry-run report, disabled apply on errors, explicit confirmation, applied result, and forced rerun after expiry.
- [ ] Run focused tests; expected failures.
- [ ] Implement server preview storage with TTL index and guarded apply.
- [ ] Implement Excel dialog and download flow using shared client cookie/initData auth.
- [ ] Re-run focused tests; expected pass.
- [ ] Review diff. Do not commit.

### Task 12: Audit Activity, Undo, and Broadcast

**Files:**

- Create: `backend/models/Broadcast.js`
- Create: `backend/services/broadcastService.js`
- Extend: `backend/controllers/adminOperationsController.js`
- Modify: `backend/routes/adminRoutes.js`
- Create: `admin/src/api/activity.js`
- Create: `admin/src/features/activity/ActivityPage.jsx`
- Create: `admin/src/features/activity/BroadcastComposer.jsx`
- Create: `admin/src/lib/undoController.js`
- Test: `backend/tests/adminOperations.test.js`
- Test: `admin/src/features/activity/ActivityPage.test.jsx`
- Test: `admin/src/lib/undoController.test.js`

**Interfaces:**

- Broadcast state: `draft → tested → confirmed → sending → completed|failed`.
- Segment keys: `all`, `recent30`, `inactive90`.
- `undoController.offer({ label, apply, revert, ttl: 5000 })` returns cancel/execute controls.

- [ ] Write backend tests for segment counts, blocked-user exclusion, test-send requirement, confirmation requirement, bounded concurrency, result counts, and history.
- [ ] Write activity tests for audit pagination/filter and safe summaries.
- [ ] Write broadcast UI tests for preview, mandatory admin test, confirmation, progress, and history.
- [ ] Write undo tests for five-second expiry, successful revert, failed precondition, and one active undo queue item.
- [ ] Run focused tests; expected failures.
- [ ] Implement service, endpoints, activity page, composer, and undo controller.
- [ ] Wire undo to status, availability, and price mutations while preserving server validation.
- [ ] Re-run focused tests; expected pass.
- [ ] Review diff. Do not commit.

### Task 13: Quick Mode, Local Demo Seed, and End-to-End Proof

**Files:**

- Extend: `backend/scripts/dev-local.js`
- Create: `admin/e2e/admin.spec.js`
- Create: `admin/playwright.config.js`
- Create: `admin/src/styles/print.css`
- Modify: `docs/ADMIN_DEPLOY.md`

**Interfaces:**

- Local backend: `http://127.0.0.1:3001`.
- Local admin: `http://127.0.0.1:5173/admin/`.
- Demo accounts and entities are deterministic; bot, stock reconciler, Billz bridge, and channel-hub network stay disabled.

- [ ] Extend seed with attention reasons, Billz conflict, low stock, channel configurations, status history, notes, claims, audit events, and broadcast history.
- [ ] Write E2E for automatic dev admin access, full/quick switch, deep-link order, complete legal order flow, Billz picker, channel edit, Medicalka wizard acknowledgement, Excel dry run, global search, and customer block.
- [ ] Run frontend unit suite; expected all pass.
- [ ] Run backend existing + new suite; expected all pass.
- [ ] Run frontend production build; expected pass.
- [ ] Start local backend and Vite in resolved terminal sessions.
- [ ] Run Playwright at 375×812, 768×1024, and 1440×1000; expected all pass.
- [ ] Inspect screenshots for clipping, accidental dark/green chrome, unreadable type, broken dialogs, and missing states.
- [ ] Run keyboard-only smoke: Cmd/Ctrl+K, Tab, Enter, Escape, route navigation, dialogs.
- [ ] Run final `git diff --check`, secret scan, and scope review.
- [ ] Keep servers running and provide localhost URL plus evidence paths. Stop before commit/push.

---

## Plan Self-Review

- Spec coverage: auth, separate app, full/quick shells, design system, unified products, Billz picker, channel matrix, IKPU, connection wizards, order workflow, polling, parity pages, Excel dry run, global search, undo, drafts, analytics, audit, customer block, broadcast, data safety, and localhost proof all map to tasks.
- Placeholder scan: no deferred implementation marker; every task names files, interfaces, failing tests, implementation, and verification.
- Type consistency: route paths, status values, segment keys, channel definition fields, dry-run token, and audit interface match across producer/consumer tasks.
- Workflow exception: task commits intentionally omitted because user requires localhost review before continuation.
