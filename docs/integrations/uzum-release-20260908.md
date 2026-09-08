# FairHaven Uzum production release — 2026-09-08

Status: **application deployed; Uzum not activated**.

## Installed release

- Application revision: `a3575faf0e7c9de96b861b76e2dd37099b7b9614`, branch `codex/uzum-production-20260908`, installed at10:40UTC /15:40Asia/Tashkent.
- Production repository: `/home/movixa-bridge2/fairhaven-tma` on the existing BKM VPS.
- Original integration branch was also pushed, through application revision `59ec90937534ffc4f4990008ab235c551c5c4dbc`. Its Medicalka notification repair remains in Git but was deliberately excluded from this production release.
- This report and its checklist update are documentation-only; no additional restart is needed when those commits are fast-forwarded onto the installed application revision.
- Admin: existing Connections page contains Uzum credential controls; existing Orders page contains Uzum orders/actions. No new admin system was introduced.

## Verification

- Candidate:413 channel tests,225 backend tests,102 admin tests across27 frontend files; **740/740 passed**, zero skipped. Production admin build passed.
- Original integration branch:657 combined channel/backend tests passed after the final cherry-pick. Its additional Medicalka tests explain the count difference.
- Local accounting tests used MongoDB7.0.34, matching production, with no live credentials or .env files and fake external services. Stock race and restart/timestamp regressions were observed failing before their corrections.
- Independent code and security reviews approved the disabled release. Broader cross-channel counter-repair races and partner stock-read consistency were not claimed solved.
- Changed JavaScript passed syntax checks under production Node20.20.2. Runtime dependency manifests were unchanged; only development test dependencies were added locally.
- Installed nginx config matched its Git source; nginx syntax test and reload passed. Existing unrelated listener warnings were not modified.
- Only PM2 `fairhaven` and `channel-hub` restarted, once each. Their restart counts stabilized at15 and47. Unrelated services were unchanged.
- Backend and hub health returned`ok`. Catalogue boot sync succeeded:29 mirrored products,28 with positive physical stock,0 pending Billz requests.
- Admin HTML/CSS/JS checksums matched the locally tested build. Old hashed assets were retained for already-open browser tabs.
- Browser review of`admin.fairhaven.uz` was not performed: its saved browser permission still blocks access. No alternate route was used to bypass that restriction. Successful artifact/component tests are not a claim of signed-in browser verification.

## Medicalka preservation

- Medicalka-specific modules, adapter, configuration and key model have no diff against prior production394f4f7.
- Root/channel environment files and existing dirty admin lockfile retained their original SHA256 fingerprints.
- Medicalka credential metadata retained its exact fingerprint:3 active read tokens and3 active order secrets. None were printed, issued, rotated or revoked.
- Necessary shared stock consumers now account for Uzum sold holds; this is not a claim that every shared file is byte-identical.
- Non-Uzum soldAt semantics match prior production. Telegram setup and polling fallback now preserve pending updates; existing transport/authentication is unchanged.
- Telegram resumed configured polling mode; bot identity lookup succeeded. No test notification was sent.
- One normal startup Medicalka sub-order poll returned`medicalka_http_400`. Subsequent automatic polling recovered: at10:44:55/56UTC, both approval and sub-order summaries reported recent success, empty current error and`stale:false`. No Medicalka repair or configuration change was made.

## Not activated / not proven

- Uzum remains disabled. No confirmed store ID, signing key or active Uzum OAuth credential is configured; no product is selected for Uzum and no Uzum order exists.
- Shared Billz writes remain disabled, exactly as before deployment. Enabling them is a separate cross-channel decision, not an Uzum-only switch.
- Needed: confirmed partner store mapping, accepted assortment/features, secure dedicated credentials/configuration, isolated partner acceptance and explicit production enablement.
- No live test order, payment, reservation, stock movement, courier action or Telegram test send was performed. Existing service schedulers resumed their normal work; no manual external poll/write was used as a test.
- Local tests do not prove partner acceptance, real Billz settlement, delivery tracking or refunds. Supported scope and remaining limitations are in`uzum-operator-flow.md` and`uzum-tezkor-api.ru.md`.

## Preservation and rollback

- Before-release application commit:394f4f7 on`codex/medicalka-immediate-sale`, still present in the production repository.
- Recovery directory:`/home/movixa-bridge2/fairhaven-uzum-release-20260908.wA3wmQ`.
- It retains old admin distribution, switch-time distribution, dirty admin lockfile copy and original nginx vhost. New source/admin archives are also retained there. No existing uploads, public/TMA builds, environment files or untracked environment backup were removed.
- Before any Uzum sale, rollback can restore prior source/admin/nginx with preserved environment/dirty files and restart only affected services after preflight.
- After real Uzum sales, do **not** blindly revert to394f4f7: that code ignores persisted Uzum sold holds. Disable Uzum on hold-aware code and reconcile accounting before considering rollback. Never clear live reservations/holds merely to make a rollback appear clean.
