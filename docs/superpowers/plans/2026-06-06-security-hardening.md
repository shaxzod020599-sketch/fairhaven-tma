# Fairhaven Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close critical Fairhaven application and host security gaps without data loss, spam, notification text changes, or design changes.

**Architecture:** Validate Telegram WebApp signatures in shared middleware, attach authenticated identity to requests, and enforce ownership/admin authorization at route boundaries. Recompute order prices from database products, allowlist public and mutable data, then add edge and host protections with reversible config backups.

**Tech Stack:** Node.js, Express, Mongoose, React/Vite, Telegram WebApp, Nginx, PM2, Ubuntu/UFW.

---

### Task 1: Signed Telegram Identity

**Files:**
- Create: `backend/middleware/telegramAuth.js`
- Create: `backend/tests/telegramAuth.test.js`
- Modify: `backend/middleware/adminAuth.js`
- Modify: `frontend/src/utils/telegram.js`
- Modify: `frontend/src/utils/api.js`
- Modify: `frontend/src/admin/adminApi.js`

- [ ] Write tests for valid, tampered, stale, missing, and spoofed-admin auth.
- [ ] Run tests and verify expected failures.
- [ ] Implement HMAC validation, request identity, and verified admin lookup.
- [ ] Send `X-Telegram-Init-Data` from normal and admin frontend API clients.
- [ ] Run auth tests and existing notification tests.
- [ ] Commit signed authentication.

### Task 2: Route Authorization And Privacy

**Files:**
- Create: `backend/tests/authorization.test.js`
- Modify: `backend/routes/userRoutes.js`
- Modify: `backend/routes/orderRoutes.js`
- Modify: `backend/routes/productRoutes.js`
- Modify: `backend/controllers/userController.js`
- Modify: `backend/controllers/orderController.js`
- Modify: `backend/controllers/publicController.js`

- [ ] Write tests proving cross-user reads, public mutations, and mass assignment fail.
- [ ] Run tests and verify expected failures.
- [ ] Require signed user identity for private routes and verified admin for writes.
- [ ] Enforce caller ownership and allowlist user mutations.
- [ ] Whitelist public setting keys and hide private user/order fields.
- [ ] Run authorization and regression tests.
- [ ] Commit route authorization.

### Task 3: Order Integrity And Input Hardening

**Files:**
- Create: `backend/tests/orderIntegrity.test.js`
- Create: `backend/utils/http.js`
- Modify: `backend/controllers/orderController.js`
- Modify: `backend/controllers/uploadController.js`
- Modify: `backend/server.js`

- [ ] Write test proving client price/name cannot control order totals.
- [ ] Run test and verify expected failure.
- [ ] Load products server-side, reject unavailable/invalid items, bound quantities.
- [ ] Add safe API error responses, upload signature checks, request limits, and headers.
- [ ] Run order, upload, auth, authorization, and notification tests.
- [ ] Commit integrity hardening.

### Task 4: Dependencies And Build

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`

- [ ] Update vulnerable compatible dependencies.
- [ ] Run `npm audit --omit=dev` for backend and frontend.
- [ ] Run full backend tests.
- [ ] Run frontend production build.
- [ ] Commit dependency updates.

### Task 5: Reversible Edge And Host Hardening

**Files:**
- Modify on host: `/etc/nginx/sites-available/mini.fairhaven.uz`
- Modify on host only when safe: Fairhaven runtime and SSH configuration.

- [ ] Back up Nginx and relevant host configuration.
- [ ] Add Fairhaven API rate limits, security headers, no-cache private responses,
  and strip spoofable legacy admin header.
- [ ] Bind Fairhaven Node listener to loopback.
- [ ] Verify Mongo remains loopback-only and UFW blocks direct app ports.
- [ ] Keep SSH password authentication until working key login is verified.
- [ ] Run `nginx -t`, reload, and verify public/private/auth behavior.

### Task 6: Production Deploy And Verification

**Files:**
- Merge reviewed commits from `codex/security-hardening` into production `main`.

- [ ] Record pre-deploy DB counts and recent IDs without printing private data.
- [ ] Build frontend and restart only `fairhaven`.
- [ ] Verify health, PM2, public catalog, signed auth, unauthorized denial, and
  no notification sends.
- [ ] Run full tests and audits again.
- [ ] Compare post-deploy DB counts and recent IDs.
- [ ] Monitor logs for at least 60 seconds.
- [ ] Commit deployment record and report remaining staged risks.
