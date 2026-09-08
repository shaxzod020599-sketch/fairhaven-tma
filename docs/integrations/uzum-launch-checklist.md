# Uzum integration — ordered launch checklist

Updated: 2026-09-08. Launch is not complete. This checklist records sequence, evidence and gates; it is not approval to enable production or make live test transactions.

## Latest verified state — 2026-09-08, after permissions were restored

This section supersedes earlier environment-blocked observations below; those remain historical evidence, not current blockers.

- SSH now succeeds. Production was inspected at `394f4f7` with Medicalka enabled and Uzum disabled. Existing root/channel environment files, Medicalka key metadata and the dirty production admin lockfile were fingerprinted for preservation.
- The production candidate is based on `394f4f7` and selects the Uzum commits while excluding the separate `65ddd24` Medicalka notification repair. Medicalka-specific modules, configuration and the channel-key model are unchanged in that candidate.
- Root independently ran the final stock-patch integration checkout against isolated MongoDB **7.0.34**, matching production: **426/426 channel tests passed**, zero skipped. No `.env` files or live credentials were present; outbound fetches were restricted to loopback. The worker's smaller run and reviewer runs below are separate evidence.
- Final production candidate verification after stock/restart corrections: **413/413 channel**, **225/225 backend**, and **102/102 admin** tests (27 frontend files), zero skipped; **740 total**. MongoDB7.0.34 was isolated with live credentials absent. Admin production build passed. The candidate has fewer channel tests than the original integration branch because the separate Medicalka repair and its tests were deliberately excluded.
- Routine Telegram webhook setup/polling fallback now preserves queued updates instead of discarding admin callbacks during deployment. Transport authentication and Medicalka-specific behavior are unchanged. Non-Uzum soldAt creation again occurs at final persistence as in production394f4f7; Uzum retains payment-confirmation time. Regression tests first reproduced two queue failures and two timing failures, then passed; independent code/security reviews approved the bounded correction.
- Independent stock review found no blocking defect. The race is corrected; the tombstone regression was a native-Date test-fixture issue, not a production tombstone defect. Existing cross-channel counter-repair races and partner stock-read consistency are not proven solved.
- No production deployment, Uzum activation, live test order, inventory write or Telegram test send has occurred at this checkpoint.
- Activation is blocked by missing confirmed Uzum store ID, signing configuration, dedicated active OAuth credentials, selected assortment and partner acceptance. The shared Billz write flag is currently false and must not be silently enabled. Shipping disabled code is not a completed launch.
- Browser inspection of `admin.fairhaven.uz` remains blocked by a saved site permission; do not circumvent it. SSH deployment/artifact checks are independently available.

## Current evidence

- Contract foundation: `d69f5e0`; Medicalka Telegram repair: `65ddd24`.
- The prior root verification on 2026-09-06 passed 375 channel and 220 backend tests with isolated/fake external services. Those results apply to that revision, not to future changes.
- Uzum is disabled by default. No enablement has been performed in this task.
- The attempted production preflight failed before connecting: SSH port 22 returned `Operation not permitted`. Production deployment is unverified and must not be reported as complete.
- The external CLI worker could not initialize on 2026-09-07: its state database was read-only and the in-process app-server client returned `Operation not permitted`. A subsequent implementation uses the available in-session worker within the same workspace permissions. The failed CLI dispatch itself made no source changes.
- The operator subsequently confirmed that Uzum manages courier/delivery automatically, while Fairhaven manually accepts and marks ready. The reserve-on-accept/sale-on-ready flow is recorded in `uzum-operator-flow.md`.
- Existing Medicalka credentials and behaviour must remain unchanged throughout every phase.

### In-progress verification (not release acceptance)

- The 2026-09-07 working-tree run passed 25 socket-free Uzum serializer, validation, router and lifecycle tests. Live-sensitive environment variables were absent before this run. These tests do not exercise MongoDB atomicity.
- The full backend run on that working tree recorded 224 tests: 170 passed, 54 failed. Listener creation was denied with `listen EPERM` on `0.0.0.0` / `127.0.0.1`; dependent setup and teardown failures mean this is not a passing regression run.
- On 2026-09-08, the focused Uzum and Medicalka Telegram/admin action tests passed 7/7, and `git diff --check` passed. Remaining implementation changes still require fresh verification.
- Admin tests/build remain unverified: local dependencies are absent; offline installation failed with `ENOTCACHED` for `xmlchars-2.2.0.tgz`. The matching old checkout contains unavailable/dataless build-tool files; attempted test/build commands were interrupted. No package versions or lockfiles were changed to work around this.
- A fresh normal dependency-install attempt on 2026-09-08 also failed: registry tarball requests returned `ENOTFOUND` for `registry.npmjs.org`; npm then reported `Exit handler never called!`. This did not establish a usable frontend toolchain.
- Accounting review identified a stale-stock exposure window after sale and a cancellation-cleanup failure path. Scoped corrections are implemented; actual database regression evidence remains a release gate. Existing shared counter-repair races and atomic cross-channel allocation remain outside this patch.

### Current implementation

- Receipt durably stores NEW without automatic reservation. Shared decisions implement accept/reserve, ready/sale and reject/cleanup, with original-receipt deadline, persistent cancellation intent, audited actors and uncertain-operation fencing.
- The existing Orders page now has an Uzum source, and Telegram actions use the same decision service. Current admin authorization is checked at the backend and internal decision boundary. Revoked Telegram recipients receive keyboard cleanup only, not new order content.
- Uzum OAuth credentials can be created in Connections through the existing issuance endpoint. The secret is transient and shown once; malformed or lost creation responses cannot trigger immediate reissuance in the same dialog. Existing keys are not rotated.
- Order-keyed sold holds protect availability in the channel catalogue, storefront/bot reconciliation, admin stock views and sellable-stock analytics. Snapshot stock/hold cleanup is atomic per product and ordered by fetch-start watermark, including repeated tombstones. Existing counter-repair concurrency limitations and uncertain external outcomes are not claimed resolved.
- Shared HTTP throttling selects the Uzum ErrorListV1 array from router-owned context; Medicalka retains its existing response shape. No protocol keys or limiter budgets were changed.

These are local source changes, not proof of production deployment or partner acceptance. Uzum remains disabled by default.

## 1. Partner onboarding — current

- [x] Prepare a send-ready Russian request: `uzum-onboarding-request.ru.md` beside this file.
- [ ] Resolve the recipient and transmit through the operator-approved channel. No recipient is available in the current task; the request has not been sent.
- [ ] Receive the technical contact, isolated test store and store mapping agreement.
- [ ] Record the confirmed API version, status ownership, payment/return rules, timeouts, retry policy, assortment scope and acceptance criteria.

Do not request credentials in chat. Any credentials needed for an additional API must use the existing inject-only vault workflow. Partner credentials are not a prerequisite for the inbound OAuth scheme: Fairhaven issues the dedicated Uzum credentials.

## 2. Close the bounded HTTP 429 contract gap — implemented, local contract tests pass

Scope: `channel/src/middleware/rateLimit.js`, the Uzum router only if needed, focused rate-limit tests and the existing contract-foundation notes.

Acceptance:

- Actual channel-throughput and auth-failure throttling return Uzum ErrorListV1 JSON at both `/uzum` and `/uzum/v1` mounts, including Express-supported case variants.
- Tests first fail against the current implementation, then pass after the minimal fix; validate responses using the original YAML.
- Medicalka retains its existing `detail` envelope. Quotas, keying, counters, headers, successful-request exclusion and the disable flag retain their current semantics.
- No untrusted request header or loose URL-prefix test selects the response contract.
- No credentials, authentication decisions, shared order accounting or dependencies change.
- Independent review and root verification precede commit/push. No production testing is needed.

## 3. Uzum order-management design — operator direction confirmed

Before this implementation, the adapter automatically called `reserveOrder` on receipt and mapped sold to DELIVERED. The approved replacement is NEW on receipt, reservation only on staff acceptance, and READY only after staff action and successful Billz sale. See `uzum-operator-flow.md` for the complete business contract and source limits.

Implementation requirements:

- Keep delivery/fulfilment progress distinct from Billz accounting evidence. A successful Billz sale must not by itself assert that a courier delivered the order.
- Use the existing admin panel and Telegram admin identity checks; both surfaces must invoke one Uzum decision path with audit records, concurrency protection and stale-button rejection.
- Receipt records the request without an automatic Billz write. The visible HTML confirms a 15-minute acceptance deadline; late acceptance is blocked and the card shows expiry.
- Implement staff acceptance, readiness and rejection. Courier and delivery belong to Uzum's separate platform, as clarified by the operator. Do not invent a callback or a successful-payment event.
- Billz reservation runs on acceptance; completion runs on readiness. Preserve the protection against repeating uncertain writes. Post-sale cancellation needs reconciliation until return accounting exists.
- A narrower first release of piece goods without promotions/modifiers/composition replacement is possible only if Uzum accepts that scope. Otherwise those capabilities require a separate reviewed accounting design.

Admin panel and Telegram are the chosen operator surfaces. The user authorized implementation of this flow; no further approval of the same direction is pending. Partner configuration and acceptance still gate production enablement.

## 4. Implement and verify locally — implemented, release verification incomplete

- [x] Add failing tests for approved status transitions, invalid transitions, unauthorized actions, duplicate clicks and concurrent admin/Telegram actions.
- [x] Implement the scoped Uzum decision path and existing-panel/Telegram controls.
- [ ] Verify stock holds, reserve/complete/cancel behaviour and failure reconciliation against a local database and fake Billz, with live credentials absent.
- [x] Test notification retry and finalization against fake Telegram; preserve complete order information in storage even when display text is shortened.
- [ ] Complete agreed promotions, units or composition-update scope, if required by partner acceptance.
- [ ] Run required channel/backend regressions and admin lint/build/tests for any modified frontend. Review final diff for Medicalka isolation and secret exposure.
- [ ] Commit and push verified changes to the configured GitHub remote. A network failure must be reported separately from a successful local commit.

### Verification evidence on 2026-09-08

- Final root socket-free regression selection passed 98/98, zero skipped: Uzum schemas, order validation, parser/auth/429 contracts, lifecycle, notifications, sold holds and consumers; catalogue paging; backend Uzum actions, Medicalka Telegram actions, stock reconciliation and channel admin views.
- The final selection includes three real Express handler tests (fake persistence/external accounting, no listening socket): durable inert receipt/retry/snapshot, internal token/current-admin/cross-channel boundaries, and safe service-error mapping. These do not prove database query semantics.
- All modified/new `.js` files passed `node --check`; `git diff --check` passed. JSX runtime/build checks remain blocked as described below.
- Full channel suite attempt recorded 391 tests: 155 passed, 236 failed from denied local listeners and dependent setup/teardown. Later focused tests are separate evidence, not a replacement for this failed regression run.
- The new real Mongo/Mongoose sold-stock regression suite was attempted: all three cases failed during setup with `listen EPERM: operation not permitted 0.0.0.0`. It did not reach database assertions.
- Root admin focused tests and build both failed to start: `vitest: command not found` / `vite: command not found`. UI behavior remains unexecuted in this environment.
- Independent review found and prompted corrections for stock consumers, stale tombstone resurrection, notification enqueue, revoked-recipient updates, stale Telegram keyboards, stale UI responses and misleading service-error mapping. Review is not production acceptance.

## 5. Staging acceptance — isolated environment required

- [ ] Provision a test database and scoped test configuration with production Billz, payment and Telegram credentials absent. A staging marketplace URL alone does not isolate inventory or messaging.
- [ ] Provide the agreed test URLs, OAuth credentials and store mapping securely.
- [ ] Run the agreed acceptance cases with Uzum only after the operator authorizes that specific test occasion and the environment has no live financial, inventory, courier or messaging effects.
- [ ] Reconcile test inventory and state; document results and remaining failures.
- [ ] Obtain partner acceptance for the supported scope.

## 6. Production deployment and enablement — separate gates

- [ ] Restore permitted SSH/network access; repeat read-only preflight against current server HEAD and status.
- [ ] Preserve unrelated dirty files, existing keys and Medicalka runtime configuration; establish a reversible release and rollback path.
- [ ] Deploy only reviewed commits and restart only affected services; verify revision, process health and sanitized errors without live test orders or sends.
- [ ] Enable Uzum only after configuration checks, partner acceptance and explicit operator authorization for activation. Shipping disabled code is not a completed Uzum launch.
- [ ] Verify operational readiness using read-only evidence and report untested delivery/financial behaviour honestly.

### Fresh release audit on 2026-09-08

- Reviewed local release `c5dadef` on `codex/medicalka-telegram-uzum-contract`. The current task's network permission request returned no grant; neither the current GitHub branch head nor the installed production revision was verified in this audit. A local commit is not deployment evidence.
- Re-ran 94 socket-free Uzum, stock-consumer and backend tests successfully, plus four Medicalka Telegram authorization/action regressions. Live-sensitive environment variables were absent and no local `.env` files were present. Original YAML checksum still matches the recorded source.
- Corrected nginx-origin 429 responses only for the existing Uzum locations, using a dedicated ErrorListV1 handler. Five static tests inspect the tracked config and original YAML; the three Uzum cases failed before the change and all five passed afterward. Root also passed the two application-limiter tests and four Medicalka Telegram regressions; independent review found no issue in the scoped patch. Medicalka/default handlers, proxy snippets, quotas, allowlist, logging and headers remain unchanged. No nginx binary is installed locally, so actual `nginx -t`, effective configuration and runtime responses remain release gates.
- Re-ran the three Mongo stock regressions: all failed during setup with `listen EPERM: operation not permitted 0.0.0.0`, before database assertions. Admin test and build commands still cannot start: `vitest: command not found` and `vite: command not found`. No dependencies, live services or credentials were changed.
- Independent review reproduced a temporary stock-understatement race: if a post-sale snapshot applies before the first sold-hold transfer, the transfer skips releasing the reservation, but the order clears `reservationApplied`. Further catalogue snapshots do not repair that counter; the periodic counter-repair path can. A correction must distinguish first settlement from replay after marker pruning, and must not introduce a second decrement or an unsafe payment retry.
- Validate all Uzum settings before enablement: missing store ID, signing key or public image base URL prevents the shared hub from starting and can therefore interrupt Medicalka. The Billz write flag is shared, not Uzum-specific. Preserve existing values until their production state and cross-channel effects are established.
- Partner production store mapping, accepted assortment scope, current OAuth credentials and acceptance results remain unknown to this task. Do not infer missing real-world values from empty defaults or from an unchecked documentation checklist.

### Commissioned stock-settlement implementation evidence — 2026-09-08

- Baseline: `a67efdbb841bb6cef442eace2bcb6508fb0be6c7`, branch `codex/medicalka-telegram-uzum-contract`. This is an uncommitted implementation diff; root still owns acceptance, commit/push and release. No production, partner, vault or live credential access occurred.
- Confirmed first-transfer cause: the snapshot watermark suppressed both sold-stock protection and reservation release. A fresh snapshot before the first transfer left `reservedQty=1` after the order durably cleared `reservationApplied`.
- The correction claims a single `complete` → `settle_stock` phase using the current persisted Uzum order, Billz operation token and reconciliation fence. It uses persisted quantities, refreshes ownership between products, and atomically releases the reservation while adding an order marker. A covering snapshot makes the marker quantity zero; it does not erase the replay guard. Delayed/repeated transfers fail ownership checks without touching another order's reservation. Payment ordering and shared order code are unchanged; no payment retry was added.
- Catalogue cleanup streams products with zero markers, then removes only markers whose persisted orders are Uzum, sold, unreserved, without an active Billz owner or reconciliation requirement. Cleanup repeats on subsequent successful catalogue runs after interruption. This one catalogue call is necessary to reclaim markers when a process crashes after durable order finalization; incomplete or uncertain settlements retain evidence for reconciliation.
- The tombstone regression was a VM test-clock defect, not a production tombstone query defect. Mongoose's clone helper preserved native `Date` literals but converted the `Clock extends Date` subclass through `valueOf()` into numbers. Mongo's date/number comparison then prevented the tombstone update; timestamp maintenance still produced `modifiedCount=1`. The clock now returns native dates. Existing repeated-absence and stale-presence assertions remain, with stronger first-tombstone assertions.
- Production files changed: `channel/src/uzum/stock.js`, one cleanup call in `channel/src/sync/catalog.js`, and explanatory comments in `channel/src/models/BillzProduct.js`. Focused changes: `uzumAccountingIntegration.test.js`, `uzumStock.test.js`, `uzumStockConsumers.test.js`, `uzumStockMongo.test.js`, and `tests/helpers/isolatedChannelEnv.js`. No Medicalka-specific production, authentication, delivery, UI, manifest or deployment edits.
- Tests ran under `env -i`. The helper asserts Billz/Telegram/Mongo configuration is absent before fixtures, disables dotenv loading and Mongo binary downloads, and permits fetch only to loopback with redirects rejected. Mongo servers and test databases were isolated and stopped by teardown; Billz operations were fake. Application schedulers were not started.
- RED: the original Mongo suite reached all 3 tests: 2 passed, repeated absence failed with `markedDeleted` actual 1, expected 0. After correcting the test clock, 3/3 passed. Four new real-Mongo accounting cases all failed before the production correction: first-transfer reservation actual 1/expected 0; erased replay marker actual 0/expected 1; stale caller quantity consumed another reservation; lost ownership was not rejected.
- Final GREEN: 76/76 focused Mongo/stock/accounting/counter tests and 421/421 applicable channel regressions passed, zero test-runner skips or failures. The broad selection excluded two files before invocation: `serverImport.test.js` spawns a child outside the dotenv guard; `medicalkaRuntimeIntegration.test.js` starts application schedulers. This is not a claim that the entire unfiltered suite ran. No channel lint, typecheck or build scripts are defined. All 8 changed/new JavaScript files passed `node --check`; `git diff --check` passed.
- Covered cases include fresh/equal/stale snapshots; a snapshot between transfer and finalization; repeated and delayed transfers after marker cleanup; another order reserving the same product; persisted versus stale quantities; partial multi-product failure and ownership loss between products; missing first mirror; explicit payment refusal and uncertain payment; interrupted catalogue cleanup/retry; and each durable cleanup gate independently. Expectations are hand-derived reservation, hold and availability values.
- Independent read-only code review found no issues in the source or final test/helper additions. Root release review remains pending. Residual limits: settlement remains atomic per product, not across all products; partial/uncertain operations require reconciliation. Cleanup requires a subsequent successful catalogue run and intentionally retains unresolved-order markers. Existing shared counter-repair and cross-channel allocation races remain outside this patch. Backend/admin/staging/production checks were not performed for this stock-only scope.

Exact commands, run from the repository root (the broad selection uses zsh):

```sh
# Original Mongo RED: 2 passed, 1 failed.
env -i PATH=/usr/local/bin:/usr/bin:/bin MONGOMS_RUNTIME_DOWNLOAD=false node --require ./channel/tests/helpers/isolatedChannelEnv.js --test channel/tests/uzumStockMongo.test.js

# After correcting the native-Date clock: 3 passed.
env -i PATH=/usr/local/bin:/usr/bin:/bin MONGOMS_RUNTIME_DOWNLOAD=false node --test channel/tests/uzumStockMongo.test.js

# Stock RED before the production correction: 0 passed, 4 failed.
env -i PATH=/usr/local/bin:/usr/bin:/bin MONGOMS_RUNTIME_DOWNLOAD=false node --test --test-name-pattern='fresh snapshot before first transfer|snapshot between transfer|persisted ownership rejects|lost persisted operation' channel/tests/uzumAccountingIntegration.test.js

# Final focused GREEN: 76 passed, 0 failed, 0 skipped.
env -i PATH=/usr/local/bin:/usr/bin:/bin MONGOMS_RUNTIME_DOWNLOAD=false node --require ./channel/tests/helpers/isolatedChannelEnv.js --test channel/tests/uzumStockMongo.test.js channel/tests/uzumStock.test.js channel/tests/uzumStockConsumers.test.js channel/tests/uzumAccountingIntegration.test.js channel/tests/orders.test.js channel/tests/counters.test.js > /tmp/uzum-stock-focused-20260908.log 2>&1

# Final applicable channel GREEN: 421 passed, 0 failed, 0 skipped.
test_files=()
for file in channel/tests/*.test.js; do
  case "$file" in
    channel/tests/serverImport.test.js|channel/tests/medicalkaRuntimeIntegration.test.js) ;;
    *) test_files+=("$file") ;;
  esac
done
env -i PATH=/usr/local/bin:/usr/bin:/bin MONGOMS_RUNTIME_DOWNLOAD=false node --require ./channel/tests/helpers/isolatedChannelEnv.js --test --test-concurrency=4 "${test_files[@]}" > /tmp/uzum-channel-regressions-20260908.log 2>&1

git diff --check
for file in channel/src/uzum/stock.js channel/src/sync/catalog.js channel/src/models/BillzProduct.js channel/tests/uzumAccountingIntegration.test.js channel/tests/uzumStockMongo.test.js channel/tests/uzumStock.test.js channel/tests/uzumStockConsumers.test.js channel/tests/helpers/isolatedChannelEnv.js; do
  node --check "$file" || exit 1
done
```

## Sources

- Original partner YAML: `channel/tests/fixtures/uzum/Uzum-Tezkor-Grocery-API.yml`.
- Foundation and remaining gaps: `docs/integrations/uzum-tezkor-api.ru.md`.
- Current order path: `channel/src/adapters/uzum/routes.js`.
- Current status mapping: `channel/src/adapters/uzum/statuses.js`.
- Shared accounting model and operations: `channel/src/models/ChannelOrder.js`, `channel/src/core/orders.js`.
