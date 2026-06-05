# Fairhaven Security Hardening Design

## Goal

Close critical application and host security gaps without deleting data, changing
notification text, sending broadcasts, or changing visible design.

## Safety Constraints

- Back up MongoDB before deployment and verify backup checksum.
- Work only in `codex/security-hardening` until verification passes.
- Never create real orders or trigger product, discount, restock, or status
  notifications during tests.
- Preserve existing notification behavior and text.
- Preserve existing user, order, product, setting, and upload data.
- Do not disable SSH password authentication until owner confirms working key
  access.

## Application Architecture

### Telegram Authentication

Frontend sends Telegram WebApp `initData` in `X-Telegram-Init-Data` for API
requests. Backend validates HMAC signature with bot token, rejects stale data,
and attaches authenticated Telegram user to `req.telegramUser`.

Admin authorization uses only validated Telegram identity plus database
`role=admin`. `X-Admin-Telegram-Id` and local-storage admin impersonation are
removed.

### Resource Authorization

- Public product catalog, visible collections, approved public settings, legal
  pages, and health endpoint remain public.
- User profile and address operations require signed Telegram identity and may
  access only caller identity.
- Order creation, list, detail, cancellation, and promo validation require
  signed Telegram identity. Order reads and cancellation require ownership.
- All order status mutation and product mutation routes require verified admin.
- Existing admin routes remain verified-admin-only.

### Data Integrity And Privacy

- Order item names and prices come from current database products. Client sends
  product ID and quantity only as authoritative inputs.
- Quantities, IDs, text fields, coordinates, and request sizes receive bounded
  validation.
- User updates use explicit allowlists; role, Telegram ID, consent state,
  registration state, and promo history cannot be changed by user API.
- Public settings endpoint returns only approved storefront keys.
- API errors return stable generic messages; detailed errors remain server-side.
- Request logs exclude query strings, bodies, auth headers, and Telegram IDs.

### Edge And Host

- Add security headers and API rate limits at Nginx.
- Bind Node services to loopback so direct ports cannot bypass Nginx.
- Keep MongoDB bound to loopback. Do not enable Mongo auth during this deploy
  because current application credentials and rollback path need staged work.
- Fix Fairhaven certificate renewal only if affected certificate is unhealthy;
  unrelated `movixa.uz` renewal remains separate.
- Keep SSH password login until verified key access exists; reduce exposure only
  through non-lockout settings safe for current access.

## Compatibility Rollout

Backend and frontend deploy together. Signed auth becomes required immediately
after frontend build and backend restart. Existing Telegram clients receive
fresh frontend HTML because it is served with `no-store`; users opening stale
assets receive clear authorization failure and can reopen Mini App. No legacy
spoofable header fallback remains.

## Testing

- Unit tests prove valid/invalid/stale Telegram signatures.
- Route tests prove admin header spoofing fails, cross-user reads fail, user
  role mass-assignment fails, product writes require admin, and order pricing
  ignores client price.
- Existing notification tests stay green.
- Build frontend.
- Before and after deploy compare collection counts and recent-record IDs.
- Verify public catalog works, unauthorized private/admin routes return 401/403,
  signed synthetic auth reaches expected routes without database writes, health
  returns 200, PM2 remains online, logs show no new errors, and no Telegram send
  method is called.

## Rollback

Keep pre-deploy Git commit, database archive, Nginx backup, and host-config
backup. If health or signed-auth verification fails, restore previous app commit
and Nginx config, restart Fairhaven, then verify counts and health. Database
restore is last resort because planned changes do not migrate or delete data.
