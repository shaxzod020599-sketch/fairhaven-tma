# Medicalka Immediate Sale Design

## Decision

Medicalka owns pharmacy approval and rejection. Fairhaven does not duplicate
that decision.

An authenticated `POST /medicalka/v1/orders` means Medicalka has already
approved the order. Fairhaven must record one completed Billz sale before it
returns a success response. If no request reaches this endpoint, Fairhaven does
nothing.

## Production evidence

This is read-only pre-implementation evidence, not deployment, a live order, or
live Billz-write verification.

Read-only checks on 2026-08-20 established:

- `api.fairhaven.uz` routes `/medicalka/v1/` to the running channel hub.
- Medicalka successfully polls pharmacies, products, and inventory.
- The complete retained Nginx log set contains zero requests whose path is
  `/medicalka/v1/orders`.
- Production runs commit `df99cb6` with `BILLZ_WRITE_ENABLED=false`.
- The current local contract suite accepts a correctly authenticated fake
  Medicalka order.

Therefore the current test-request failure occurs before Fairhaven's order
handler. Medicalka must trigger or configure its outbound order call. The
Fairhaven change below makes the handler correct and safe once that call arrives.

## In scope

- Keep Medicalka token/secret authentication and current payload validation.
- Preserve every currently active Medicalka token and secret. The change does
  not issue, rotate, revoke, re-hash, or change the format or query-parameter
  names of existing credentials. Previously revoked test keys stay revoked.
- Treat incoming Medicalka orders as already-approved sales.
- Complete Billz reservation and payment synchronously before HTTP success.
- Make duplicate and concurrent deliveries idempotent.
- Stop blind retries of non-idempotent Billz writes.
- Use the existing `Sales -> Medicalka` ledger; it already reads `ChannelOrder`
  records and supports all channel statuses.
- Keep the status endpoint for compatibility and future cancellation/return work.

## Out of scope

- Medicalka pharmacy-panel behavior.
- A second Fairhaven approval or rejection action.
- A Fairhaven approval timeout or pre-approval stock hold.
- Production deployment, restart, or enabling Billz writes.
- Automatic Billz return/refund after a completed sale.
- Live test orders or live stock movement.

## Request flow

1. Medicalka calls `POST /medicalka/v1/orders` with its active secret.
2. Fairhaven validates `order_id`, products, quantities, and current channel
   catalogue mapping. Prices always come from Fairhaven's catalogue.
3. Fairhaven upserts one `ChannelOrder` by `(channel, externalId)` and allocates
   one stable integer `wc_order_id`.
4. An atomic Mongo operation guard allows only one worker to touch Billz for the
   order. Concurrent duplicates observe the same record and never start another
   Billz operation.
5. Fairhaven creates and prices one Billz draft, reserves its lines, records the
   Billz draft id, then posts payment using the configured Medicalka payment
   type.
6. Only after Billz payment succeeds does Fairhaven mark the order `sold` and
   return HTTP 200 with the same `wc_order_id` and Medicalka-compatible
   `accepted` status.
7. Existing `Sales -> Medicalka` shows the sold row without a new page or
   approval control. Creating the order does not send a Telegram notification.

## Idempotency and operation guard

`ChannelOrder.billz` gains durable operation metadata: current action, unique
lease token, start time, and whether reconciliation is required.

- A sold duplicate returns the stored successful response without Billz calls.
- A concurrent duplicate cannot acquire the operation guard. It waits for the
  first request's stored outcome for a bounded period, then returns a temporary
  error if the outcome is still unknown.
- A stale in-progress operation is never replayed automatically. It is marked
  for reconciliation because the process may have stopped after Billz changed
  state but before Mongo recorded the response.
- The unique `(channel, externalId)` index remains the first idempotency layer;
  the Billz operation guard is the second.

## Billz failure classification

Billz GET requests may retain bounded automatic retries. Non-idempotent POST,
PUT, PATCH, and DELETE requests must not retry after network failure or a 5xx
response because the previous attempt may already have changed Billz.

- Explicit rejection before any Billz effect: store a retry-safe failure and
  return a non-success response.
- Failure after a draft id is known: preserve the id and require reconciliation
  unless the next action is provably safe on that same draft.
- Network failure, timeout, or 5xx during a write: mark reconciliation required;
  never create another draft or post another payment automatically.
- Explicit payment rejection while the order is still reserved: preserve the
  reservation and allow a later safe payment retry against the same draft.
- `BILLZ_WRITE_ENABLED=false`: fail closed. Never return order success.

Failure responses expose a stable integration error, not Billz credentials,
raw provider responses, or stack traces.

## Compatibility status endpoint

- `paid` and `payment_confirmed` against an already sold order are idempotent and
  return the existing `wc_order_id` with `processing`.
- `received` and `accepted` remain no-op acknowledgements.
- Cancellation before sale keeps the existing draft-release behavior.
- Cancellation after sale remains rejected. It is a return/refund and will be
  implemented as a separate accounting flow.

## Admin visibility

No new navigation or approval UI is needed. Existing `Sales -> Medicalka`
already queries channel orders, lists `received`, `reserved`, `sold`,
`cancelled`, and `failed`, and shows Billz state.

Fairhaven has no approval or rejection UI. Medicalka order creation does not
post or edit a Telegram card; Medicalka approval is not a Telegram action.

## Verification

All verification uses an in-memory MongoDB plus fake Billz. No production or
third-party write credentials are present.

Required tests:

- valid order is reserved and paid before HTTP 200;
- returned `wc_order_id` is a stable integer and status is `accepted`;
- sequential duplicate produces one draft and one payment;
- parallel duplicates produce one draft and one payment;
- successful duplicate returns the original response;
- Billz failure prevents HTTP success;
- write-disabled mode prevents HTTP success;
- an existing active read token still reads catalogue endpoints and an existing
  active order secret still authenticates the changed order endpoint;
- network/5xx write failure is not automatically retried and requires
  reconciliation;
- payment rejection preserves one draft and never creates a second one;
- successful order appears in Medicalka sales analytics;
- failed order remains visible in the same ledger;
- existing bot, Uzum, Medicalka contract, analytics, and Billz safety suites
  remain green.

## Rollout boundary

Implementation will be committed and pushed from an isolated Codex worktree.
It will not be deployed automatically. Production deployment and changing
`BILLZ_WRITE_ENABLED` require a separate explicit operator decision because that
enables real stock movement and sales.

After deployment, Medicalka must send an actual outbound order request. Until
that happens, Fairhaven cannot create or display a Medicalka sale; current logs
prove no such request reaches the service.
