# Medicalka Telegram delivery repair

## Observed production state

Read-only inspection on 2026-09-06 found the latest production approval created
on 2026-09-03 at 15:54:17 UTC. Its notification records contain three admin
messages and one operations-channel message, sent at 15:54:23 UTC. Medicalka
subsequently returned `Auto-rejected: no response within the time limit`;
Telegram cards were finalized starting at 15:57:26 UTC.

This confirms an upstream three-minute timeout for that approval. It does not
prove that the user's unidentified message originally arrived without buttons.
Paid-order/lifecycle notifications are informational and intentionally have no
approval buttons. Only pending, actionable, active-checkout approvals have them.

## Changes

- Preserve the notification result through the runtime. Disabled Telegram,
  absent credentials, and absent recipients no longer count as successful
  delivery; existing durable retry and recipient deduplication remain in use.
- Pass the correct scoped approval model to finalization. Staging and production
  notifications cannot accidentally finalize each other's collection.
- Match finalization by chat and message, including legacy admin message records.
  Telegram message IDs alone are not globally unique.
- Do not finalize an actionable approval. Recheck after sending so a closure
  racing delivery still cleans up the newly persisted card.
- Show the response deadline in Asia/Tashkent and a bounded, HTML-escaped closure
  reason. Do not extend Medicalka's deadline or retain usable buttons on closed
  approvals.
- Budget the whole card before escaping HTML, reserving space for status and
  deadline. Oversized product/customer text is visibly shortened; full source
  data stays unchanged. This prevents the added deadline/reason from exceeding
  Telegram's [message limit](https://core.telegram.org/bots/api#sendmessage).

## Verification and release boundary

Root verification: 149 Medicalka tests passed across channel and backend suites
on 2026-09-06, including local Mongo notification retries, model isolation,
same-message-ID collisions, send/closure races, callback authorization, existing
API wire types, and paid-order idempotency. Four further whole-card boundary
regressions reproduced overflow and split emoji before the follow-up fix and
passed afterwards. Rendering tests cover HTML validity and preserved source
data as well as the limit.

All test traffic used local fixtures and mocked integration calls. No real
Telegram message, Medicalka decision, Billz transaction, or inventory mutation
was performed. Existing API credentials, tokens, admin permissions, shared order
processing and stock calculations were not changed.

This patch is source delivery, not a production deployment. After an authorized
deployment, the operator can inspect the next genuine pending approval in an
admin DM and the configured operations channel before its displayed deadline.
An end-to-end production delivery result is not claimed here.
