# Uzum integration — ordered launch checklist

Updated: 2026-09-07. Launch is not complete. This checklist records sequence, evidence and gates; it is not approval to enable production or make live test transactions.

## Current evidence

- Contract foundation: `d69f5e0`; Medicalka Telegram repair: `65ddd24`.
- The prior root verification on 2026-09-06 passed 375 channel and 220 backend tests with isolated/fake external services. Those results apply to that revision, not to future changes.
- Uzum is disabled by default. No enablement has been performed in this task.
- The attempted production preflight failed before connecting: SSH port 22 returned `Operation not permitted`. Production deployment is unverified and must not be reported as complete.
- On 2026-09-07 the configured implementation worker could not initialize: its state database was read-only and the in-process app-server client returned `Operation not permitted`. No source-code changes or new test runs resulted from that dispatch.
- Existing Medicalka credentials and behaviour must remain unchanged throughout every phase.

## 1. Partner onboarding — current

- [x] Prepare a send-ready Russian request: `uzum-onboarding-request.ru.md` beside this file.
- [ ] Resolve the recipient and transmit through the operator-approved channel. No recipient is available in the current task; the request has not been sent.
- [ ] Receive the technical contact, isolated test store and store mapping agreement.
- [ ] Record the confirmed API version, status ownership, payment/return rules, timeouts, retry policy, assortment scope and acceptance criteria.

Do not request credentials in chat. Any credentials needed for an additional API must use the existing inject-only vault workflow. Partner credentials are not a prerequisite for the inbound OAuth scheme: Fairhaven issues the dedicated Uzum credentials.

## 2. Close the bounded HTTP 429 contract gap — pending execution environment

Scope: `channel/src/middleware/rateLimit.js`, the Uzum router only if needed, focused rate-limit tests and the existing contract-foundation notes.

Acceptance:

- Actual channel-throughput and auth-failure throttling return Uzum ErrorListV1 JSON at both `/uzum` and `/uzum/v1` mounts, including Express-supported case variants.
- Tests first fail against the current implementation, then pass after the minimal fix; validate responses using the original YAML.
- Medicalka retains its existing `detail` envelope. Quotas, keying, counters, headers, successful-request exclusion and the disable flag retain their current semantics.
- No untrusted request header or loose URL-prefix test selects the response contract.
- No credentials, authentication decisions, shared order accounting or dependencies change.
- Independent review and root verification precede commit/push. No production testing is needed.

## 3. Approve the Uzum order-management design — partner decisions required

Current source automatically calls `reserveOrder` after accepting a new Uzum order. A reserved order maps to ACCEPTED_BY_RESTAURANT, and a sold order maps to DELIVERED. The shared accounting states do not represent assembly or courier progress. Therefore adding buttons alone would not implement a correct lifecycle.

Recommended direction to validate with the operator and Uzum:

- Keep delivery/fulfilment progress distinct from Billz accounting evidence. A successful Billz sale must not by itself assert that a courier delivered the order.
- Use the existing admin panel and Telegram admin identity checks; both surfaces must invoke one Uzum decision path with audit records, concurrency protection and stale-button rejection.
- Decide explicitly whether receipt merely records a request or also takes a local stock hold. Confirm the approval/rejection deadline and what happens when it expires before choosing a timer or stock-hold policy.
- Implement only the agreed acceptance/assembly transitions. Courier, delivery and refund events require an identified authoritative source; do not invent a callback or a successful-payment event.
- Decide when Billz reserve, complete and cancellation run, and how pending/uncertain external operations are reconciled. Preserve the existing protection against repeating uncertain writes.
- A narrower first release of piece goods without promotions/modifiers/composition replacement is possible only if Uzum accepts that scope. Otherwise those capabilities require a separate reviewed accounting design.

Alternative: use Uzum's own cabinet for operator actions if they document how our integration receives the resulting events. Without that return path, this alternative does not close the lifecycle gap.

Gate: write and approve the concrete design and task plan after these decisions are known. Do not implement both alternatives speculatively.

## 4. Implement and verify locally — after design approval

- [ ] Add failing tests for approved status transitions, invalid transitions, unauthorized actions, duplicate clicks and concurrent admin/Telegram actions.
- [ ] Implement the scoped Uzum decision path and existing-panel/Telegram controls.
- [ ] Verify stock holds, reserve/complete/cancel behaviour and failure reconciliation against a local database and fake Billz, with live credentials absent.
- [ ] Test notification retry and finalization against fake Telegram; preserve complete order information in storage even when display text is shortened.
- [ ] Complete agreed promotions, units or composition-update scope, if required by partner acceptance.
- [ ] Run required channel/backend regressions and admin lint/build/tests for any modified frontend. Review final diff for Medicalka isolation and secret exposure.
- [ ] Commit and push verified changes to the configured GitHub remote. A network failure must be reported separately from a successful local commit.

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

## Sources

- Original partner YAML: `channel/tests/fixtures/uzum/Uzum-Tezkor-Grocery-API.yml`.
- Foundation and remaining gaps: `docs/integrations/uzum-tezkor-api.ru.md`.
- Current order path: `channel/src/adapters/uzum/routes.js`.
- Current status mapping: `channel/src/adapters/uzum/statuses.js`.
- Shared accounting model and operations: `channel/src/models/ChannelOrder.js`, `channel/src/core/orders.js`.
