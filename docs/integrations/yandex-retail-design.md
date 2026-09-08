# Yandex Retail integration — approved variant 2

Date: 2026-09-08. Baseline: f5dd07d (production-selected Uzum release). Implementation branch: codex/yandex-retail-20260908.

## Scope and decisions

The owner selected full integration: FairHaven admin and the existing Telegram bot manage Yandex orders. Add a separate Yandex channel to the channel hub. Preserve all existing Medicalka credentials, routes, configuration and polling; preserve Uzum contract and lifecycle. No second panel/bot, no PickerApp workflow, no credential rotation.

Use the seven-method per-place composition variant. The documented Deprecated label is not a URL suffix. Partner-owned place and order IDs are independent of Yandex eatsId. All Yandex responses are JSON except the empty status acknowledgement; Yandex is not an alias of Uzum.

New integration remains disabled by default. Credentials, mapped place, signed-token runtime configuration, product selection, prices, fiscal codes and partner acceptance are launch gates. Existing shared BILLZ_WRITE_ENABLED must not be enabled implicitly.

## Wire contract

- OAuth: POST /security/oauth/token, form client_id/client_secret/grant_type=client_credentials/scope=read write. JSON access_token and expires_in. Separate Yandex key ownership and signed audience; immediate revocation checks. Three-second response deadline.
- GET /nomenclature/{placeId}/composition: categories and items, per-store numeric prices. Required base fields: barcode, categoryId, description, id, images, isCatchWeight, measure, name, price, vendorCode. Barcode type/value/weightEncoding (none for ordinary barcodes). Measure unit GRM or MLT/value; no invented weight. Start with current supported piece assortment; unsupported weighted products stay unpublished and explicit-zero if previously published. Pagination default 5000/offset 0, include totalCount when paginating. Brand composition requires a separate prices method and is not this selected variant.
- Product-level serviceCodesUz.mxikCodeUz and packageCodeUz come from verified SKU data. The owner's example codes are examples, never universal defaults. Russian-only tax/classification rules must not be imposed on Uzbekistan.
- Current products have no physical grams/ml or barcode symbology field. Add optional stored channels.yandex.measure (actual GRM/MLT unit and positive integer value) and channels.yandex.barcodeType metadata; absent on legacy cards means not ready for Yandex, not a fabricated one-gram product. The official schema requires these values even for nonweighted goods. The operator enters verified packaging data. Existing channels must continue using their own current contract.
- GET /nomenclature/{placeId}/availability: items of id and stock. Missing products retain last stock by Yandex's default rule. A durable per-place publication ledger must let all previously published IDs emit zero after disabling/deleting/unlinking, invalid image/price/metadata, or Billz removal. A successful feed response must never outrun its durable ledger write.
- POST /order: application/vnd.eats.order.v2+json. Required comment, deliveryInfo, discriminator, eatsId, items, paymentInfo. For yandex delivery, courierArrivementDate required; paymentInfo has itemsCost/paymentType, each item id/price/quantity. restaurantId/platform/brand/promos optional; supplied restaurantId must match configured place, omission uses single-store configured place. A valid unavailable item does not reject receipt. Receipt records data only, no Billz calls. Concurrent/exact retries return 200 with same orderId and result OK. Preserve immutable original data separately from assembled items.
- GET /order/{orderId}: for yandex discriminator, return discriminator/eatsId/items, not the incoming delivery/payment envelope. Actual assembled lines have id/price/quantity; omission removes a line. No cross-channel ID lookup. Five-second deadline.
- GET /order/{orderId}/status: status plus bounded optional reason/comment/updatedAt; statuses NEW, ACCEPTED_BY_RESTAURANT, COOKING, READY, TAKEN_BY_COURIER, DELIVERED, CANCELLED. No POSTPONED. Five-second deadline.
- PUT /order/{orderId}/status: application/vnd.eats.order.status.v1+json; only CANCELLED, TAKEN_BY_COURIER, DELIVERED inbound. 204 empty after durable acknowledgement. Courier callbacks require partner agreement. No status regression. Replayed cancellation is idempotent. Attributes including paid are metadata, not a new payment instruction.
- Errors: normal 400/404/500 arrays of numeric code/string description; 401 reason object. No raw exception, secret or customer data leakage. Official business error-number agreement is an onboarding gate, not an invented fixed catalogue.

## Operator and accounting boundary

Receipt is not reservation or sale. Operator picking changes must be versioned, auditable and frozen before reservation; reductions/removals and explicit catalog-backed replacements are needed for partner checkup. Both admin and Telegram decisions use one channel-owned lifecycle, with current admin identity checked at both boundaries. Telegram receives a distinct callback namespace and durable notification revisions; removed admins receive no fresh order content.

Accounting trigger is awaiting the owner's answer to the separate question: admin Ready (matching existing Uzum) or Yandex Taken by courier. Do not silently select either or activate a money/stock path before that answer. Cancellation after a proven sale requires visible accounting reconciliation, never a fabricated successful refund or release. Cancellation arriving during an in-flight action must be durably retained and fenced.

If Yandex accounting is enabled later, add its own sold holds and count both channels' holds in every shared stock consumer. Preserve deployed uzumSoldHolds records and legacy behavior; no risky rename/migration. Existing allocation concurrency limitations must be documented honestly, not declared fixed by new tests unrelated to allocation.

## Delivery sequence and verification

1. Identity/catalog/receipt contract plus independently editable Yandex product settings and Connections. Verify isolated credentials, media/errors, explicit-zero ledger, retry identity and unchanged existing suites.
2. After accounting choice: lifecycle, picked composition, shared sold-stock protection, admin orders and Telegram actions. Verify Mongo races, retries, cancellation/reconciliation, mixed-channel stock and current-admin gates using local fixtures.
3. Review all changes independently; run complete channel/backend/admin suites and admin build. Public nginx candidate keeps internal endpoints private. Commit and push tested branch. Production activation is separate from having code available.

Tests run with dotenv disabled, live credentials absent, temporary local MongoDB and fake external transports. Never create a live order, Billz write or Telegram send as a verification probe.

## Sources

- https://yandex.ru/support/retail/ru/ref/
- https://yandex.ru/support/retail/ru/ref/authenticationPull
- https://yandex.ru/support/retail/ru/ref/partner.nomenclature.composition.get
- https://yandex.ru/support/retail/ru/ref/overview/nomenclature
- https://yandex.ru/support/retail/ru/ref/partner.nomenclature.availability.get
- https://yandex.ru/support/retail/ru/ref/partner.order.create
- https://yandex.ru/support/retail/ru/ref/partner.order.get
- https://yandex.ru/support/retail/ru/ref/partner.order.status
- https://yandex.ru/support/retail/ru/ref/partner.order.status.put
- https://yandex.ru/support/retail/ru/ref/overview/checkup
- https://yandex.ru/support/retail/ru/ref/overview/timeout
- Uzbekistan serviceCodesUz: owner's explicit regional requirement, absent from the main Russian documentation.
