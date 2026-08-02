# FairHaven Sales Channels and Billz Analytics Design

Date: 2026-08-02
Status: approved design, awaiting written-spec review
Target: desktop admin at `admin.fairhaven.uz`

## 1. Outcome

Admin must identify FairHaven's own commerce surface as `fairhaven.uz`. Generic
Russian labels such as `магазин`, `интернет-магазин`, and `правила магазина`
must not be used for that source.

Admin gains two focused work areas:

1. `Продажи` — operational history and comparison for `fairhaven.uz`,
   Medicalka, and Uzum.
2. `Billz` — separate whole-business analytics covering every sale Billz
   reports, including offline cashbox sales and all connected online channels.

Dashboard remains a concise overview. It does not become a second reporting
system or a duplicate of the two detailed pages.

## 2. Non-negotiable metric boundary

Billz total already includes online sales that were posted to Billz. Therefore:

- never add `fairhaven.uz + Medicalka + Uzum + Billz` into one grand total;
- label Billz as whole-business data, not another independent sales channel;
- use channel order records for per-channel operations;
- use Billz sale records for Billz-wide revenue and cashbox truth;
- expose reconciliation differences instead of hiding them.

This prevents double counting.

## 3. Information architecture

### 3.1 Navigation

Add:

- `Продажи` at `/sales`
- `Billz` at `/billz`

Keep existing `Обзор`, `Заказы`, `Товары`, and `Подключения`. `Заказы` remains
the fulfilment queue for `fairhaven.uz`; `Продажи` is read-only history and
analysis across sources.

### 3.2 Dashboard

Dashboard keeps attention queue, existing operational revenue chart, low-stock
risk, conflicts, and audit feed. Add a compact source comparison block for the
selected period:

- `fairhaven.uz`
- `Medicalka`
- `Uzum`

Each source shows completed revenue, completed orders, average check, and
failed/cancelled count. Billz gets a separate whole-business card with gross
revenue, net revenue, checks, and freshness. Card text states that Billz total
includes posted online-channel sales.

### 3.3 Sales page

`/sales` uses source tabs: `fairhaven.uz`, `Medicalka`, `Uzum`.

Shared controls:

- today, 7 days, 30 days;
- status filter;
- order/customer/product search;
- paginated history;
- Excel export of current filtered result.

Summary above table:

- completed revenue;
- completed sales count;
- average check;
- units sold;
- returned amount;
- cancelled count;
- failed count.

History columns:

- timestamp;
- source and external order id;
- internal/Billz number when present;
- status;
- item quantity;
- total amount;
- customer summary;
- Billz posting state/error.

Phone is masked in list view. Existing authorized order detail remains the
place for full customer data.

### 3.4 Billz page

`/billz` is visually and semantically separate from channel comparison.

Period KPIs:

- gross revenue;
- returned amount;
- net revenue = gross revenue minus returned amount;
- completed checks;
- average check = gross revenue divided by completed checks;
- units sold.

Current inventory KPIs:

- physical stock units;
- reserved units;
- pending units;
- sellable units = max(0, stock - reserved - pending), summed by SKU;
- estimated retail inventory value = current physical stock × retail price;
- zero-stock SKU count;
- low-stock SKU count;
- last successful catalogue sync.

Charts and lists:

- revenue time series using hourly buckets for today and daily buckets for
  7/30-day periods; current incomplete hourly bucket is visibly marked
  `неполный час` and never styled as a negative anomaly;
- source attribution bars: `fairhaven.uz`, Medicalka, Uzum, and
  `Billz касса / другое`;
- top sold products;
- low/out-of-stock products;
- Billz sale history with search, status/source filter, pagination, and Excel
  export.

Do not show profit or margin. Current mirror has retail price but no verified
cost basis, so those numbers would be false. Estimated retail inventory value
is labelled as a price-list estimate, never as cost, asset value, or profit.

## 4. Metric definitions

All normalized money is integer UZS after capability probe confirms Billz's
wire unit and conversion rule. All boundaries use Asia/Tashkent and half-open
ranges `[from, to)`.

### 4.1 `fairhaven.uz`

Source: backend `orders` collection.

- completed revenue: sum of final revenue-bearing statuses already defined by
  order workflow;
- completed count: count of those orders;
- revenue period: timestamp of the `delivered` status-history event, not order
  creation time;
- returns: amount is attributed to timestamp of the `returned` status-history
  event and reported separately;
- legacy orders without status history use `createdAt` as an explicitly marked
  fallback so they remain visible instead of disappearing from reports;
- cancelled orders never count as completed revenue.

### 4.2 Medicalka and Uzum

Source: channel-hub-owned `channelorders` collection.

- completed revenue: `totalAmount` where status is `sold`;
- completed count: orders where status is `sold`;
- revenue period: immutable persisted `soldAt`;
- existing sold records receive a one-time `soldAt = updatedAt` backfill before
  analytics is enabled; query-time fallback to mutable `updatedAt` is forbidden;
- reserved/received: operational pipeline only, excluded from revenue;
- cancelled and failed: separate guardrails;
- attribution: stored `channel` value, never inferred from customer text.

### 4.3 Billz

Source: completed and returned sales obtained from Billz's read API and
normalized by channel hub.

- gross revenue: completed sale totals before returns;
- returned amount: accepted Billz returns in the period;
- net revenue: gross minus returned;
- checks: unique completed sale ids;
- revenue period: Billz payment/completion timestamp confirmed by the
  capability probe, not draft creation time;
- source attribution: explicit marketplace comment/reference where available;
  unmatched sales become `Billz касса / другое`, never a guessed channel;
- current inventory: `billzproducts` mirror, not reconstructed from sales.

## 5. Data architecture

### 5.1 Ownership

Channel hub remains sole owner of:

- Billz credentials;
- Billz HTTP client and global rate limiter;
- `channelorders`;
- Billz analytics synchronization and normalized Billz sales.

Admin backend never receives a Billz token and never calls Billz directly.

### 5.2 Normalized Billz sales

Add a channel-hub-owned read model with a unique Billz sale id and normalized
fields required by this spec: timestamps, status, gross/return/net amounts,
items, shop/cashbox references, non-secret source reference, and sync metadata.

Synchronization is incremental, idempotent, rate-limited, and overlap-safe:

- unique upstream id prevents duplicates;
- modified-since is used when Billz supports it; otherwise a scheduled rolling
  re-walk revisits old sales so late returns cannot escape a creation cursor;
- backfill is split into bounded time windows and commits its cursor after each
  fully successful window, avoiding one bad page livelocking all history;
- overlap exceeds maximum page-walk duration so offset shifts cannot silently
  miss newly inserted rows;
- upsert updates returns/status changes;
- cursor advances only after a complete successful page walk;
- raw credential fields are never persisted;
- malformed/partial pages fail the run rather than publishing partial totals.

Upserts from an incomplete walk may exist, but every Billz surface remains
`stale` until the whole window completes and invariants pass. Analytics reads
run at lower queue priority than reservations, payments, and cancellations.
Persistent report-access denial is distinct from transient 401, 429, 5xx, and
network errors.

Exact upstream route and response mapping must be validated with a read-only
Billz capability probe before implementation. Public searchable documentation
was unavailable during design. If current credential lacks report access, the
system reports `Billz report access required`; it must not substitute channel
totals or manufacture an estimate.

The probe must pin and fixture-record:

- pagination model and stable ordering;
- payment/completion and modification timestamps, including timezone semantics;
- whether currency is UZS units, tiyin, or decimal;
- whether a return mutates a sale or arrives as a separate record;
- return-to-sale relationship and stable return id;
- modified-since support and report-access failure status.

Normalized gross amount always keeps the original completed sale. Returns are
stored separately or as unique child events according to the verified Billz
shape, so a fully returned sale cannot lose gross revenue and subtract the same
amount twice.

### 5.3 Internal API

Channel hub exposes authenticated, read-only internal endpoints for:

- channel summary by period;
- channel order history with strict filters and pagination;
- Billz summary/inventory health by period;
- Billz sales history with strict filters and pagination;
- Excel-ready bounded export data.

Admin backend proxies these through existing admin session, host, Origin, and
CSRF protections. Internal endpoints continue to require
`CHANNEL_INTERNAL_TOKEN` and never accept browser traffic directly.

### 5.4 Freshness and partial failure

Every payload carries `generatedAt`, source `syncedAt`, and freshness state.

- fresh: latest successful sync inside expected interval;
- stale: cached data exists but latest sync is old/failed;
- unavailable: no trustworthy snapshot exists.

UI keeps usable sources visible when one source fails. Failed source gets an
explicit state and last-success timestamp. No stale value is presented without
a stale label.

Each successful sync validates non-negative amounts, `net <= gross`, and
source-attribution sum against gross. A stale Billz source appears in the
dashboard attention queue instead of remaining a passive badge.

## 6. Excel export

Export reflects active source, period, search, and status filters. Workbook
contains:

1. `Summary` — metric definitions, values, range, timezone, generated time,
   and source freshness;
2. `Sales` — filtered rows;
3. `Items` — one row per sold item when available.

Protect spreadsheet consumers:

- sanitize cells beginning with formula characters;
- enforce row and file limits;
- cap filters to 90 days, rate-limit exports per session, and allow only one
  workbook generation per admin session at a time;
- never export credentials, raw request payloads, access tokens, cookies, or
  unmasked unnecessary PII; phone numbers stay masked exactly as in list view;
- fail clearly when requested range exceeds safe export limit.

## 7. UI behavior

- dense desktop layout with existing FairHaven design tokens;
- exact visible source label `fairhaven.uz` everywhere;
- no emoji structural icons;
- numerical values remain visible, not hover-only;
- charts include accessible text summaries and adjacent tables/lists;
- filters stay in URL so refresh/back/share preserve state;
- table loading uses skeleton rows;
- empty, stale, partial, permission-denied, and unavailable states are distinct;
- animations remain subtle and respect reduced motion.

## 8. Security and privacy

- admin session-only access remains mandatory;
- all new admin mutations, if any, keep exact Origin and CSRF enforcement;
- analytics endpoints are read-only and bounded;
- date ranges, channel, status, search length, page, and limit are allowlisted;
- page size has a hard maximum;
- report range has a hard 90-day maximum independent of UI presets;
- regex input is escaped;
- list responses minimize customer data and mask phone numbers;
- logs and audit records redact tokens, cookies, authorization, initData, and
  upstream raw secrets;
- Billz sync errors exposed to admins are sanitized and never include upstream
  authorization details.

## 9. Testing

Backend/channel tests must prove:

- period boundaries and Asia/Tashkent buckets;
- Billz timestamp timezone and currency-unit fixtures from capability probe;
- completed-only revenue;
- returns subtract once;
- fully returned sales retain gross once and subtract return once;
- cancelled/failed orders excluded from revenue;
- Medicalka/Uzum isolation;
- Billz totals are not added to channel totals;
- incremental sync idempotency and late-update overlap;
- bounded-window cursor progress after earlier successful windows;
- operational Billz writes win queue priority over analytics reads;
- partial upstream walk does not publish partial totals;
- pagination/filter bounds;
- PII and secret redaction;
- Excel formula-injection protection.

Frontend tests must prove:

- exact `fairhaven.uz` source label;
- no generic `магазин` copy remains in admin UI;
- channel tabs and period controls preserve URL state;
- Billz inclusion warning is visible;
- fresh/stale/unavailable states are distinguishable;
- tables, charts, and exports expose accessible names.

Final verification includes full backend, channel, and admin test suites,
production builds, and localhost browser checks at 1440px desktop width.

## 10. Rollout

1. Validate Billz read capability without writes.
2. Add normalized read model and internal APIs behind no public route.
3. Backfill Billz period history in bounded pages.
4. Verify totals against Billz UI for fixed sample days.
5. Add admin backend proxies and tests.
6. Add `Продажи`, `Billz`, and dashboard source block.
7. Enable UI only after a trustworthy snapshot exists.

No production deploy, DNS change, commit, or push is part of this design task.

## 11. Success criteria

- operator can distinguish `fairhaven.uz`, Medicalka, and Uzum without generic
  shop wording;
- operator can inspect and export each channel's real sales history;
- Billz page shows whole-business revenue and stock with clear freshness;
- displayed totals do not double count Billz and channel sales;
- missing Billz report access produces an honest unavailable state;
- existing admin security and all regression suites remain green.
