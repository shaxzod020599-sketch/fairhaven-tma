# Medicalka inbound integration implementation plan

> Execute with strict TDD: each behavior test must fail before production code is added.

**Goal:** Restore Medicalka stock import and add restart-safe Medicalka approvals, authorised Telegram actions, existing-admin-panel actions, and paid sub-order handoff without changing existing Medicalka credentials.

**Architecture:** Channel hub owns Medicalka partner API, persisted approval state, polling, Telegram delivery, and Billz handoff. Backend only authenticates admins and proxies decisions. Admin React app renders Medicalka inside existing Orders workspace. One channel-hub service handles every accept/reject action.

**Stack:** Node.js, Express, Mongoose, native `fetch`, Telegraf, React, Vite, Vitest, Testing Library, Node test runner, mongodb-memory-server.

## Task 1: Lock existing credentials and repair outbound contract

**Files:**
- Modify: `channel/tests/medicalkaContract.test.js`
- Modify: `channel/tests/internalKeys.test.js`
- Modify: `channel/src/adapters/medicalka/serializers.js`
- Modify: `channel/src/adapters/medicalka/routes.js`

1. Add literal contract tests for numeric price/quantity, `base_price`, and `ikpu_code`.
2. Add regression test proving an already-issued token remains active after normal Medicalka configuration work.
3. Run focused tests and record expected failures.
4. Make minimum serializer/route changes. Do not touch key issue, revoke, hash, or auth middleware.
5. Run focused tests until green.

## Task 2: Add partner client with safe token lifecycle

**Files:**
- Create: `channel/tests/medicalkaPartnerClient.test.js`
- Create: `channel/src/medicalka/partnerClient.js`
- Modify: `channel/src/config.js`

1. Fake HTTP server tests sign-in, access token use, refresh rotation, one refresh for concurrent 401s, bounded timeout, pagination query, response size guard, and secret-free errors.
2. Run test and confirm missing client failure.
3. Implement in-memory credentials/tokens and official endpoints only.
4. Run focused test until green.

## Task 3: Persist and synchronise approval requests

**Files:**
- Create: `channel/tests/medicalkaApprovals.test.js`
- Create: `channel/src/models/MedicalkaApproval.js`
- Create: `channel/src/medicalka/approvals.js`
- Modify: `channel/src/db.js`
- Modify: `channel/src/server.js`

1. Mongo integration tests cover complete fixture normalisation, idempotent upsert, non-overlapping polling, restart-safe new detection, history reconciliation, and informational deadline.
2. Run test and confirm missing model/service failure.
3. Add allow-listed collection, minimal schema, synchroniser, start/stop lifecycle.
4. Run focused test until green.

## Task 4: Build one atomic accept/reject service and internal API

**Files:**
- Extend: `channel/tests/medicalkaApprovals.test.js`
- Create: `channel/tests/internalMedicalka.test.js`
- Modify: `channel/src/medicalka/approvals.js`
- Modify: `channel/src/routes/internal.js`

1. Tests cover list/detail, admin actor validation, one atomic winner, same-action idempotency, opposite-action conflict, rejected comment limit, transient retry release, ambiguous reconciliation, expired source result, and no Billz call.
2. Run focused tests and confirm failures.
3. Implement decision lease and internal routes using one service function.
4. Run focused tests until green.

## Task 5: Notify current admins and secure Telegram callbacks

**Files:**
- Create: `channel/tests/medicalkaTelegram.test.js`
- Create: `channel/src/models/AdminView.js`
- Modify: `channel/src/db.js`
- Modify: `channel/src/notify/telegram.js`
- Modify: `channel/src/models/MedicalkaApproval.js`
- Create: `backend/tests/medicalkaTelegramAction.test.js`
- Create: `backend/services/medicalkaTelegramAction.js`
- Modify: `backend/bot/bot.js`

1. Channel tests prove only current admin IDs receive direct messages, duplicate polls do not duplicate delivery, final state edits every delivered message, and no customer data enters callback payload.
2. Backend tests prove non-admin and demoted users cannot act, reject requires confirmation, stale callbacks return final state, and authorised action calls channel hub once.
3. Run tests and confirm failures.
4. Implement read-only admin view, Telegram card/buttons, callback service, and bot registration.
5. Run focused tests until green.

## Task 6: Proxy Medicalka operations through authenticated admin backend

**Files:**
- Create: `backend/tests/medicalkaAdminRoutes.test.js`
- Create: `backend/controllers/medicalkaController.js`
- Modify: `backend/routes/adminRoutes.js`
- Modify: `backend/utils/channelHub.js` only if a shared response helper is required.

1. Route tests cover admin-host/session/CSRF protections, validated filters, list/detail, accept/reject actor forwarding, upstream conflicts, and stale-service response.
2. Run tests and confirm 404/missing controller failures.
3. Add thin proxy controller/routes; keep decision logic in channel hub.
4. Run focused tests until green.

## Task 7: Add Medicalka queue inside existing Orders workspace

**Files:**
- Create: `admin/src/api/medicalka.js`
- Create: `admin/src/features/orders/MedicalkaQueue.jsx`
- Create: `admin/src/features/orders/MedicalkaQueue.test.jsx`
- Modify: `admin/src/features/orders/OrdersPage.jsx`
- Modify: `admin/src/features/orders/OrdersPage.test.jsx`
- Modify: `admin/src/styles/features.css`

1. Component tests cover source switching, pending card, countdown, accept, reject confirmation/comment, conflict refresh, final actor, stale data, empty state, and 10-second silent polling.
2. Run Vitest and confirm missing UI failures.
3. Add source tabs and Medicalka queue using existing tokens/components/styles.
4. Run focused tests and admin build until green.

## Task 8: Synchronise paid sub-orders and hand off safely to Billz

**Files:**
- Create: `channel/tests/medicalkaSubOrders.test.js`
- Create: `channel/src/medicalka/subOrders.js`
- Modify: `channel/src/server.js`
- Modify: `channel/src/routes/internal.js`
- Extend: `admin/src/api/medicalka.js`
- Extend: `admin/src/features/orders/MedicalkaQueue.jsx`
- Extend: `admin/src/features/orders/MedicalkaQueue.test.jsx`

1. Tests cover paid-only handoff, stable external product mapping, duplicate poll idempotency, unmapped-product reconciliation block, pickup completion, delivery shipped rule, fiscal-label prerequisite, and cancellation/refund state.
2. Run tests and confirm failures.
3. Implement minimum official lifecycle endpoints and existing `ChannelOrder`/Billz fenced handoff.
4. Run focused tests until green.

## Task 9: Full verification and handoff

**Files:**
- Modify: `docs/RUNBOOK.md`
- Modify: `docs/integrations/medicalka-api.ru.md`

1. Run all channel tests.
2. Run all backend Node tests.
3. Run all admin Vitest tests and production build.
4. Run local browser flow against fake Medicalka; capture no live side effects.
5. Review `git diff --check`, changed-file list, secret scan, and key-route diff.
6. Confirm four guardrails: assumptions surfaced; minimum requested code; every changed line traceable; named success checks passed.
7. Commit scoped changes and push branch.
8. Stop before production deployment and report exact environment/activation checklist.
