# Retail connection details

## Operator workflow

Open **Подключения → Данные подключения**. Uzum and Yandex have separate cards containing Host, Client ID and an explicitly revealed Client secret. The common Place identifies the FairHaven branch. Copying a complete partner bundle uses the saved Place, never an unsaved edit.

The common Place is handoff metadata only: saving it does not enable a channel or repoint its runtime mapping. The panel displays whether the saved Place matches the running API. Activation, signing configuration, assortment and accounting remain separate launch gates. Keep separate client credentials for each partner.

Existing keys are not rotated. For previously issued OAuth secrets whose protected copy is missing, **Восстановить копию** accepts only the original secret matching the stored authentication hash. It cannot change the hash, client, channel or active status. Revoked keys and Medicalka keys cannot be revealed or restored through this surface. A Yandex access pair can be created using the existing explicit creation action; none is automatically created by opening this panel.

## Security and recovery

- Authentication still uses the original SHA-256 hash. Optional OAuth handoff copies use AES-256-GCM with a random nonce and channel/client-bound authenticated data.
- Encryption key is derived from the existing strong internal transport token with a separate HKDF domain. No new plaintext key is written to config or source. Rotating that transport token invalidates old encrypted copies; recover by restoring the same partner secrets from the operator vault. Never regenerate partner credentials as an automatic fallback.
- Copies are excluded from ordinary model projections and all credential lists. Separate POST reveal requires the existing admin-host session, current admin role, Origin and CSRF checks, with a dedicated rate limit and no-store response.
- Dialog memory is cleared on close or hidden-tab events. Late responses cannot restore hidden secrets. Browser persistent storage is not used. Clipboard contents are intentionally controlled by the operator; the application cannot guarantee their removal from OS clipboard history.
- Audit records contain operation and record identifiers only. New error paths return constant messages, not raw exceptions or credential-bearing bodies.
- The one-off restoration scripts are restricted to the already-issued Uzum client and Place. Vault input travels on SSH stdin; remote output is suppressed. These scripts do not issue/revoke keys, activate channels, place orders or move inventory.

## Verification

The isolated backend/channel suite passed 912 tests on 2026-09-10. The initial run had one expected allowlist mismatch for the newly owned `retailconnections` collection; its exact entry was added without relaxing bot-owned collection protections. Tests cover encryption, ciphertext substitution, active-key checks, same-secret restore, Medicalka exclusion, admin/session/CSRF/host boundaries and safe proxy output.

The local browser fixture passes desktop1440 and phone390 widths with synthetic API responses only. Initial mobile overflow was reproduced and fixed within Connections styles. External requests and unhandled API requests are blocked. No production admin browser, real order, stock change or Telegram test is used.

Independent code/security review approved the application changes and secure restore transport. The small post-review missing-copy warning fix is covered by a regression test that failed before the correction.

## Scope check

1. Assumptions explicit: shared Place is handoff metadata, not live channel activation.
2. Minimum implementation: existing Connections UI and authentication models extended; no second panel or bot.
3. Changes trace to credential display, restoration, scoped layout, tests and deployment evidence.
4. Verification uses isolated tests and local browser fixtures; production operational claims require separate release checks.

## Production release — 2026-09-11

- Installed application commit `12bd7df002c8cb920c2ce4c883ae462fabafaa2b`, fast-forward from `9ebbdc7`. Restarted only `fairhaven` and `channel-hub`; no nginx or environment change was needed.
- Admin verification rerun: 169/169 tests in31files and production build passed. Secure transport tests:10/10. Desktop/mobile browser fixture passed again with no external/API escapes or page errors. Backend/channel result remains912/912 from the preceding completed run.
- Restored the already-issued Uzum secret once through the reviewed stdin-only transport. A read-only server check decrypted its stored copy inside the process and confirmed its hash matches the existing authentication record. Authentication fingerprint was unchanged. No secret was printed, committed or written to plaintext configuration.
- Set common handoff Place to the existing bundle's `6d2c8ecc-e818-4812-9b34-146c6f312f56`. Runtime mappings and both marketplace enable flags remain unchanged/disabled. There are no active Yandex keys yet; the panel's explicit creation action remains available.
- All six active Medicalka credentials retain the baseline fingerprint. Root/channel environment files and the pre-existing modified admin lockfile retain their baseline hashes. The encrypted Mac vault is unchanged.
- Backend health returned `status: ok` using the allowed public Host with curl; channel health returned200 with `writeEnabled: false`. The Node fetch-based backend check returned421 under the existing Host guard; no guard was weakened. Production admin browser access was not used.
- Installed admin index SHA-256: `3d6706dabaeee485d09a560d034545d2f79f9956a8689c33c3727186d79bc8b1`.
- Recovery assets: `/home/movixa-bridge2/fairhaven-connections-release-20260911.6efDLr` contains prior admin build and dirty lockfile backup. Existing hashed admin assets were retained. The optional encrypted OAuth field and new metadata collection are additive; older authentication ignores both.
- No real orders, inventory movements, payments or Telegram test messages were performed. Partner credentials were not sent externally.
