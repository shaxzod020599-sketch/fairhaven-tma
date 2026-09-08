# Uzum contract audit — 2026-09-08

Baseline: 86b17c2. Read-only audit against the retained partner YAML at channel/tests/fixtures/uzum/Uzum-Tezkor-Grocery-API.yml (SHA256 308c887ce7de226f03e5a57a565b29c9c4cd70557dcd03c7eae5c319c1ccafe7) and the operator-provided Retail API HTML. The original Downloads YAML attachment is no longer available at its supplied path; no fresh byte-equivalence claim is made.

## Evidence-backed corrections

- OAuth request requires client_id, client_secret, grant_type and scope (YAML 1052–1056, 1151–1170). Current handler permits absent grant and ignores scope. Credentials are checked, so this is not an authentication bypass, but the declared request and granted permissions are inconsistent. Enforce supported client_credentials and read/write scope without rotating any key or changing verification of already issued valid tokens.
- Partner cancellation comment is a string without a schema length limit (YAML 1575–1588). Current public DELETE rejects a 301-character comment due to an internal staff-reason limit. Accept valid partner text within the existing body-size limit and bound its stored/displayed audit representation; retain internal staff-input bounds.

## Cancellation boundary and implementation decision

The supplied HTML permits cancellation at any stage, and YAML status description 1602–1604 permits transition to CANCELLED from any status. Current Ready records a sale, so a later DELETE always reaches the sold/reconciliation guard. The 409 ErrorListV1 response is a permitted default error shape; it is not itself a wire-format violation. However, permanent refusal leaves a full-workflow gap.

YAML 748/765 defines DELETE success as cancellation in the restaurant, with empty 200 (782), not proof of financial reversal. No supplied cancellation field or visible clause requires refund/stock return. Implement a separate confirmed fulfillment-cancellation marker for proven sold orders: partner status CANCELLED, accounting status sold, explicit reconciliation. Return 200 only after durable marker persistence; idempotent retry performs no accounting operation. Preserve sale evidence and hold protection. Do not derive success from arbitrary pending cancelRequested, and retain current pre-sale cleanup proof gates. A cancellation racing successful settlement must finalize this marker without restoring READY. This is a contract-backed fulfillment distinction, not automatic refund authority.

## Uzum rules that must not be replaced by Yandex rules

- Omitted availability IDs become unavailable (YAML 151). A Yandex-style durable zero ledger is not required here.
- Barcode type is optional; required nested fields are value and weightEncoding (1326–1330).
- Measure object is required, but its unit/value are not individually required (1488–1510). Do not fabricate GRM or impose Yandex packaging requirements on existing Uzum products.
- serviceCodesUz is optional in this supplied source; when present, mxikCodeUz is required and packageCodeUz is optional (1536 onward). Actual fiscal accuracy remains an operator/partner launch gate.
- GET/order/status courier workflow does not define a Yandex-style inbound courier PUT. Operator confirmed Uzum manages courier/delivery in its own application.
- Optional PUT composition changes require agreement. Current explicit unsupported response must not be advertised as supported picking.

## Negotiated launch limits

Piece-only assortment, no nonempty promotions/modifiers, stock/price mismatch rejection, and acceptance/Ready operating profile need partner acceptance. The HTML's collapsed expected-response/retry/polling sections contain no body text in the supplied export; absent details are not reconstructed from Yandex documentation. The visible 15-minute acceptance deadline is implemented.

This audit performs no live order, payment, stock movement, notification or credential operation. Dedicated Uzum credentials already provisioned must not be regenerated. Runtime mapping/signing configuration, selected assortment and partner acceptance remain separate gates.
