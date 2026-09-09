# Uzum contract corrections — 2026-09-09

Code complete and locally verified; production installation/activation are not asserted here.

## Contract mapping

- YAML1052–1056/1151–1170: required string grant_type=client_credentials and read/write scope set. HTTP Basic and form credentials supported. Absent, empty, coerced arrays/objects and unsupported scope rejected. Existing signed bearer format, signing secret, key lookup and revocation unchanged; previously minted valid bearer regression passes.
- YAML1575–1588: partner DELETE accepts optional string comments within256KiB transport bound, including301characters and long Unicode. Retained reason limited to4096codepoints with truncation metadata. Internal staff300character validation remains.
- YAML748/765/782/1602–1604: DELETE after proven sale persists a separate fulfillmentCancelledAt marker, returns empty200, and status reads CANCELLED. Accounting remains sold; sale timestamp, items, Billz identifiers and all product holds/counters remain unchanged. Admin and notification state explicitly say refund was not performed. Unproven accounting never receives this marker.
- Concurrent Ready/cancel and marker-write failure/restart cases preserve cancellation intent. Replay preserves first actor/reason and performs no second accounting effect. Only the exact completed lifecycle owner can clear its operation; another owner remains untouched. A separate bounded drain retries proven-sold marker failures, not financial operations.
- nginx exact `/yandex` and slash-prefix `/yandex/` proxy rules, numeric429 error array. Medicalka/Uzum envelopes unchanged; internal/health/lookalike prefixes remain unproxied. Static tests are not nginx runtime proof.

## Evidence

- Meaningful RED: absent grant200vs400, long comment400vs200, sold cancellation409vs200, marker retry/Ready race failures, missing Yandex nginx location, missing truthful UI/notification copy.
- Full isolated backend/channel: **903/903**, no failures/cancellations/skips,77.04s. MongoDB7.0.34, no environment files/live credentials, external fetch limited to loopback, fake accounting boundaries.
- Admin: **163/163**,30files,28.91s with one worker; production build passed73modules.
- Initial parallel run failed under local timeouts (Mongo startup10s, admin tests5s); full serial reruns passed without increasing deadlines. One old pure receipt test explicitly expecting sold409 was updated to assert200/CANCELLED while retaining sold status and no extra accounting calls.
- Independent code/security review approved the current scoped diff. No Medicalka implementation edits; shared model adds one optional Uzum date only.

Logs: `/tmp/fh-task4-serial.log`, `/tmp/fh-task4-admin-serial.log`. Task3 Yandex browser evidence is separate in `yandex-admin-verification-20260909.md`.

## Remaining launch gates

Confirmed partner place/store mapping, accepted assortment/features and fiscal metadata, signing/runtime configuration, isolated partner acceptance and explicit accounting enablement. Uzum courier events stay partner-owned; optional composition replacement remains unsupported by agreement. No live order, stock movement, payment, refund or Telegram test was made. Medicalka credentials were not issued, rotated or revoked. Do not call this a fully active partner integration until these gates pass.
