# Retail production release — 2026-09-10

## Installed, not activated

Production source was fast-forwarded from `f5dd07d865d5a17a0b98ec4f7365118613bf10d7` to `9ebbdc73952147de61bc6e4523528c6e64195b5a`. The tested admin build and reviewed API nginx configuration were installed. Only `fairhaven` and `channel-hub` were restarted; nginx validation and reload succeeded.

Uzum and Yandex remain disabled. Channel health reports `writeEnabled: false`. This release does not claim partner onboarding or live order processing is complete. Confirmed partner place/store mappings, signing configuration, published assortment (including required Uzbekistan service codes), and an approved accounting activation remain launch gates. No live order, payment, stock movement, or test Telegram message was performed.

## Verification

- Pre-release application evidence: 903 backend/channel tests and 163 admin tests passed; admin build passed. See the 2026-09-09 contract and admin verification reports. These application suites were not rerun during the production switch.
- Production Node 20.20.2 previously validated all 182 candidate backend/channel JavaScript files.
- Release transport and local vault-helper regression tests: 9/9 passed on release day. Bash syntax validation passed.
- Both services remained online with unchanged post-restart PIDs at the 53-second follow-up.
- Backend loopback health with the public `fairhaven.uz` Host returned `{"status":"ok"}`. A bare loopback Host correctly returned 421 `host_not_allowed` under the existing production host guard; no guard was weakened.
- Channel loopback health returned HTTP 200, `status: ok`, `writeEnabled: false`.
- All six active Medicalka credential records remained intact. Stable credential-field digest matched the pre-release baseline. No key issuance, rotation, or revocation occurred.
- Root/channel environment file hashes and the existing dirty admin lockfile hash matched the pre-release baseline. Existing untracked environment backup was preserved.
- Installed admin index SHA-256: `6524186da9df1036c6a0db2cc654b5db9351470acc614c1a27b199967fa5d9e0`.
- Installed nginx candidate SHA-256: `f0f366af668d79f2adb5d96ed29a197485bfc922c138879208e306e19e4ec485`.
- Production admin browser verification was not performed. Local isolated admin browser verification is recorded separately.

## Recovery material

The server directory `/home/movixa-bridge2/fairhaven-retail-candidate-20260909.XwDi4L` retains the prior nginx configuration, prior admin build archive, existing admin lockfile backup, and exact candidate source/build archives. Old hashed admin assets were retained for open tabs; the index was replaced after copying new assets. Runtime dependency manifests and lockfiles did not change in this release.

The release-specific helper in `scripts/security/fairhaven-nginx-release.cjs` permits only four fixed nginx operations. Password input is sent through SSH stdin, excluded from child SSH environment/argv, and remote output is suppressed. SSH explicitly disables PTY and requires the existing trusted host key. Do not repoint this one-off helper without a new review.

## Approved local vault-helper correction

The separately approved machine-local `ai-secret` run/auto correction uses Bash builtin export before executing the destination, avoiding an external `env` process containing credentials in argv. Invalid environment names are rejected without echoing values. The encrypted vault itself was unchanged. Other helper commands were outside scope.

Verified helper SHA-256: `1380cc6ef34bf4688b8f9f0254b99114cf158deabf133f0bf8659075b0e3fce7`. Regression tests are intentionally outside application suites and use synthetic credentials only.

## Scope check

- Assumptions: installation is distinct from live marketplace activation.
- Minimum change: reviewed retail release plus narrow approved credential transport correction.
- Traceability: no unrelated application or global configuration changes.
- Evidence: local regressions, production health, credential fingerprints, and artifact hashes checked; live transactional behavior remains deliberately untested.
