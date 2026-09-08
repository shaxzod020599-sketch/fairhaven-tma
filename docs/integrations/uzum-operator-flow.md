# Uzum operator integration

Business flow confirmed by the operator on 2026-09-07. Implementation and verification status is tracked separately; this document does not assert a production deployment.

## Responsibility

Fairhaven staff accept/reject a new order and mark an accepted order ready. The operator confirmed that courier pickup and delivery are automatic in Uzum's separate application. Our API reports Fairhaven's fulfilment progress when Uzum polls it. No courier callback is inferred from the available documents, and an accounting sale must not be reported as proof of delivery.

The source HTML confirms a 15-minute acceptance window: Uzum cancels if it has not received ACCEPTED_BY_RESTAURANT within that period. This is an acceptance deadline, not the timeout for the initial HTTP acknowledgement.

## Agreed actions

| Event | Fairhaven state reported to Uzum | Accounting effect |
|---|---|---|
| New valid order durably stored | NEW | No automatic Billz write |
| Authorized admin accepts before deadline | ACCEPTED_BY_RESTAURANT after successful reservation | Reserve the saved quantities/prices in Billz |
| Authorized admin marks accepted order ready | READY after successful sale completion | Complete the Billz sale once |
| Staff reject or Uzum cancels before sale completion | CANCELLED after successful cleanup | Release reservation/draft if present |
| Courier pickup/delivery in Uzum | Managed by Uzum; our READY does not claim delivery | No invented second sale or callback |
| Cancellation after sale completion | Accounting conflict requiring reconciliation | No automatic refund or fabricated stock return |

Reserve-on-accept and sale-on-ready are the operator-approved business policy, not a payment confirmation supplied by the partner API. CARD/CASH describes payment type; READY must not be described as an independently verified bank payment.

## Admin and Telegram

Use the existing orders area with a dedicated Uzum source. Display items, quantities, saved prices, customer, external order ID, receipt time, acceptance deadline, current state and operation errors. Staff actions are Qabul qilish, Tayyor and Rad etish. Do not add manual courier or delivered controls.

Admin panel and Telegram must call the same channel-hub decision service. Actor identity comes from authenticated admin sessions or the Telegram user's current admin record. A request-supplied role is not authority. A channel card may be visible to channel members, but pressing a privileged button still requires admin authorization.

The panel asks for confirmation before a decision and a reason for rejection. Telegram's reject button directly submits the authorized rejection; it does not temporarily replace a shared card with a second confirmation keyboard that could overwrite a newer final state. Final card updates belong to the durable notification worker.

Notification success must be durable per recipient. Failed delivery stays retriable; stale cards must not permit repeated or conflicting writes. Telegram text is bounded and escaped, while full order content stays in storage.

## Correctness rules

- A replayed eatsId returns the same order ID; conflicting content is rejected.
- NEW does not automatically become accepted on receipt. A late accept is rejected using a deadline based on the original receipt time.
- READY requires proven successful accounting completion; no transition to DELIVERED is inferred from a sold record.
- Concurrent clicks and partner cancellation share durable order-level guards. Unknown Billz outcomes require reconciliation rather than a blind retry.
- On a safe pre-effect failure, expose the failure without claiming success; preserve existing core retry rules.
- Keep Medicalka keys, behaviour and accounting paths unchanged. Keep Uzum disabled by default until release prerequisites pass.
- Preserve the original YAML response contracts and both supported URL mounts. Uzum throttling uses ErrorListV1; Medicalka keeps its existing envelope and budgets.
- Piece goods remain the supported first-release assortment. Weight, promotions/modifiers and composition replacement remain unsupported until separately agreed and implemented.

## Stock after a sale

Billz reservation counters and sold-stock protection have different lifetimes. A completed Uzum sale transfers its local reservation into an order-keyed hold on each mirrored product. This keeps those sold units unavailable until a catalogue snapshot started strictly after that sale is applied. Replaying the transfer must not deduct another order's reservation or recreate a hold already settled by a newer snapshot.

Snapshot stock, deletion state and hold cleanup must advance atomically under a monotonic fetch-start watermark, including products that are already marked deleted. An older overlapping sync cannot replace newer stock or resurrect a product that a newer complete sync did not contain. All consumers of the shared mirror, including storefront availability, must honor these holds; Medicalka credentials and protocol remain unchanged.

A crash during a multi-product accounting operation still requires reconciliation under the existing Billz operation fence. This design does not claim automatic recovery from an uncertain external payment, nor prove the partner's stock-read consistency. Local expression tests supplement, but cannot replace, MongoDB integration tests and isolated Billz acceptance.

## Verification and release

Required evidence includes API receipt without Billz calls, acceptance/ready/rejection, duplicate and conflicting decisions, deadline enforcement, admin authorization, notification retry/finalization, failed accounting, and post-sale cancellation. Test with fake external services and an isolated database. Run affected admin tests/build and channel/backend regressions, then review the resulting diff.

The current sandbox cannot bind a local MongoMemoryServer listener (`listen EPERM`). That limitation must remain explicit until a real database integration run succeeds in an authorized development environment. Passing socket-free tests alone is not partner acceptance.

A staging marketplace URL is insufficient isolation: test database, Billz, payments, courier and Telegram destinations must be isolated too. Partner test-store configuration and acceptance are still required before enablement. Production state must be checked afresh before any deployment.

## Source limits

- Original YAML: `channel/tests/fixtures/uzum/Uzum-Tezkor-Grocery-API.yml`.
- Operator-provided HTML: `/Users/tm/Downloads/Инструкция по интеграции с Uzum Tezkor (Retail API).html`, saved on 2026-09-07.
- The HTML contains eight collapsed sections without their body text, including order handling, polling frequency, expected responses and retry behaviour. Their missing contents have not been reconstructed from guesses.
- The visible HTML confirms cancellation from Uzum via DELETE, cancellation from Fairhaven via CANCELLED, optional composition updates, and the acceptance deadline.
- Courier ownership and the two manual fulfilment actions are operator-supplied clarifications in this conversation.
