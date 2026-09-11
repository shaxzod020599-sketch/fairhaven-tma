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
