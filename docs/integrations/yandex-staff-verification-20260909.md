# Yandex staff transport and Telegram verification — 2026-09-09

Status: Task 2 accepted after local verification and independent code/security approval. No production deployment or activation. Existing admin order UI is Task 3, not delivered by this checkpoint.

## Scope

- Five existing-admin endpoints connect list, detail, eligible products, versioned picking and staff decisions to the accepted Yandex lifecycle. Existing host/session/CSRF gates remain in force. Actor identity is server-derived; channel service verifies current persisted admin role again.
- Existing Telegram bot receives a separate compact `ya` callback namespace for accept/cooking/ready/reject. Displayed order and item revisions are forwarded. Callbacks acknowledge only; the durable notifier owns card updates.
- Yandex cards go to current admin private chats only. Existing Medicalka/Uzum shared-channel behavior remains unchanged. Role and bot-blocked state are rechecked before each recipient operation. Previously notified revoked recipients receive keyboard removal only, never fresh order text.
- Yandex-only single-attempt HTTP transport prevents cached customer content from being retried after admin demotion. Redirects are rejected; requests have an eight-second timeout; raw transport data is not logged. Durable retries reauthorize and preserve recipient fingerprints. A separate per-order cooldown survives order revisions and restarts; both drain selection and atomic delivery claims enforce it. Lease-owned monotonic cooldown updates do not acknowledge newer pending work. Shared Telegram transport was not changed.
- Owned leases and revision checks protect persisted delivery state. A card rendered before the stale-operation threshold retains its presentation deadline even if sending crosses that threshold. Presentation refresh never retries accounting.

## Verification evidence

Root independently confirmed initial Task 2 **880/880**. Independent reviewers then reproduced two medium defects: losing the presentation refresh when delivery crosses its threshold, and shared transport internally retrying cached text after admin demotion.

Focused presentation regression: 17 tests, 14 passed and 3 failed before the correction; then17/17 passed. Combined first correction:36/36 focused and root891/891 full. A subsequent actual-default reproduction confirmed that a revision reset could discard Telegram's60-second deadline and permit a send after5seconds. The separate cooldown closes that case; final focused tests:39/39. Actual default transport tests use fake HTTP with real temporary Mongo, not an injected high-level send that would hide inline retries.

Root independent final full run finished 2026-09-08 at20:52UTC: **894 tests,894 passed,0 failed,0 cancelled,0 skipped,0 todo**,41.29seconds. Node24.14.1 and isolated Mongo7.0.34; cleared environment, dotenv disabled, loopback-only guard, fake external transports. No live order, inventory operation, BILLZ request or Telegram message.

Changed JavaScript syntax and diff checks passed. Source-diff SHA256 against1566973: `4b9407348af98ca1f3ea58679c734057eb199e0f3996aae388c20e321b7fbace`, unchanged before/after the root run. Log: `/tmp/fairhaven-retail-task2-cooldown-root-full.log`. Narrow private-key/token-pattern scan found no match; this is not a full secret-scanner claim.

Code reviewer independently passed3 original presentation tests and4 cooldown tests, including legacy missing/null fields, exact deadlines, lifecycle reset, restart and stale direct claims. Security independently passed its actual-default privacy and concurrent-revision reproductions2/2. Both reviewers approved the final delta with no remaining concrete finding.

The public Telegram implementation URL-decodes the request path before extracting the bot token: [HTTP parser](https://github.com/tdlib/td/blob/master/tdnet/td/net/HttpReader.cpp), [token extraction](https://github.com/tdlib/telegram-bot-api/blob/master/telegram-bot-api/HttpConnection.cpp). Encoded token-path compatibility was checked against this source, not through a live request.

Medicalka-specific modules and shared Telegram transport have no diff from installed f5dd07d. No environment, key model, credentials, shared accounting, admin UI or deployment configuration changes are part of Task 2. Existing source changes from earlier accepted Yandex phases are separately documented.

## Limits and remaining work

Telegram delivery and Mongo acknowledgement cannot be atomic. A crash between them may duplicate a card; exactly-once messaging is not claimed. Already delivered content cannot be retracted by a later role change. Keyboard cleanup runs when an order next enters notification delivery, not through a global role-change scan. Cooldown is per Yandex order, not a global limiter for the shared bot.

Ready settlement remains a local implementation assumption, not financial activation approval. BILLZ_WRITE_ENABLED and production settings remain untouched. Admin order UI, final Uzum contract corrections, proxy configuration, full release checks and partner acceptance remain separate gates. Local fixtures do not prove real partner acceptance or BILLZ settlement.
