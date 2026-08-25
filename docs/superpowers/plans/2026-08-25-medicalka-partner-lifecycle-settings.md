# Medicalka Partner Lifecycle and Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Make Medicalka approval, payment, courier, cancellation, Telegram, and admin-settings flow match Medicalka contract while preserving every previously issued Fairhaven API key.

**Architecture:** Keep Fairhaven-hosted `/medicalka/v1` feed separate from Medicalka partner API. Add encrypted fixed-host partner profiles and one active runtime context. Store staging and production partner data in separate collections. Poll and notify in `observe`; permit Billz sale only when production profile is `live` and global Billz write gate is also enabled.

**Tech Stack:** Node.js, Express, Mongoose, Node `crypto`, React/Vite, Vitest, Node test runner, Telegram Bot API.

**Spec:** `docs/superpowers/specs/2026-08-25-medicalka-partner-lifecycle-settings-design.md`

**Global constraints:** Never call real Medicalka mutation, Telegram send, or Billz write during automated verification. Never expose credentials in responses, logs, audits, or API reads. Keep current Medicalka catalog/order key documents and auth behavior unchanged.

---

## Task 1: Encrypted partner profiles and fixed environments

**Files:**

- Create: `channel/src/medicalka/credentialCipher.js`
- Create: `channel/src/models/MedicalkaPartnerProfile.js`
- Create: `channel/src/medicalka/partnerProfiles.js`
- Modify: `channel/src/db.js`
- Modify: `channel/src/config.js`
- Test: `channel/tests/medicalkaPartnerProfiles.test.js`

1. Write failing tests proving AES-256-GCM round-trip, random IVs, tamper rejection, fixed environment URLs, staging `observe` enforcement, and read-summary redaction.
2. Run focused test and confirm failures name missing modules/behavior.
3. Implement minimal cipher, schema, fixed-environment validation, masked summary, and save-after-validation service. No arbitrary URL field.
4. Run focused test green, then full channel safety tests.
5. Commit encrypted profile foundation.

## Task 2: Environment-scoped models and hot-switched runtime

**Files:**

- Modify: `channel/src/models/MedicalkaApproval.js`
- Modify: `channel/src/models/MedicalkaSubOrder.js`
- Modify: `channel/src/medicalka/runtime.js`
- Modify: `channel/src/medicalka/partnerClient.js`
- Modify: `channel/src/routes/internal.js`
- Modify: `channel/src/server.js`
- Test: `channel/tests/medicalkaRuntimeProfiles.test.js`
- Modify test: `channel/tests/internalMedicalka.test.js`

1. Write failing tests proving production keeps existing collections, staging uses isolated collections, profile update validates before persistence, switch preserves old context on failure, and switch refuses in-progress operations.
2. Run focused tests and confirm expected RED failures.
3. Add scoped model factories and runtime manager. Existing environment variables become bootstrap fallback only when no stored profile exists.
4. Add loopback internal endpoints for sanitized summary, validate/update, activate, and mode change. Strict enums, bounds, fixed hosts.
5. Run focused tests green and full channel suite.
6. Commit runtime profile switching.

## Task 3: Observe-first sub-order lifecycle and one idempotent sale path

**Files:**

- Modify: `channel/src/medicalka/subOrders.js`
- Modify: `channel/src/models/MedicalkaSubOrder.js`
- Modify: `channel/src/adapters/medicalka/routes.js`
- Modify: `channel/src/core/orders.js`
- Modify test: `channel/tests/medicalkaSubOrders.test.js`
- Modify test: `channel/tests/medicalkaOrders.test.js`

1. Write failing tests proving detail payload wins over list payload, paid rows persist in observe without mapping failure, staging never writes Billz, production live still needs global write gate, paid cancellation after sale requests refund reconciliation, and delivery courier statuses cannot be manually forced while pickup completion can.
2. Write failing legacy tests proving `POST /medicalka/v1/orders` only records receipt, `paid`/`payment_confirmed` performs sale, and partner plus legacy events converge on parent `order_id` with one sale.
3. Run focused tests and confirm RED failures.
4. Add processing-mode gates, delivery-service fields, canonical external ID, and explicit observed/sold/refund states. Keep full detail authoritative.
5. Correct legacy order timing without changing key authentication or response contract.
6. Run focused tests green, then legacy contract/auth suites and full channel suite.
7. Commit lifecycle behavior.

## Task 4: Telegram approval channel and lifecycle cards

**Files:**

- Modify: `channel/src/notify/telegram.js`
- Modify: `channel/src/medicalka/approvals.js`
- Modify: `channel/src/medicalka/runtime.js`
- Modify: `channel/src/models/MedicalkaApproval.js`
- Modify: `channel/src/models/MedicalkaSubOrder.js`
- Modify test: `channel/tests/medicalkaTelegram.test.js`
- Modify test: `channel/tests/medicalkaNotificationWorker.test.js`

1. Write failing tests proving approval card targets all current admins plus operations channel, Telegram callback rechecks admin authority, sub-order card targets channel only, and lifecycle change edits same message.
2. Confirm RED failures with fake Telegram transport.
3. Extend durable notification state to support recipient type and versioned sub-order card updates. Never include raw payload or credentials.
4. Wire runtime lifecycle events to notifier. Notification error must not alter Medicalka/Billz state.
5. Run focused tests green and full channel suite. No live Telegram token injection.
6. Commit Telegram lifecycle notifications.

## Task 5: Backend admin proxy and audit boundary

**Files:**

- Modify: `backend/controllers/channelController.js`
- Modify: `backend/controllers/medicalkaController.js`
- Modify: `backend/routes/adminRoutes.js`
- Modify: `backend/utils/channelHub.js`
- Test: `backend/tests/medicalkaPartnerSettings.test.js` if backend harness exists; otherwise test proxy contract through channel internal integration tests and module-level route checks.

1. Write failing boundary test proving only authenticated admin-host + CSRF path reaches settings proxy and credentials never appear in GET/audit response.
2. Confirm RED failure.
3. Add focused admin proxy handlers for summary, profile validation/update, activation, and processing mode. Forward secrets only in request body; never log them.
4. Add sanitized audit entries with actor, environment, action, outcome, and pharmacy count only.
5. Run focused verification and backend module startup check.
6. Commit backend proxy.

## Task 6: Connections UI and lifecycle controls

**Files:**

- Modify: `admin/src/api/connections.js`
- Create: `admin/src/features/connections/MedicalkaPartnerDialog.jsx`
- Create: `admin/src/features/connections/MedicalkaPartnerDialog.test.jsx`
- Modify: `admin/src/features/connections/ConnectionsPage.jsx`
- Modify: `admin/src/features/orders/MedicalkaSubOrders.jsx`
- Modify: `admin/src/features/orders/MedicalkaSubOrders.test.jsx`
- Modify: existing feature CSS files only where needed.

1. Write failing UI tests proving fixed staging/production choices, write-only blank password behavior, connection-validation feedback, masked summary, explicit production-live confirmation, and disabled delivery-completion actions.
2. Confirm RED failures.
3. Build one focused dialog inside existing Connections page using existing components and design tokens. Keep one primary save action, semantic labels, keyboard focus, 44px controls, and clear observe/live warning.
4. Rename paid-order copy to lifecycle copy and expose payment, courier, Billz, and reconciliation states. Offer completion only for pickup.
5. Run focused UI tests green, full admin tests, and admin build.
6. Commit admin UI.

## Task 7: Rollout, regression verification, commit, and push

**Files:**

- Modify: `.env.example`
- Modify: `channel/.env.example` if present
- Modify: operational documentation under `docs/`

1. Document encryption key, fixed profiles, observe/live gates, and safe rollout without secret values.
2. Run channel full suite, admin full suite/build, root builds relevant to touched code, syntax checks, `git diff --check`, secret scan, and focused mutation review.
3. Use code review skill and fix verified findings with new failing tests.
4. Push code branch and GitHub target requested by user.
5. Deploy to production server in `observe`, add encryption key through secret-safe mechanism, import both profiles without printing values, keep global Billz write disabled, restart service, and verify read-only health/admin endpoints.
6. Confirm old Medicalka feed keys still authenticate through non-mutating checks and active partner profile returns to production `observe` after staging test.
7. Report commit IDs, pushed branch, deployment health, tests, and remaining live lifecycle check requiring operator action.

