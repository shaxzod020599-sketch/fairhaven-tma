# Sales Channels and Billz Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Anthropic Opus 5 is an advisory reviewer only and must not edit the shared worktree.

**Goal:** Add exact `fairhaven.uz` naming, real FairHaven/Medicalka/Uzum sales histories and Excel exports, plus a separate Billz inventory analytics page with an honest report-access gate for whole-Billz revenue.

**Architecture:** Backend owns `fairhaven.uz` order analytics and proxies read-only channel data. Channel hub owns Medicalka/Uzum histories, Billz credentials, Billz stock mirror, and Billz capability checks. Admin UI consumes one normalized contract through authenticated same-origin admin routes. Billz revenue synchronization remains disabled while current Billz credential returns `403` for order reports; UI exposes this as unavailable rather than substituting channel totals.

**Tech Stack:** Node.js 20, Express 4, Mongoose 8, MongoDB, ExcelJS, React 18, Vite 8, Vitest 4, Node test runner.

## Global Constraints

- Visible source label is exactly `fairhaven.uz`; generic `магазин` copy must not remain in admin UI.
- Never add Billz whole-business totals to channel totals.
- Channel revenue uses immutable completion timestamps, not mutable `updatedAt` query fallback.
- All normalized money is integer UZS; Asia/Tashkent uses fixed UTC+05:00 and half-open `[from, to)` ranges.
- Admin browser never receives Billz or internal service credentials.
- All analytics reads are bounded: presets only for UI, maximum 90-day server range, maximum 100 list rows per page.
- Excel export masks phones, neutralizes formula-leading cells, caps rows, rate-limits requests, and serializes one workbook per admin.
- No fake/demo totals on production paths. Unavailable data renders an explicit unavailable state.
- Preserve current dirty worktree. No commit, push, deploy, DNS, or production environment mutation.
- Every production behavior follows RED → verify failure → GREEN → verify pass.

## External Capability Gate

Existing verified project documentation records `403 access denied` for both `GET /v1/order` and `GET /v2/order` with the current Billz key. This plan therefore delivers full channel analytics and full Billz inventory analytics now, while whole-Billz revenue remains `report_access_required`.

Activation of whole-Billz revenue requires a later fixture-driven plan after a read-only probe returns `200` and confirms pagination, payment timestamp, timezone, currency units, modified-since behavior, and return representation. No generic mapper is allowed before that evidence exists.

---

### Task 1: Asia/Tashkent Period and Query Contract

**Files:**
- Create: `channel/src/analytics/period.js`
- Create: `channel/tests/analyticsPeriod.test.js`
- Create: `channel/src/analytics/query.js`
- Create: `channel/tests/analyticsQuery.test.js`
- Create: `backend/utils/analyticsQuery.js`
- Create: `backend/tests/analyticsQuery.test.js`

**Interfaces:**
- `periodForPreset(preset, now) -> { preset, from, to, bucket }`
- `parseChannelAnalyticsQuery(query) -> { preset, from, to, status, search, page, limit }`
- `parseAnalyticsQuery(query) -> { preset, from, to, status, search, page, limit }`
- Presets: `1d`, `7d`, `30d`; direct ranges are rejected beyond 90 days.

- [ ] Write channel tests with literal UTC instants proving Tashkent midnight, 7 calendar days including today, 30 calendar days including today, half-open end, and partial current-hour marker.
- [ ] Run `node --test tests/analyticsPeriod.test.js`; verify failure because module is missing.
- [ ] Implement fixed UTC+05:00 period arithmetic using shifted UTC fields; do not depend on process timezone.
- [ ] Run focused test; verify pass.
- [ ] Write failing channel query tests for preset/status allowlists, channel-specific statuses, search length, page/limit clamps, and 90-day rejection.
- [ ] Implement `channel/src/analytics/query.js` and run its focused suite.
- [ ] Write backend query tests for preset allowlist, escaped/trimmed search, status allowlist, page/limit clamping, and 90-day rejection.
- [ ] Run `node --test tests/analyticsQuery.test.js`; verify expected missing-module failure.
- [ ] Implement parser with error code `invalid_analytics_query` and no raw RegExp construction.
- [ ] Run both focused suites and `git diff --check`.

### Task 2: Immutable Channel Sale Completion Time

**Files:**
- Modify: `channel/src/models/ChannelOrder.js`
- Modify: `channel/src/core/orders.js`
- Create: `channel/scripts/backfill-channel-sold-at.js`
- Modify: `channel/tests/orders.test.js`
- Create: `channel/tests/channelSoldAtBackfill.test.js`

**Interfaces:**
- `ChannelOrder.soldAt: Date|null`, indexed with `{ channel: 1, soldAt: -1 }`.
- `completeOrder()` sets `soldAt` exactly once when payment succeeds.
- Backfill defaults to report-only; `--apply` writes only `{status:'sold', soldAt:null}` using existing immutable `updatedAt` snapshot.

- [ ] Add failing order test: successful completion stores `soldAt`; retry cannot change it.
- [ ] Run `node --test tests/orders.test.js`; verify `soldAt` assertion fails.
- [ ] Add schema field and set-once assignment immediately after successful Billz payment.
- [ ] Run focused order suite; verify pass.
- [ ] Add failing backfill test proving dry run writes nothing and apply never touches an existing `soldAt`.
- [ ] Run backfill test; verify missing script/module failure.
- [ ] Implement exported `backfillSoldAt({ apply, Model, now })` plus CLI wrapper. Never print customer fields.
- [ ] Run both suites and `git diff --check`.

### Task 3: Medicalka and Uzum Analytics Service

**Files:**
- Create: `channel/src/analytics/channelSales.js`
- Create: `channel/tests/channelSalesAnalytics.test.js`

**Interfaces:**
- `summarizeChannelSales({ channel, from, to, Model })`
- `listChannelSales({ channel, from, to, status, search, page, limit, Model })`
- Normalized row: `{ id, source, externalId, internalOrderId, billzOrderNumber, status, occurredAt, itemCount, totalAmount, items: [{ name, quantity, unitPrice, amount }], customer: { name, phoneMasked }, billzState }`.
- Summary: `{ grossRevenue, completedCount, averageCheck, unitsSold, returnedAmount: 0, cancelledCount, failedCount }`.

- [ ] Write failing table-driven tests with literal Medicalka/Uzum fixtures proving sold-only revenue, `soldAt` range, source isolation, item counts, cancelled/failed guards, phone masking, stable sort, search escaping, and pagination.
- [ ] Run `node --test tests/channelSalesAnalytics.test.js`; verify missing-module failure.
- [ ] Implement aggregation and list query. Require `soldAt` for revenue; legacy rows are handled only by Task 2 backfill.
- [ ] Run focused suite; verify pass.
- [ ] Mutation-check: changing `sold` to `reserved`, changing `$gte/$lt`, or returning full phone must fail at least one test.

### Task 4: Billz Inventory Analytics and Report Capability

**Files:**
- Create: `channel/src/analytics/billzInventory.js`
- Create: `channel/src/billz/reportCapability.js`
- Create: `channel/tests/billzInventoryAnalytics.test.js`
- Create: `channel/tests/billzReportCapability.test.js`

**Interfaces:**
- `summarizeInventory({ ProductModel, SyncLogModel, lowStockThreshold })`
- Inventory result: `{ physicalUnits, reservedUnits, pendingUnits, sellableUnits, estimatedRetailValue, skuCount, zeroStockSkuCount, lowStockSkuCount, lowStock: [{ billzProductId, name, sellableUnits }], syncedAt, freshness }`.
- `checkReportCapability({ client, force, now }) -> { state, checkedAt, reason }` where state is `available`, `report_access_required`, or `unavailable`; non-forced checks use a 15-minute in-memory TTL.

- [ ] Write failing inventory tests proving per-SKU `max(0, stock-reserved-pending)`, deleted products excluded, retail estimate explicitly named, sorted low-stock list, low/zero stock counts, and stale/unavailable freshness.
- [ ] Run inventory test; verify missing-module failure.
- [ ] Implement pure reduction over bounded Mongo aggregation output.
- [ ] Run focused suite; verify pass.
- [ ] Write failing capability tests: `403` on `/v2/order?limit=1&page=1` maps to `report_access_required`; 401/429/5xx/network map to transient `unavailable`; 200 maps only to `available` without parsing revenue; repeated checks inside 15 minutes reuse sanitized cached state.
- [ ] Run capability test; verify missing-module failure.
- [ ] Implement read-only check through existing Billz client and sanitize errors. Never return upstream response body.
- [ ] Run focused tests and `git diff --check`.

### Task 5: Channel-Hub Internal Analytics API

**Files:**
- Modify: `channel/src/routes/internal.js`
- Modify: `channel/src/db.js`
- Create: `channel/tests/internalAnalytics.test.js`

**Interfaces:**
- `GET /internal/analytics/channels/:channel/summary?preset=7d`
- `GET /internal/analytics/channels/:channel/sales?preset=7d&status=&search=&page=1&limit=25`
- `GET /internal/analytics/billz/inventory`
- `GET /internal/analytics/billz/capability`
- Only `medicalka` and `uzum` channel params are accepted.

- [ ] Write failing HTTP tests for valid summaries/lists, invalid channel, invalid preset, 90-day cap, limit clamp, masked phone, internal-token requirement, and sanitized failure.
- [ ] Run `node --test tests/internalAnalytics.test.js`; verify routes return 404.
- [ ] Mount handlers after existing `router.use(internalLimiter, requireInternalToken)` and reuse Task 1 parser.
- [ ] Keep `channelorders`/`billzproducts` as channel-owned models; do not add bot collections to writable allowlist.
- [ ] Run focused test, existing `tests/internalKeys.test.js`, and `tests/safety.test.js`.

### Task 6: `fairhaven.uz` Analytics and Normalized Admin API

**Files:**
- Create: `backend/services/salesAnalytics.js`
- Create: `backend/controllers/salesAnalyticsController.js`
- Create: `backend/tests/salesAnalytics.test.js`
- Create: `backend/tests/salesAnalyticsRoutes.test.js`
- Modify: `backend/routes/adminRoutes.js`
- Modify: `backend/utils/channelHub.js`
- Modify: `backend/controllers/adminOperationsController.js`
- Modify: `backend/tests/adminOperations.test.js`

**Interfaces:**
- `summarizeFairhavenSales({ from, to })`
- `listFairhavenSales({ from, to, status, search, page, limit })`
- Admin routes:
  - `GET /api/admin/sales/summary?source=fairhaven.uz|medicalka|uzum&preset=7d`
  - `GET /api/admin/sales/history?...`
  - `GET /api/admin/billz/summary?preset=7d`
  - `GET /api/admin/billz/history?...` returns unavailable contract while report access is absent.
- FairHaven revenue uses `delivered` history-event time; returns use `returned` history-event time; immutable `createdAt` is legacy fallback only when history is absent.

- [ ] Write failing service tests for delivered-event range, order created outside period but delivered inside, returned amount once, cancelled exclusion, legacy fallback flag, item totals, masking, search, and pagination.
- [ ] Run `node --test tests/salesAnalytics.test.js`; verify missing-module failure.
- [ ] Implement pure event extraction plus bounded Mongo queries.
- [ ] Run service suite; verify pass.
- [ ] Write failing route tests for source allowlist, session middleware placement, exact admin host, normalized channel-hub proxy response, partial source failure, Billz inclusion warning, and report-access state.
- [ ] Run route test; verify routes are missing.
- [ ] Implement controller/routes and append query strings through a URL builder in `channelHub`; never concatenate unvalidated raw paths.
- [ ] Extend dashboard response with three normalized source summaries plus separate Billz inventory/capability state; partial channel failure must not remove existing dashboard data.
- [ ] Add stale Billz inventory to existing dashboard attention payload with a `/billz` destination.
- [ ] Run focused route/security suites and `git diff --check`.

### Task 7: Secure Sales Excel Export

**Files:**
- Create: `backend/services/salesWorkbook.js`
- Create: `backend/controllers/salesExportController.js`
- Create: `backend/tests/salesWorkbook.test.js`
- Create: `backend/tests/salesExportRoute.test.js`
- Modify: `backend/routes/adminRoutes.js`
- Modify: `backend/middleware/rateLimit.js`

**Interfaces:**
- `buildSalesWorkbook({ source, summary, sales, generatedAt, freshness }) -> ExcelJS.Workbook`
- `safeCell(value)` prefixes formula-leading `=`, `+`, `-`, `@`, tab, and carriage-return text with `'`.
- `GET /api/admin/sales/export?...`
- `GET /api/admin/billz/export?...` returns report-access error until Billz sales are available.
- Maximum 5,000 sale rows and 20,000 item rows; one active export per admin Telegram id.

- [ ] Write failing workbook tests for Summary/Sales/Items sheets, formula neutralization, phone masking, integer money, timezone/freshness metadata, and row caps.
- [ ] Run workbook test; verify missing-module failure.
- [ ] Implement workbook builder with existing ExcelJS dependency.
- [ ] Run focused test; verify pass.
- [ ] Write failing route tests for authenticated download, 90-day cap, export rate limit, concurrency conflict `export_in_progress`, and no raw PII/secrets.
- [ ] Implement per-admin in-memory mutex released in `finally`, `adminExportLimiter`, filename, and response headers.
- [ ] Run focused export tests, `backend/tests/adminSecurity.test.js`, and `git diff --check`.

### Task 8: Admin Data API and Routing

**Files:**
- Create: `admin/src/api/analytics.js`
- Modify: `admin/src/api/client.js`
- Modify: `admin/src/app/navigation.js`
- Modify: `admin/src/app/App.jsx`
- Modify: `admin/src/app/App.test.jsx`
- Modify: `admin/src/ui/Icon.jsx`

**Interfaces:**
- `analyticsApi.summary(params)`, `history(params)`, `billzSummary(params)`, `exportSales(params)`, `exportBillz(params)`.
- New routes `/sales` and `/billz`.
- New navigation labels `Продажи` and `Billz` using existing SVG icon system.

- [ ] Add failing App test proving `/sales` and `/billz` resolve, navigation contains both labels, and source export uses same-origin credentials.
- [ ] Run focused App/API tests; verify route-not-found failure.
- [ ] Implement API helpers, download path, navigation, icons, and lazy-free page imports matching current small bundle pattern.
- [ ] Run focused tests and `git diff --check`.

### Task 9: Sales Page

**Files:**
- Create: `admin/src/features/sales/SalesPage.jsx`
- Create: `admin/src/features/sales/SalesPage.test.jsx`
- Create: `admin/src/features/sales/salesModel.js`
- Create: `admin/src/features/sales/salesModel.test.js`
- Modify: `admin/src/styles/features.css`

**Interfaces:**
- URL state: `source=fairhaven.uz|medicalka|uzum`, `period=1d|7d|30d`, `status`, `search`, `page`.
- Visible tabs exactly `fairhaven.uz`, `Medicalka`, `Uzum`.

- [ ] Write failing model tests for URL defaults, allowlists, status labels, money/date formatting inputs, and returned/failed guardrails.
- [ ] Run model test; verify missing-module failure.
- [ ] Implement model helpers; run focused test.
- [ ] Write failing component test for exact source tabs, KPI ledger, masked phone, history columns, URL-preserved filters, pagination, loading/error/empty states, and Excel download button accessible name.
- [ ] Run component test; verify missing-component failure.
- [ ] Implement dense desktop page using existing `Card`, `Badge`, `Button`, `Pagination`, `DataState`, `navigate`, and design tokens.
- [ ] Add only scoped `fh-sales-*` styles; no emoji icons or inline hardcoded colors.
- [ ] Run component/model tests and admin test suite.

### Task 10: Billz Page and Dashboard Integration

**Files:**
- Create: `admin/src/features/billz/BillzPage.jsx`
- Create: `admin/src/features/billz/BillzPage.test.jsx`
- Modify: `admin/src/features/dashboard/DashboardPage.jsx`
- Modify: `admin/src/features/dashboard/DashboardPage.test.jsx`
- Modify: `admin/src/styles/features.css`

**Interfaces:**
- Billz inventory KPIs remain visible even when report capability is unavailable.
- Revenue area renders `Требуется доступ Billz к отчётам` with no numeric fallback on `report_access_required`.
- Dashboard source cards label `fairhaven.uz`, Medicalka, Uzum and separately explain Billz whole-business inclusion.

- [ ] Write failing Billz page test for physical/reserved/pending/sellable stock, low/out counts, estimated retail label, freshness, report-access state, no fake revenue, and accessible unavailable panels.
- [ ] Run focused test; verify missing component.
- [ ] Implement Billz inventory page and capability state.
- [ ] Write failing dashboard test for exact source labels, separate Billz whole-business card, and double-count warning.
- [ ] Implement compact comparison without adding any totals together.
- [ ] Run focused tests and full admin suite.

### Task 11: Remove Generic Shop Copy

**Files:**
- Modify: `admin/src/features/settings/SettingsPage.jsx`
- Modify: `admin/src/features/parity/ParityPages.test.jsx`

**Interfaces:**
- User-visible FairHaven commerce label is `fairhaven.uz`.
- Technical terms unrelated to source naming are not mechanically rewritten.

- [ ] Add failing copy test rendering affected pages and asserting exact `fairhaven.uz` while excluding `/магазин/i`.
- [ ] Run focused test; verify current Settings copy fails.
- [ ] Replace user-visible generic copy surgically.
- [ ] Run `rg -n -i "магазин|интернет-магазин" admin/src --glob '!**/*.test.*'`; inspect each remaining match instead of blind replacement.
- [ ] Run focused and full admin suites.

### Task 12: Full Verification, Browser QA, and Opus Review

**Files:**
- Modify only files required by verified failures.

**Interfaces:**
- Local admin: `http://admin.localhost:5173/`
- Required final evidence: backend, channel, and admin tests; admin production build; browser QA; Opus review disposition.

- [ ] Run `node --test tests/*.test.js` in `backend`.
- [ ] Run `npm test` in `channel`.
- [ ] Run `npm run test:run` and `npm run build` in `admin`.
- [ ] Run root production build command and verify all three web surfaces compile.
- [ ] Restart exact local backend/admin processes only after resolving their PIDs; do not terminate unrelated Claude/Hermes sessions.
- [ ] Browser-check `/`, `/sales`, `/billz`, source tabs, filters, unavailable Billz report state, and Excel download at 1440px desktop width.
- [ ] Send scoped source diff and test output to Anthropic Opus 5 with tools disabled. Require findings ranked P0–P3 and accept changes only after local verification.
- [ ] Run final diff review for secrets, placeholders, unrelated edits, and generic shop copy.
- [ ] Do not commit, push, deploy, or change DNS.

## Deferred Activation: Whole-Billz Revenue

When Billz grants report access, create a new approved plan from a redacted real fixture. That plan must implement normalized completed sales and unique return events, bounded-window incremental sync, late-return rewalk or modified-since, low-priority analytics queueing, sync invariants, source attribution, revenue charts, history, and export. Until then, `report_access_required` is correct production behavior.
