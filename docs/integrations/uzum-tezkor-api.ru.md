# Uzum Retail API — contract foundation

Phase: 2026-09-06. This is a contract-alignment foundation, not launch acceptance.
Uzum remains disabled by default. No Medicalka configuration or tokens changed.

This document records foundation commit `d69f5e0`, including its historical gaps and test evidence. The subsequently approved operator flow and its implementation gates are tracked in [uzum-operator-flow.md](uzum-operator-flow.md) and [uzum-launch-checklist.md](uzum-launch-checklist.md). In particular, the approved target is NEW on receipt, manual acceptance/reservation, and manual READY/sale; courier pickup and delivery remain owned by Uzum. Historical DELIVERED mapping and automatic receipt-time reservation described below are not the approved target.

## Source of truth

Original complete OpenAPI 3.0.1 YAML from the [public Uzum Retail API page](https://flash-longship-af1.notion.site/Uzum-Tezkor-Retail-API-3eb48f484ac84504808078ae59c89e1f).
The exact original is preserved at `channel/tests/fixtures/uzum/Uzum-Tezkor-Grocery-API.yml` (73,868 bytes; 2,019 lines).
SHA256: `308c887ce7de226f03e5a57a565b29c9c4cd70557dcd03c7eae5c319c1ccafe7`.
Tests parse this YAML using the test-only Node yaml package and validate the actual response schemas with test-only Ajv and ajv-formats. No Python prerequisite or reduced schema fixture is used.

## Supported contract

Both existing `/uzum` and `/uzum/v1` mounts remain unchanged.
The Uzum router parses `application/vnd.eats.order.v2+json` and ordinary JSON. The full app delegates parsing only for enabled Uzum mounts; other paths and disabled-Uzum behavior retain the existing global parser. Malformed requests return a 400 ErrorListV1, and oversized requests return 413, before any order mutation.
POST acknowledgements, status responses, PUT responses and errors use JSON. GET order uses `application/vnd.eats.order.v2+json`. Successful DELETE returns HTTP 200 with zero body bytes and no Content-Type, as required by the original YAML's empty content map.
Order authentication failures use the documented reason object; catalogue and OAuth failures use ErrorListV1 arrays.
OAuth advertises the documented `read write` scope; legacy signed-token verification and permissions remain unchanged.
The existing `/restaurants` extension is not part of this YAML's route list.

Composition uses description.general, a singular barcode object with value and weightEncoding=none, and omits parentId for root categories.
Piece measure is value=1 with unit omitted: the schema permits only GRM/MLT units, neither of which describes a piece.
Unmapped weighted/volume units and product identifiers longer than 64 characters are held back in both composition and availability. Recognized piece units are empty legacy unit, шт, шт., pcs, pc, piece, pieces and dona.
Long or normalized category identifiers get a deterministic SHA256 suffix; category identifiers remain within 64 characters.
Existing image policy, stock/reserved/pending/minStock calculation, channel pricing and tax defaults are retained.
Availability publishes stock=0 whenever the existing catalogue availability rule is false, including forceStatus=out. It retains the shared forceStatus=in quantity rule. Unsupported available and inStock extras are omitted.

POST requires supported YGroceryOrderV2 fields, including explicit comment, promos and each item's modifications/promos arrays.
Configured store is mandatory; restaurantId, when provided, must match it.
Unknown fields, object identifiers, invalid numeric values and fractional piece quantities are rejected.
Nonempty order/item promos and modifications return 422. Item price must equal the current published channel price; paymentInfo.itemsCost must agree with the item total when present.
New orders also require publishable images, supported units and sufficient published stock.
An exact retry returns its original orderId without a second reservation or fresh catalogue lookup, including after delisting. Store and body safety are checked first. A conflicting payload under the same eatsId returns 422.
GET preserves the accepted documented snapshot, including paymentInfo, deliveryInfo, comment and empty arrays; internal database/Billz fields are not exposed. Legacy records receive required V2 fields reconstructed from saved items.
Buyer phone comes from deliveryInfo.clientPhoneNumber; deliveryInfo.phoneNumber remains the courier contact.
Delivery timestamps require valid calendar dates, including Gregorian leap-year rules, clock fields and numeric offsets; Date.parse normalization cannot turn an impossible day into an accepted order.

PUT is optional composition replacement, not a status callback. Known orders return explicit 422, without reserve, complete, cancel or Billz calls.
DELETE requires eatsId matching the loaded order before cancellation; first and repeat cancellation return empty HTTP 200, without repeating the cancellation path.
A failed record reports ACCEPTED_BY_RESTAURANT only when reservationApplied=true proves the reservation was applied. A draft-created checkpoint alone remains NEW. Raw Billz error text is not returned in status.

## Foundation gaps at d69f5e0 (historical)

Weighted products, promotions/modifiers and PUT replacement remain unsupported.
Operators still need an agreed and implemented workflow for COOKING, READY, courier handover and delivery confirmation. No invented courier callbacks or full UI flow are introduced here.
Existing sold records map to DELIVERED; this phase provides no Uzum PUT sale trigger.
Complete staging acceptance with Uzum before enabling: both mounts, auth, full GET snapshots, duplicate retries, stock accounting, cancellation and operator transitions. Validate asynchronous reservation/failure recovery and concurrent orders against the existing shared lifecycle; this phase does not add a new state machine or atomic inventory allocation.
The unchanged shared rate limiter still returns a Medicalka-style `detail` object on HTTP 429. Align that exceptional response with the Uzum error array before launch, without changing other channels' limiter budgets or envelopes. The schema tests in this phase do not claim throttling-contract coverage.
No live orders, sends, deployment or credentials are required for local verification.

## Verification from repository root

Prerequisites: installed channel/backend dependencies, cached MongoDB binary, and permission to bind local listeners. Billz reserve/complete/release/deleteDraft and Telegram operations are explicitly mocked in the integration suite; MongoMemoryServer supplies an isolated database.

- Pure schemas and socket-free router: `node --test channel/tests/uzumSerializers.test.js channel/tests/uzumOrderValidation.test.js channel/tests/uzumRouterPure.test.js`
- Full Uzum HTTP/dev-Mongo suite: `node --test channel/tests/uzumContract.test.js`
- Root regression: `npm --prefix channel test`
- Scope/whitespace: `git diff --check`

Sandbox evidence: original serializer failures were reproduced before implementation. Review follow-up also reproduced draft-only false acceptance, force-out stock leakage, empty-content validation failure, impossible-calendar-date acceptance and the full-app ordinary-JSON 500 response. Pure tests exercise both enabled mounts, disabled-Uzum and unrelated paths using the actual full app without a listener. Controlled concurrent exact/conflicting retries and explicit empty cancellation responses are covered in the HTTP/dev-Mongo suite. Full dev-Mongo tests cannot start inside this sandbox: `listen EPERM: operation not permitted 0.0.0.0`. Root must run them and regressions before acceptance; this phase does not establish launch readiness.

Root verification on 2026-09-06 completed outside the worker sandbox: `npm --prefix channel test` passed 375/375 tests; `node --test --test-timeout=60000 backend/tests/*.test.js` passed 220/220. This includes 44 Uzum tests and the Medicalka regressions. No tests were skipped. Syntax and whitespace checks passed; the preserved YAML checksum matches the downloaded original. No production deployment or live integration action was performed.
