# Medicalka Partner Lifecycle and Admin Settings Design

## Decision

Fairhaven will use two Medicalka integration directions without breaking either:

- Medicalka continues reading Fairhaven catalog and inventory through the
  existing token-protected `/medicalka/v1` feed. Existing token and secret
  records remain valid and unchanged.
- Fairhaven uses Medicalka's authenticated partner API to receive checkout
  approvals and paid sub-orders. This partner API is authoritative for the
  pharmacy lifecycle after checkout.

Checkout approval is the only Fairhaven decision before payment. After an
approval is accepted, customer payment and delivery orchestration belong to
Medicalka. Fairhaven observes those states, notifies operators, performs one
idempotent Billz sale only in explicitly enabled production mode, and exposes
the documented pharmacy actions for fulfilment.

This design supersedes the inbound-lifecycle and immediate-sale decisions in
`2026-08-20-medicalka-immediate-sale-design.md`. The old token and secret wire
contracts stay compatible, but order creation alone no longer means payment.

## Source contracts

Three supplied documents describe complementary boundaries:

- `api-reference.md` is the authoritative partner API contract. It defines
  checkout approvals, post-payment sub-orders, delivery/pickup status
  ownership, fiscal labels, and pharmacy cancellation.
- `pharmacy-integration-requirements-v2 (2).docx` defines the business
  lifecycle: pharmacy approval, customer payment, preparation, courier or
  pickup fulfilment, completion, and refund handling.
- `medicalka_integration_guide.md (2).docx` describes the legacy Fairhaven-hosted
  catalog, inventory, order, and status endpoints. Those endpoints remain
  compatible while the partner API becomes the canonical inbound source.

Where list and detail payloads differ, sub-order detail is authoritative. The
2026-08-25 staging test proved why: the list row reported a cancelled payment,
while `GET /orders/sub-orders/{id}` reported `payment_status=paid`,
`status=cancelled`, delivery provider `noor`. Every material sub-order ingestion
must therefore load detail before accounting or notification decisions.

## Connection profiles

The existing admin `Connections` page gains a Medicalka partner section. It
manages two fixed profiles:

- `staging` maps only to `https://api.staging.medicalka.com/api/v1`;
- `production` maps only to `https://api.medicalka.com/api/v1`.

Operators cannot enter an arbitrary URL. Each profile stores Medicalka username
and password encrypted at rest with AES-256-GCM. A dedicated
`MEDICALKA_CREDENTIALS_ENCRYPTION_KEY` environment secret derives the encryption
key. Ciphertext contains a random IV and authentication tag. Raw credentials
never appear in GET responses, logs, audit records, Telegram, or health data.

The admin API returns environment, masked username, password-configured flag,
pharmacy count, processing mode, last validation timestamp, current sync
health, and sanitized error code. Updating a profile requires an authenticated
admin-host session and CSRF token. The channel hub validates credentials with
`signin` and `GET /companies/pharmacies` before saving. Validation failure leaves
the previously working profile and active runtime unchanged.

The selected environment and processing mode are durable. Changing environment
is refused while the current profile has an in-progress approval decision or
Billz operation. A successful switch stops old timers, activates a new scoped
runtime context, and starts polling without process restart.

## Environment isolation

Production keeps the current `medicalkaapprovals` and `medicalkasuborders`
collections so existing history and Telegram callback IDs remain valid.
Staging uses dedicated collections. Switching to staging can never close,
overwrite, notify from, or reconcile production records.

Each runtime context owns:

- one partner client and token cache;
- one approval service and scoped approval model;
- one sub-order service and scoped sub-order model;
- independent polling, history, notification, and health state.

Only the active context is exposed through internal admin routes. A context
finishing an already-started read after a switch may update only its own scoped
collections.

## Processing modes

Two modes exist:

- `observe`: poll approvals and sub-orders, store full lifecycle, update admin
  UI and Telegram, but never create a Billz sale;
- `live`: same observation plus one idempotent Billz sale for a mapped paid
  sub-order.

Staging is permanently forced to `observe`. Production starts in `observe` and
can enter `live` only through a separate explicit admin switch. `live` also
requires the existing global `BILLZ_WRITE_ENABLED=true`; both gates must be open
before a Billz mutation. Turning either gate off immediately returns to
observation without deleting state.

## Lifecycle

### Checkout approval

1. Poll `GET /orders/pharmacy-approvals?status=pending` every five seconds.
2. Store a scoped, idempotent approval snapshot.
3. Send the approval card to every current Fairhaven admin privately and to the
   configured operations channel.
4. Buttons remain visible in both places, but the backend callback authorizes
   the Telegram user against the current Fairhaven admin list.
5. First accepted or rejected response wins. Fairhaven sends exactly one PATCH
   to Medicalka and reconciles uncertain outcomes from history.
6. Every stored Telegram copy is edited in place when the approval closes.

Approval never changes Billz stock.

### Payment and fulfilment

1. Poll documented open and terminal sub-order statuses.
2. Load `GET /orders/sub-orders/{id}` before storing any changed row.
3. Preserve `payment_status`, pharmacy status, delivery type, delivery provider,
   delivery-service status, fiscal-label progress, and source timestamps.
4. Show all sub-orders in the existing Medicalka order workspace.
5. Post one operations-channel card per sub-order and edit it when payment,
   pharmacy status, courier status, or Billz projection changes.

No second Fairhaven approval exists after payment.

For delivery, courier integrations own `shipped` and `delivered`; Fairhaven
observes them. The pharmacy may scan required DataMatrix labels and cancel an
eligible processing order, but does not manually mark delivery completion.

For pickup, pharmacy staff may mark `delivered` or `completed` after handing the
order to the customer. Fiscal-label upload is not offered for pickup.

### Billz sale

A detailed sub-order qualifies for sale only when:

- active environment is production;
- profile mode is `live`;
- global Billz write flag is enabled;
- `payment_status=paid`;
- pharmacy status is an active fulfilment status;
- every Medicalka product maps unambiguously to one Billz product.

The canonical Medicalka sale key is parent `order_id` when present, otherwise
sub-order ID. This lets partner polling and a duplicate legacy order callback
converge on the same `ChannelOrder`. Existing atomic Billz operation leases and
the `(channel, externalId)` unique index guarantee one sale.

Legacy `POST /medicalka/v1/orders` records a received order and returns its
stable public ID without selling. Legacy `paid` or `payment_confirmed` status and
partner paid-sub-order ingestion both invoke the same idempotent sale function.

In `observe` mode a paid sub-order is stored as observed, without mapping or
reconciliation failure. Moving the production profile to `live` reprocesses
eligible observed paid rows safely.

## Cancellation, refund, and reconciliation

Medicalka may cancel a paid order after approval or during courier search. That
is a real paid-then-cancelled lifecycle, not proof payment never happened.

- Before Billz sale: record cancellation and notify; no Billz action.
- After confirmed Billz sale: mark refund reconciliation required and alert
  admin. Do not perform a blind automatic Billz return.
- Medicalka pharmacy cancellation uses its documented endpoint and reason.
- Provider refunds remain Medicalka-owned. Fairhaven's separate Billz return
  must be implemented and verified before automatic reversal can be enabled.

## Telegram behavior

Approval cards go to admin DMs and the operations channel. Sub-order lifecycle
cards go to the operations channel only. One card is edited in place to avoid a
status-message stream.

Notification failure never changes Medicalka or Billz outcome. Delivery uses a
durable claim, retry schedule, and stored message ID. Messages contain order
number, item summary, amount, payment status, fulfilment status, courier state,
and Billz state. Credentials and raw provider payloads are forbidden.

## Admin UI

The existing `Connections` page remains the single integration settings area.
The Medicalka card shows both directions:

- credentials Fairhaven issued to Medicalka for catalog/inventory;
- credentials Medicalka issued to Fairhaven for partner orders.

A focused dialog edits the partner profile. Password is write-only and blank
means keep the stored value. Saving requires a successful connection test. A
separate confirmation controls production `live` mode and explains that paid
orders will reduce real Billz stock.

The existing Orders → Medicalka workspace keeps two tabs: approvals and
sub-orders. Copy changes from “paid orders” to “order lifecycle” because
waiting, paid, courier, terminal, and reconciliation states all belong there.

## API and authorization

Backend admin routes proxy through the existing loopback-only channel-hub
surface. New routes expose connection summary, profile validation/update,
activation, and processing-mode change. Every route inherits admin-host,
session, CSRF, loopback binding, and constant-time internal-token checks.

Payloads use strict enums, bounded strings, fixed hosts, generic upstream error
codes, and body-size limits. Audit records include admin identity, environment,
action, mode, pharmacy count, and success/failure, but never credentials.

## Verification

All mutation tests run with fake Medicalka, fake Telegram, in-memory Mongo, and
no Billz credential. Required proof:

- encryption round-trip, random IV, tamper rejection, and secret redaction;
- invalid credential update preserves previous active profile;
- only fixed Medicalka environments are accepted;
- staging and production records cannot affect each other;
- runtime switch is atomic and refuses in-progress operations;
- approval goes to admin DMs and channel, while non-admin callbacks fail;
- accepted checkout causes no Billz write;
- detailed paid sub-order is stored and announced in `observe` mode;
- list/detail payment disagreement uses detailed paid state;
- courier and terminal state edits the same channel card;
- delivery completion cannot be manually forced; pickup completion can;
- partner poll and legacy paid callback converge on one Billz sale;
- staging and observe mode cannot call Billz even if global write flag is true;
- production live mode still needs the global Billz write flag;
- duplicate and concurrent paid events create one sale;
- paid cancellation after sale enters refund reconciliation without automatic
  return;
- existing Medicalka token/secret catalog, inventory, order, and status
  authentication tests remain green;
- backend proxy, admin UI, full channel suite, and production builds pass.

Live-system verification is read-only until the operator creates a staging
checkout. The operator performs approval/payment actions. Billz remains disabled
during staging tests.

## Rollout

1. Deploy code with current active environment preserved and mode `observe`.
2. Generate and install the encryption key without printing it.
3. Import existing staging and production partner credentials through the same
   validated encrypted store without exposing values.
4. Keep existing Medicalka catalog/order keys untouched.
5. Run a staging checkout through approval, paid, courier, and cancellation or
   delivery while verifying admin and Telegram state.
6. Return active profile to production in `observe` mode.
7. Enable production `live` only through a separate operator decision after a
   paid staging lifecycle passes and product mappings are clean.
