# Medicalka Immediate Sale Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to
> implement this plan task by task. Use `superpowers:test-driven-development`
> before every production-code change and
> `superpowers:verification-before-completion` before completion claims.

**Goal:** Make one authenticated Medicalka order request create exactly one
completed Billz sale before Fairhaven returns success, while preserving every
currently active Medicalka token and secret.

**Architecture:** `ChannelOrder` remains canonical. `(channel, externalId)`
deduplicates marketplace deliveries. Durable Mongo operation metadata prevents
concurrent Billz writes and converts stale/unknown operations into manual
reconciliation instead of replay. Medicalka route waits for reservation and
payment, then returns its stable integer order id. The existing `Sales →
Medicalka` ledger surfaces the outcome.

**Tech stack:** Node.js 20+, Express, Mongoose/MongoDB, native `node:test`, fake
Billz client, in-memory MongoDB.

> **Superseding scope note (2026-08-20):** The Telegram notification/card work
> described below is not a Medicalka immediate-sale deliverable. Creating a
> Medicalka order does not send Telegram, and approval remains solely in the
> Medicalka cabinet before its outbound `POST`. The existing `Sales → Medicalka`
> view remains the required Fairhaven visibility; no Fairhaven approve/reject UI
> is introduced. This note supersedes only those outdated Telegram promises and
> preserves the plan's task history.

**Worktree:**
`/Users/tm/.config/superpowers/worktrees/fairhaven-vitamin-delivery/medicalka-immediate-sale`

**Safety constraints:** Never call live Medicalka order, Billz write, Telegram
send, or production mutation. Keep `BILLZ_WRITE_ENABLED=false`. Do not issue,
rotate, revoke, re-hash, or change format/query names for Medicalka credentials.

## Task 1: Stop blind retries of Billz writes

**Files:**

- Create: `channel/tests/billzWriteRetry.test.js`
- Modify: `channel/src/billz/client.js`

### Step 1: Write failing client tests

Use a fresh module load with `BILLZ_WRITE_ENABLED=true`, fake auth, fake limiter,
and stubbed `global.fetch`.

Cover:

- GET network/5xx failures retain bounded retries.
- POST network failure calls `fetch` once and throws `BillzError` with
  `outcomeUnknown=true`.
- POST 5xx calls `fetch` once and reports unknown outcome.
- POST 429/explicit 4xx calls `fetch` once and reports retry-safe rejection.
- POST 401 may invalidate auth and retry once because server rejected request
  before applying it.
- No error or provider body leaks credentials.

### Step 2: Verify RED

Run:

`NODE_PATH='/Users/tm/Projects/project vitamin delivery/channel/node_modules' node --test tests/billzWriteRetry.test.js`

Expected: failures showing current POST retry loop and missing error metadata.

### Step 3: Implement minimum classification

In `client.js`:

- Detect read versus non-idempotent write methods.
- Preserve existing retry ladder for reads.
- For writes, never retry network errors or 5xx responses.
- Preserve one 401 re-authentication retry.
- Attach explicit `outcomeUnknown` and `retrySafe` booleans to `BillzError`.
- Keep write-disable guard unchanged.

### Step 4: Verify GREEN and regression

Run new test, then `tests/safety.test.js` and `tests/sale.test.js` sequentially.

### Step 5: Commit

Commit message: `fix(channel): stop retrying uncertain Billz writes`

## Task 2: Add durable per-order Billz operation guard

**Files:**

- Modify: `channel/src/models/ChannelOrder.js`
- Modify: `channel/src/core/orders.js`
- Modify: `channel/tests/orders.test.js`
- Modify: `channel/tests/counters.test.js`

### Step 1: Write failing concurrency and recovery tests

Add deferred fake Billz calls proving:

- two parallel `reserveOrder` calls create one draft and apply `reservedQty`
  once;
- two parallel `completeOrder` calls post one payment and release counter once;
- two parallel cancellation calls release/delete one draft once;
- unknown reserve result blocks every automatic retry;
- failure with a known draft id preserves that id and requires reconciliation;
- explicit pre-effect failure unlocks order and permits safe retry;
- explicit payment rejection keeps order reserved and permits retry against same
  draft without creating another draft;
- stale in-progress operation becomes reconciliation-required and is not taken
  over.

### Step 2: Verify RED

Run `tests/orders.test.js`. Expected: newly added parallel reserve, payment, and
cancellation assertions expose current duplicate Billz calls and counter drift.

### Step 3: Extend schema surgically

Under `billz`, add:

- operation action;
- unique operation token;
- operation start timestamp;
- reconciliation-required flag.

Defaults must deserialize old orders safely. Do not change credential models or
indexes.

### Step 4: Implement atomic claim/release helpers

Use `findOneAndUpdate` compare-and-set against empty operation token and allowed
status. Generate lease token with `crypto.randomUUID()`.

Rules:

- only lease owner may persist success/failure;
- concurrent worker receives an explicit in-progress error;
- stale lease is marked reconciliation-required, never reused;
- unknown Billz outcome or known external draft after partial failure requires
  reconciliation;
- safe rejection clears lease;
- successful transition clears lease.

### Step 5: Guard reserve, complete, and cancel

Apply same durable guard to all three core writes. Keep existing status and
counter semantics. On explicit payment rejection, keep `reserved`; on unknown
payment result, set `failed` plus reconciliation flag. Do not add automatic
cleanup that could create another uncertain write.

### Step 6: Verify GREEN and regression

Run `tests/orders.test.js`, `tests/counters.test.js`, `tests/botOrders.test.js`,
and `tests/uzumContract.test.js` sequentially.

### Step 7: Commit

Commit message: `fix(channel): serialize Billz order operations`

## Task 3: Make Medicalka order creation an immediate sale

**Files:**

- Modify: `channel/src/core/orders.js`
- Modify: `channel/src/adapters/medicalka/routes.js`
- Modify: `channel/tests/medicalkaOrders.test.js`

### Step 1: Rewrite contract tests first

Instrument fake `reserveOrder` and `completeSale`.

Cover:

- valid POST does not respond until reserve and payment finish;
- stored order is `sold` before HTTP 200;
- response contains same integer `wc_order_id` and `status: accepted`;
- sequential and parallel duplicates produce one draft and one payment;
- duplicate sold order returns identical response;
- in-progress duplicate waits for bounded stored outcome and never calls Billz;
- retry-safe upstream failure returns non-success without leaking message;
- reconciliation-required outcome returns temporary failure and never retries;
- active pre-existing order secret still authenticates POST;
- active pre-existing read token still reads catalogue;
- paid/payment-confirmed after immediate sale remains idempotent;
- cancellation after sale remains rejected as return-required behavior.

### Step 2: Verify RED

Run `tests/medicalkaOrders.test.js`. Expected failures against the prior
non-immediate-sale response behavior.

### Step 3: Add incoming-sale orchestrator

Add one core function that:

- returns immediately when order already sold;
- reserves only when no draft exists;
- completes payment only from a recorded reservation;
- observes atomic-operation errors and waits/polls stored state for a bounded
  time;
- never crosses reconciliation-required state;
- returns sanitized outcome classification to adapter.

### Step 4: Change Medicalka route

After validation, idempotent accept, and public-id allocation:

- await incoming-sale orchestrator;
- return HTTP 200 only for stored `sold` outcome;
- return stable sanitized 502/503 integration errors otherwise;
- return `accepted` with stable `wc_order_id` on success;
- keep token/secret middleware and key storage untouched.

### Step 5: Verify GREEN

Run `tests/medicalkaOrders.test.js`, then `tests/medicalkaContract.test.js`,
`tests/medicalkaImages.test.js`, `tests/medicalkaTaxCodes.test.js`, and
`tests/rateLimit.test.js` sequentially.

### Step 6: Commit

Commit message: `feat(medicalka): complete sale before accepting order`

## Task 4: Surface reconciliation safely in the existing admin ledger

**Files:**

- Modify: `channel/src/analytics/channelSales.js` only if normalization needs
  reconciliation state
- Modify: `channel/tests/channelSalesAnalytics.test.js`
- Modify: `admin/src/features/sales/salesModel.js` only if a new public status is
  unavoidable; prefer existing `failed` status.

### Step 1: Write failing visibility tests

Prove:

- failed/reconciliation record appears in existing Medicalka ledger without raw
  Billz response data;
- sold record contributes revenue; failed record does not;
- customer address and unmasked phone remain absent from analytics response.

### Step 2: Verify RED

Run channel-sales analytics tests.

### Step 3: Implement minimum presentation change

Keep existing page and navigation. Reuse existing `failed` status and Billz
error badge in the Sales → Medicalka ledger unless test proves a missing mapping.
No approve/reject/retry buttons and no Medicalka creation Telegram work.

### Step 4: Verify GREEN

Run channel analytics, backend sales analytics, and admin SalesPage tests
sequentially. Run admin build only if admin source changed.

### Step 5: Commit

Commit message: `feat(channels): expose Medicalka sale reconciliation`

## Task 5: Update integration docs without changing credentials

**Files:**

- Modify: `docs/integrations/medicalka-api.ru.md`
- Modify: `docs/integrations/fairhaven-api-primer.ru.md`
- Modify: `docs/ARCHITECTURE.uz.md`

### Step 1: Update lifecycle text

Document:

- Medicalka approval happens before POST reaches Fairhaven;
- incoming order is synchronously sold before success;
- duplicate requests return same id and do not duplicate sale;
- `paid` later is idempotent compatibility call;
- post-sale cancellation requires future return/refund flow;
- active token and secret values remain valid and unchanged.

Do not include any real key, password, token fingerprint, or production payload.

### Step 2: Verify docs

Search changed docs for stale pre-immediate-sale lifecycle claims and for
credential-like strings. Run `git diff --check`.

### Step 3: Commit

Commit message: `docs: describe Medicalka immediate sale contract`

## Task 6: Full local verification, review, and delivery

**Files:** no production changes expected.

### Step 1: Run full channel suite sequentially

Because repository tests mutate process-global stubs, execute test files one at
a time with `NODE_PATH` pointing to existing channel dependencies. Record exact
pass/fail counts.

### Step 2: Run adjacent suites

- Run `node --test tests/analyticsQuery.test.js tests/salesAnalytics.test.js
  tests/salesAnalyticsRoutes.test.js tests/salesExportRoute.test.js
  tests/salesWorkbook.test.js` from `backend/`.
- Run `npm run test:run -- src/api/analytics.test.js
  src/features/sales/salesModel.test.js
  src/features/sales/SalesPage.test.jsx` from `admin/`.
- Admin production build if admin source changed.
- `git diff --check`.
- `git status --short`.
- Secret scan over changed files.

### Step 3: Request code review

Use `superpowers:requesting-code-review`. Resolve only evidence-backed findings,
using `superpowers:receiving-code-review` before applying review changes.

### Step 4: Final verification

Use `superpowers:verification-before-completion`. Re-run focused race,
Medicalka, safety, analytics, and admin Sales suites after review.

### Step 5: Guardrail audit

Confirm:

1. Assumptions surfaced, not silently chosen.
2. Minimum code; no Fairhaven approval UI or Medicalka-side work.
3. Every changed line traces to immediate sale, idempotency, visibility, docs,
   or credential compatibility.
4. Named success criteria are proven by fresh test output.

### Step 6: Commit and push

Commit remaining verification-only adjustments if any. Push
`codex/medicalka-immediate-sale` to configured remote. Do not deploy, restart
production, enable Billz writes, or send a live order.
