# Yandex foundation verification — 2026-09-08

Branch: `codex/yandex-retail-20260908`. Base: `f5dd07d`. This is the first, disabled-by-default phase of the approved full integration, not a complete production launch.

## Implemented and reviewed

- Independent Yandex OAuth keys, signed audience, active-key checks and bounded authentication errors.
- Per-place composition and availability, separate channel prices, actual packaging measurement and barcode metadata, and SKU-specific Uzbekistan fiscal codes.
- Durable publication history and explicit zero stock after delisting, including missing or deleted product records.
- Durable order receipt, stable concurrent/exact retry identity, immutable original request, order read projection and initial NEW status. No reservation, sale or notification occurs on receipt.
- Yandex product settings and credential management in the existing admin. Legacy Medicalka/Uzum validation behavior is retained for single-product and bulk updates.

Code review and security review approved this phase. Review repairs covered the ledger's database ownership entry, dangerous object keys before persistence, and legacy validation compatibility.

## Dispatcher verification

| Check | Result |
| --- | --- |
| Complete channel/backend tests, after compatibility repair | 786 passed, zero failed/cancelled/skipped |
| Complete admin tests | 136 passed across 29 files |
| Admin production build | Passed |
| Focused Yandex router/auth/catalogue/receipt/database-safety tests | 53 passed |
| Local Chromium fixture flow, desktop and 390px viewport | Passed: save, reload, failure/retry, clear; other channels unchanged |
| Working diff whitespace check | Passed |

Server tests use an empty environment, disabled dotenv loading, cached local MongoDB 7.0.34, temporary databases and guarded/fake external transports. The browser fixture intercepts all API requests, blocks external hosts and uses no real login, credential, order, stock or messaging service. Its four simulated saves include one rejected attempt. Browser exceptions and unexpected API requests were absent. Four screenshots were produced under the local workspace's `outputs/yandex-ui-root-proof`; root inspected desktop and narrow-viewport captures. The fixture's synchronous WebSocket callback and ambiguous native-control selectors were corrected before the successful run.

No lint or separate typecheck script exists in the current admin package. Live partner acceptance and real accounting behavior were not tested.

## Not implemented or activated

- Order picking/replacements, admin order actions and Telegram actions.
- Subsequent lifecycle transitions and PUT status callbacks.
- Yandex reservation, sale, shared sold-stock protection and post-sale cancellation reconciliation.
- Production Yandex runtime credentials, Place mapping, public proxy route, activation and partner acceptance.

The accounting trigger is awaiting the owner: deduct BILLZ on admin Ready, or on Yandex Taken by courier. No trigger was silently selected. Do not activate the receipt-only foundation for real order processing.

## Production preservation

Production application remains `f5dd07d`; no deploy or restart was performed for Yandex. Original modified admin lockfile and untracked channel environment backup remain intact. Backend/channel environment checksums are unchanged. Medicalka credential metadata was checked unchanged before and after the separately approved dedicated Uzum key import. See `uzum-connection-handoff-20260908.md` for that distinct action.

## Scope checks

Assumptions: documented courier-delivery variant, actual SKU metadata, accounting decision explicitly pending.

Minimum implementation: phase-one contract and existing admin extensions only; no new dependency or speculative lifecycle success.

Traceability: changed application files serve Yandex isolation, required catalogue metadata, receipt durability or existing-channel preservation.

Verification: real local test outputs and independent review support the results above; production activation and accounting are explicitly excluded.
