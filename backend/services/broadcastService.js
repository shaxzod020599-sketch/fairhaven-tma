const User = require('../models/User');
const Order = require('../models/Order');
const { withTelegramRetry } = require('../utils/telegramRetry');

/**
 * Segment resolution and bounded delivery for admin broadcasts.
 *
 * Everything here is deliberately conservative: recipients are capped, sends
 * are paced under Telegram's 30 msg/s ceiling, a chat that reports 403 is
 * marked botBlocked so the next broadcast stops paying for it, and one failed
 * chat never aborts the run.
 */

const MAX_RECIPIENTS = 5000;
const SEND_GAP_MS = 40;

const DAY_MS = 24 * 60 * 60 * 1000;

const ELIGIBLE_FILTER = {
  role: 'user',
  registrationStep: 'done',
  consentAccepted: true,
  notificationsEnabled: true,
  botBlocked: { $ne: true },
  customerBlocked: { $ne: true },
  telegramId: { $ne: null },
};

/** telegramIds of customers with at least one order in the last `days`. */
async function buyerIdsSince(days) {
  const since = new Date(Date.now() - days * DAY_MS);
  const ids = await Order.distinct('telegramId', {
    createdAt: { $gte: since },
    telegramId: { $ne: null },
  });
  return new Set(ids.map(Number));
}

/**
 * Returns `{ count, telegramIds }` for a segment. `telegramIds` is capped at
 * MAX_RECIPIENTS; `count` reports the true size so the panel can say when the
 * cap bit.
 */
async function resolveSegment(segment) {
  const eligible = await User.find(ELIGIBLE_FILTER)
    .select('telegramId')
    .limit(50000)
    .lean();
  let ids = eligible.map((u) => Number(u.telegramId)).filter(Boolean);

  if (segment === 'recent30') {
    const buyers = await buyerIdsSince(30);
    ids = ids.filter((id) => buyers.has(id));
  } else if (segment === 'inactive90') {
    const buyers = await buyerIdsSince(90);
    ids = ids.filter((id) => !buyers.has(id));
  } else if (segment !== 'all') {
    const err = new Error(`unknown segment: ${segment}`);
    err.code = 'invalid_segment';
    throw err;
  }

  return { count: ids.length, telegramIds: ids.slice(0, MAX_RECIPIENTS) };
}

function isForbidden(err) {
  const status = err?.response?.error_code || err?.code;
  return Number(status) === 403;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Delivers `broadcast` to its resolved segment and persists progress on the
 * document. Runs to completion; callers fire it without awaiting so the HTTP
 * response returns immediately while `status` tracks the run.
 */
async function deliver({ broadcast, bot }) {
  const counts = { targets: 0, sent: 0, failed: 0, skipped: 0 };
  try {
    const { count, telegramIds } = await resolveSegment(broadcast.segment);
    counts.targets = count;

    for (const telegramId of telegramIds) {
      try {
        await withTelegramRetry(
          () => bot.telegram.sendMessage(telegramId, broadcast.text, { parse_mode: 'HTML' }),
          { tier: 'normal' }
        );
        counts.sent += 1;
      } catch (err) {
        if (isForbidden(err)) {
          counts.skipped += 1;
          User.updateOne({ telegramId }, { $set: { botBlocked: true } }).catch(() => {});
        } else {
          counts.failed += 1;
        }
      }
      broadcast.counts = counts;
      if ((counts.sent + counts.failed + counts.skipped) % 25 === 0) {
        await broadcast.save().catch(() => {});
      }
      await sleep(SEND_GAP_MS);
    }

    broadcast.status = 'completed';
  } catch (err) {
    broadcast.status = 'failed';
    broadcast.lastError = err.message;
  }
  broadcast.counts = counts;
  broadcast.finishedAt = new Date();
  await broadcast.save().catch((err) => console.warn('[broadcast] save failed:', err.message));
  return broadcast;
}

module.exports = { resolveSegment, deliver, ELIGIBLE_FILTER, MAX_RECIPIENTS };
