# Medicalka inbound pharmacy integration design

Date: 2026-08-22

## Goal

FairHaven must expose Medicalka-compatible catalogue and stock data, receive Medicalka pharmacy approval requests, and let authorised FairHaven admins act from either the existing admin panel or Telegram. Both surfaces must use one idempotent decision path. Paid Medicalka sub-orders must enter the existing Billz sale pipeline exactly once.

## Non-negotiable constraints

- Existing Medicalka catalogue token and order secret remain valid. No key issue, rotation, revocation, migration, or endpoint URL change is part of this work.
- Legacy order writes and partner paid sub-orders are mutually exclusive. Enabling partner sales requires the legacy sender to be confirmed off and the legacy write gate disabled; catalogue and inventory access stays available through the same existing key.
- No live Medicalka order, approval, rejection, Telegram message, or Billz write is used for testing.
- Medicalka's current partner API in `api-reference.md` is authoritative for inbound authentication, approvals, sub-orders, and status rules.
- Medicalka's pharmacy requirements are authoritative for the outbound catalogue and inventory fields. Compatibility aliases may remain where Medicalka already accepts them.
- Existing FairHaven admin `User.role === "admin"` is the only Telegram authority source. No second allow-list.
- Approval never decrements Billz. A paid sub-order is the sale boundary.

## Current fault

FairHaven production returns 25 positive inventory rows, but Medicalka's internal `/stock/products` returns zero rows. Medicalka imported 26 external product mappings, each with `stocks: []`. Nginx proves Medicalka polls FairHaven catalogue and inventory successfully with HTTP 200. Therefore stock is lost inside Medicalka import, not in Billz or FairHaven authentication.

Payload conflict explains the rejection: current FairHaven inventory sends decimal strings and omits `base_price`, while Medicalka's pharmacy requirements require integer `quantity`, decimal-number `base_price` and `price`, and `ikpu_code` on products.

## Architecture

### 1. Outbound compatibility API

Keep `/medicalka/v1` and current authentication unchanged.

- Products keep stable integer IDs and existing fields, add `ikpu_code` beside accepted compatibility field `ikpu`, and emit numeric price.
- Inventory emits only sellable rows with integer `product_id`, integer `pharmacy_id`, integer `quantity`, numeric `base_price`, numeric `price`, and boolean `is_available`.
- `base_price` uses configured Medicalka old price when it exceeds sale price; otherwise sale price.
- Contract tests use hand-written literal payloads from Medicalka requirements.

### 2. Medicalka partner client

Channel hub owns partner API integration.

- Credentials enter only through environment variables.
- Sign-in happens in memory. Access token and rotated refresh token never enter logs or MongoDB.
- One single-flight refresh handles concurrent 401 responses.
- Network calls use bounded timeout, response-size limits, safe error messages, and retry only read operations or explicitly retry-safe responses.
- Invalid refresh credentials fall back to one single-flight sign-in; failed authentication is rate-bounded.
- Production base URL is HTTPS. Tests may point to a loopback fake server.

### 3. Approval synchroniser

Non-overlapping poll every 5 seconds:

1. Fetch partner pharmacies.
2. Fetch pending approval rows for every linked pharmacy.
3. Upsert by Medicalka approval ID.
4. Preserve raw input plus normalised customer, delivery, items, subtotal, timestamps, and source flags.
5. Notify only once for a newly observed actionable approval.
6. Periodically reconcile accepted, rejected, and cancelled history so actions made in Medicalka's own panel also appear locally.

Three-minute countdown is informational. `requires_action`, `checkout_is_active`, current Medicalka status, and respond API result remain authoritative.

### 4. Single decision service

Admin panel and Telegram call the same channel-hub internal endpoint.

- Atomic claim allows one in-flight action.
- Same completed action is idempotent.
- Opposite completed action returns conflict.
- Medicalka `accepted` or `rejected` is sent once per claimed operation.
- A transient failure clears claim and preserves pending state.
- An ambiguous or already-decided response triggers read reconciliation before any retry.
- Expired action leases reconcile against Medicalka and never blindly resend a decision.
- Actor type, Telegram ID, display name, action, comment, and time are audited.

### 5. Telegram

New approval is sent as a direct bot message to each current FairHaven admin. Channel hub reads only `telegramId` and `role` through a read-only `users` collection facade.

- Message contains checkout number, items, quantities, prices, total, delivery type, customer, and remaining-action hint.
- Inline buttons: accept and reject.
- Reject requires a second confirmation callback to prevent accidental taps.
- Every callback re-reads `User` and requires `role: "admin"`; a demoted user cannot act from an old message.
- Callback data contains only local approval ID and action, never credentials or customer data.
- Final action edits all delivered admin messages and removes buttons.
- Each message stores finalization attempts and completion; failed edits retry on later polls without reopening the decision.
- Telegram delivery/finalization runs in a bounded persisted worker with exponential backoff. Failed delivery to one admin does not block other admins or approval sync.

### 6. Existing FairHaven admin panel

Medicalka remains inside existing `Orders` workspace, not a new sidebar product.

- Source tabs separate FairHaven orders and Medicalka approvals/sub-orders.
- Pending approvals show countdown, source status, full line items, totals, delivery, and customer details.
- Accept and reject use confirmation dialogs; reject comment is optional up to Medicalka's 500-character limit.
- Final rows show actor and source-of-truth status.
- Paid sub-orders expose only status actions allowed by delivery type and current Medicalka status.
- Stale data stays visible with explicit sync error; panel never replaces unavailable data with zero.

### 7. Paid sub-orders and Billz

Approval creates no sale. Poll paid sub-orders separately.

- Paid sub-order lists use the contract's repeated `pharmacy_ids` parameter and are discovery only; every action uses a fresh full detail payload normalised and mapped back to stable FairHaven product IDs.
- Existing `ChannelOrder` uniqueness on `(channel, externalId)` and Billz operation fencing remain sale idempotency boundary.
- Billz completion occurs once when Medicalka reports paid processing order.
- Medicalka cancellation/refund releases only a known reservation or records reconciliation-required state; uncertain Billz results never auto-retry.
- Active polling stays fast; every documented terminal status is reconciled on a separate bounded 180-day history cadence configurable to Medicalka's return policy.
- The Medicalka projection stores the `ChannelOrder` link before Billz completion and repairs itself from authoritative `ChannelOrder` state after a crash.
- Status, cancellation, and fiscal-label writes use durable operation claims. Ambiguous results reconcile against fresh detail; unresolved results are fenced for manual reconciliation.
- Pickup may move to delivered/completed from panel. Delivery may move to shipped only after required fiscal labels; delivered stays Medicalka/courier-owned.

If Medicalka sub-order detail lacks a stable external FairHaven product identifier, automatic Billz write is blocked and surfaced for reconciliation instead of guessing by name.

## Data ownership

New channel-hub-owned collection `medicalkaapprovals` stores approval snapshots, action lease, audit actor, sync state, and Telegram message references. Paid orders continue in existing `channelorders`. Backend owns admin users and sessions; channel hub gets read-only admin identity access only.

## Failure handling

- Poll overlap: skipped.
- Authentication failure: health state degraded; no key mutation.
- Medicalka unavailable: last good approvals remain visible.
- Duplicate notification: prevented by persisted notification state.
- Concurrent decisions: one atomic winner.
- Expired request: reconciled and buttons removed.
- Telegram unavailable: approval still visible and actionable in admin panel.
- Admin panel unavailable: Telegram action still uses same service.
- Billz uncertainty: reconciliation required; no blind retry.

## Verification

- Contract tests for exact stock/product types and fields.
- Fake Medicalka server tests for sign-in, refresh rotation, polling, pagination, timeout, duplicate rows, accept/reject, conflict, and reconciliation.
- Mongo integration tests for atomic decision and restart-safe notification state.
- Backend tests prove non-admin Telegram callbacks cannot act.
- Admin component tests cover pending, expired, stale, success, conflict, and delivery-status rules.
- Local browser E2E against fake services.
- Full channel, backend, and admin regression suites.
- Final diff audit proves no credential issue/revoke path changed.

## Deployment boundary

Code, tests, commit, and Git push are in scope. Production deployment, adding partner credentials to server environment, enabling Medicalka inbound polling, enabling branch `accepting_orders`, and first live approval each require deployment-time operator confirmation.
