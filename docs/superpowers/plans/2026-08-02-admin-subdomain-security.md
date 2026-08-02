# FairHaven Admin Subdomain Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve FairHaven operations from `admin.fairhaven.uz` with a host-isolated, revocable, CSRF-protected admin session while preserving the public shop and Telegram Mini App.

**Architecture:** Keep public, TMA, and admin Vite builds separate. Nginx and Express both route by exact host; `/api/admin/*` additionally enforces the configured admin host in application code. Browser bot confirmation and Telegram `initData` exchange both mint the same kind of opaque server-side session; protected routes accept no customer JWT and no raw `initData`.

**Tech Stack:** Express, Mongoose, Telegraf, Node test runner, React 18, Vite, Vitest.

## Global Constraints

- Production admin origin is exactly `https://admin.fairhaven.uz`.
- Public shop remains `https://fairhaven.uz`; Telegram shop remains `https://mini.fairhaven.uz`.
- No production secret, database, DNS, certificate, nginx reload, or deployment is touched during localhost work.
- Existing customer `fh_session` JWT remains valid for customer website routes but is never accepted by admin routes.
- Admin session cookie is host-only, opaque, HttpOnly, Secure in production, SameSite=Strict, and revocable.
- Every admin mutation requires exact Origin plus CSRF; production rejects missing Origin.
- Existing dirty worktree changes are preserved.
- Tests are written and observed failing before production code.

---

### Task 1: Lock admin API to one host

**Files:**
- Create: `backend/middleware/adminHostGate.js`
- Modify: `backend/routes/adminRoutes.js`
- Test: `backend/tests/adminSecurity.test.js`

**Interfaces:**
- Consumes: `ADMIN_ORIGIN` environment value.
- Produces: `adminHostGate(req, res, next)` and `configuredAdminHost()`.

- [ ] **Step 1: Write failing host-isolation tests**

  Cover exact production host acceptance, public/TMA/unknown host rejection, port normalization, and `ADMIN_ORIGIN` validation.

- [ ] **Step 2: Run RED check**

  Run `node --test tests/adminSecurity.test.js`; expect module-not-found or missing-host-gate failures.

- [ ] **Step 3: Implement exact host gate**

  Parse `ADMIN_ORIGIN` with `URL`, compare `req.hostname` to configured hostname, and return `421 {success:false,error:'admin_host_required'}` before any auth or controller on mismatch. Fail closed in production when origin is missing or invalid.

- [ ] **Step 4: Run GREEN check**

  Run `node --test tests/adminSecurity.test.js`; host cases pass.

### Task 2: Add opaque server-side admin sessions

**Files:**
- Create: `backend/models/AdminSession.js`
- Create: `backend/services/adminSession.js`
- Rewrite: `backend/middleware/adminAuthUnified.js`
- Modify: `backend/controllers/adminController.js`
- Test: `backend/tests/adminSecurity.test.js`

**Interfaces:**
- Produces: `issueSession({admin, req, res})`, `resolveSession(req)`, `revokeSession(req,res)`, `revokeAllForAdmin(telegramId)`, `csrfForToken(rawToken)`, `requireAdminSession`, `resolveAdminOptional`.

- [ ] **Step 1: Write failing session tests**

  Cover 256-bit token issuance, SHA-256-only persistence, exact cookie attributes, expiry, idle timeout, revoked session, role re-check, host binding, customer cookie rejection, raw Telegram header rejection, logout, and revoke-all.

- [ ] **Step 2: Run RED check**

  Run `node --test tests/adminSecurity.test.js`; expect missing model/service failures.

- [ ] **Step 3: Implement session model/service**

  Store token hash, numeric admin Telegram ID, host, creation/last-seen/absolute expiry, revoked timestamp, request IP, and bounded user agent. Use constant-time token comparisons where applicable. Throttle last-seen writes to once per minute. Cookie name is `__Host-fh_admin_session` in production and `fh_admin_session_dev` outside production.

- [ ] **Step 4: Replace protected-route auth**

  Remove public web-session, direct `initData`, and implicit development bypass from protected admin requests. Attach current User document after checking `role === 'admin'` on every request.

- [ ] **Step 5: Run GREEN check**

  Run focused session tests, then existing authorization tests.

### Task 3: Enforce Origin and CSRF on mutations

**Files:**
- Create: `backend/middleware/adminCsrf.js`
- Modify: `backend/routes/adminRoutes.js`
- Modify: `backend/controllers/adminAuthController.js`
- Test: `backend/tests/adminSecurity.test.js`

**Interfaces:**
- Consumes: authenticated `req.adminSession` and raw session cookie.
- Produces: stable HMAC-derived CSRF token returned by whoami and required in `X-FH-CSRF`.

- [ ] **Step 1: Write failing CSRF/origin tests**

  Cover missing/wrong token, missing/wrong Origin, correct token/origin, GET exemption, and `Sec-Fetch-Site: cross-site` rejection.

- [ ] **Step 2: Run RED check**

  Run focused tests; expect mutations to pass without protection.

- [ ] **Step 3: Implement defense-in-depth middleware**

  For POST/PUT/PATCH/DELETE, require exact configured origin in production and configured local origin in development, reject cross-site fetch metadata, and constant-time compare `X-FH-CSRF` to HMAC-SHA256 of raw session token using `ADMIN_CSRF_SECRET`. Fail startup/auth issuance in production if secret is absent.

- [ ] **Step 4: Run GREEN check**

  Focused tests pass; all existing admin mutations still work with valid headers.

### Task 4: Build verified admin login flows

**Files:**
- Create: `backend/models/AdminLoginAttempt.js`
- Create: `backend/models/ConsumedTelegramInitData.js`
- Create: `backend/services/adminLogin.js`
- Create: `backend/controllers/adminAuthController.js`
- Modify: `backend/routes/adminRoutes.js`
- Modify: `backend/bot/bot.js`
- Modify: `backend/middleware/rateLimit.js`
- Test: `backend/tests/adminSecurity.test.js`

**Interfaces:**
- Produces endpoints `POST /api/admin/auth/login/start`, `POST /api/admin/auth/login/poll`, `POST /api/admin/auth/telegram`, `GET /api/admin/auth/whoami`, `POST /api/admin/auth/logout`, and `POST /api/admin/auth/sessions/revoke-all`.
- Bot consumes `admin_<pollToken>` and callback data `admin_login:<approve|deny>:<attemptId>`.

- [ ] **Step 1: Write failing browser-login tests**

  Cover three-minute attempt TTL, hashed poll token, six-digit comparison code, admin-only approval, denied/expired state, atomic one-time poll consumption, and attempt A/B separation.

- [ ] **Step 2: Write failing Telegram exchange tests**

  Cover HMAC verification, five-minute auth-date window, replay prevention, numeric Telegram ID binding, non-admin rejection, and session issuance.

- [ ] **Step 3: Run RED checks**

  Run focused tests; expect missing contracts.

- [ ] **Step 4: Implement browser bot confirmation**

  Start returns random poll token, six-digit user code, bot URL, and expiry. Bot displays code plus bounded request context and requires explicit approve/deny callback. Poll atomically consumes approved attempt before issuing cookie.

- [ ] **Step 5: Implement TMA exchange**

  Validate Telegram signature using existing trusted parser, enforce auth-date freshness, consume SHA-256 replay key with TTL, require numeric admin ID, then issue normal host-bound session.

- [ ] **Step 6: Add scoped rate limits**

  Login start and exchange: five per fifteen minutes per normalized IP. Poll: sixty per five minutes per IP and token-hash prefix. Preserve broad API ceiling.

- [ ] **Step 7: Run GREEN checks**

  Focused tests and bot tests pass.

### Task 5: Move admin frontend to session-only auth

**Files:**
- Modify: `admin/src/api/client.js`
- Modify: `admin/src/api/auth.js`
- Modify: `admin/src/app/AccessGate.jsx`
- Modify: `admin/src/app/LoginPage.jsx`
- Modify: `admin/src/app/FullShell.jsx`
- Modify: `admin/src/app/QuickShell.jsx`
- Modify: `admin/src/lib/telegram.js`
- Modify: `admin/index.html`
- Test: `admin/src/api/client.test.js`
- Test: `admin/src/app/AccessGate.test.jsx`

**Interfaces:**
- API client keeps CSRF token in module memory and attaches it only to mutations.
- TMA sends raw initData only once to `/auth/telegram`; no protected request carries it.

- [ ] **Step 1: Write failing frontend auth tests**

  Cover CSRF mutation header, no Telegram header on business APIs, browser device-code display/poll, Telegram one-time exchange, dev session bootstrap, logout, and access denied.

- [ ] **Step 2: Run RED check**

  Run `npm run test:run`; expect old API-contract failures.

- [ ] **Step 3: Implement session-only client flow**

  Load whoami; if TMA and unauthenticated, exchange once then reload. In development only, call dedicated dev-login endpoint that mints a real session. Browser login displays comparison code and polls by POST. Store no credential or CSRF token in localStorage.

- [ ] **Step 4: Add Telegram SDK and logout UI**

  Load official SDK only on admin surface; logout revokes session before returning to access gate.

- [ ] **Step 5: Run GREEN check**

  Frontend tests pass.

### Task 6: Serve three builds by exact host

**Files:**
- Modify: `package.json`
- Modify: `admin/vite.config.js`
- Modify: `web/src/App.jsx`
- Modify: `backend/server.js`
- Modify: `backend/scripts/dev-local.js`
- Create: `deploy/nginx/fairhaven.conf`
- Modify: `docs/ADMIN_DEPLOY.md`
- Test: `backend/tests/webIntegration.test.js`

**Interfaces:**
- `fairhaven.uz` serves `web/dist`; `admin.fairhaven.uz` serves `admin/dist`; `mini.fairhaven.uz` serves `frontend/dist`.
- Public `/admin` redirects to admin origin.

- [ ] **Step 1: Write failing host-routing tests**

  Cover each host's index, public `/admin` redirect, unknown-host rejection, and API/static exclusions.

- [ ] **Step 2: Run RED check**

  Run integration test; expect current single-build behavior.

- [ ] **Step 3: Implement host-aware static routing and builds**

  Build all three apps. Admin Vite base becomes `/` and dev host becomes `admin.localhost`. Express uses exact host mapping and never falls back from one surface to another.

- [ ] **Step 4: Add nginx defense layer**

  Provide explicit TLS server blocks, same-host `/api` proxy, admin no-store HTML, default `444`, trusted proxy headers overwritten by nginx, and delayed HSTS preload note.

- [ ] **Step 5: Run GREEN check**

  Host-routing integration tests and three production builds pass.

### Task 7: Harden headers, audit, Excel, and rollout

**Files:**
- Modify: `backend/utils/http.js`
- Modify: `backend/services/adminAudit.js`
- Modify: `backend/controllers/adminController.js`
- Modify: `backend/controllers/excelController.js`
- Modify: `backend/scripts/dev-admin.js`
- Create: `backend/scripts/mint-admin-session.js`
- Test: `backend/tests/httpSecurity.test.js`
- Test: `backend/tests/adminSecurity.test.js`

**Interfaces:**
- Admin responses receive strict host-specific CSP and no-store.
- Break-glass script accepts Telegram ID via argv and prints a short-lived session once; it is disabled unless explicit environment guard is set and never exposes production secrets.

- [ ] **Step 1: Write failing hardening tests**

  Cover admin CSP, HSTS production behavior, no-store, complete session revocation on demotion, audit redaction, xlsx magic bytes/row/cell caps, and dry-run token ownership/replay.

- [ ] **Step 2: Run RED check**

  Focused tests fail for missing controls.

- [ ] **Step 3: Implement minimum controls**

  Keep CSP host-specific, revoke all sessions on demotion, record auth/session events without raw IP/token/cookie/initData, bound workbook structure before processing, and keep import apply atomic and non-destructive.

- [ ] **Step 4: Add rollout escape hatch**

  Add explicit `ADMIN_AUTH_MODE=hybrid|session` migration flag. Production target is `session`; hybrid is temporary and documented with removal condition. Break-glass command remains SSH-only.

- [ ] **Step 5: Run GREEN check**

  Focused tests, full backend suite, admin tests, channel tests, dependency audits, and builds pass.

### Task 8: Browser proof and critical review

**Files:**
- Review only: changed production and test files.
- Evidence: task workspace outside repository.

- [ ] **Step 1: Start isolated localhost stack**

  Use in-memory MongoDB, no Telegram token, and `http://admin.localhost:5173`.

- [ ] **Step 2: Run desktop/mobile browser checks**

  Verify login/bootstrap, dashboard, order mutation with CSRF, product/Excel dry run, Billz connection status, logout, refresh, blocked public-host API, and console/network errors at 1440×1000 and 375×812.

- [ ] **Step 3: Run Fable 5 max review**

  Send only selected diff through stdin to `claude-fable-5` with tools disabled. Fix verified P0/P1 findings through new RED-GREEN cycles.

- [ ] **Step 4: Final verification**

  Re-run all relevant tests/builds and inspect final diff for unrelated edits, secrets, disabled security, and placeholders. Leave changes uncommitted/unpushed for user localhost review.
