const TRANSIENT_CODES = new Set([
  'EAI_AGAIN',
  'ECONNRESET',
  'ECONNREFUSED',
  'ENETUNREACH',
  'ETIMEDOUT',
]);

function isTransientTelegramError(err) {
  const code = err?.code || err?.cause?.code;
  if (TRANSIENT_CODES.has(code)) return true;

  const status = Number(err?.response?.error_code || err?.response?.status || err?.status);
  if (status === 429 || status >= 500) return true;

  return /fetch failed|network|socket hang up|timed? ?out/i.test(err?.message || '');
}

function retryDelay(err, fallback) {
  const retryAfter = Number(err?.response?.parameters?.retry_after);
  return retryAfter > 0 ? retryAfter * 1000 : fallback;
}

/**
 * Retry budgets by how much the call is worth waiting for.
 *
 * VPS egress to api.telegram.org is throttled (~60% failure rate per call from
 * UZ networks), so retrying is not optional. But the same budget everywhere is
 * wrong: `critical` can take ~28s in the worst case, which is right for an
 * order that must not be lost and badly wrong inside a broadcast, where it
 * stalls a worker for one unreachable recipient.
 */
const RETRY_TIERS = {
  // An order reaching the operators' channel. Losing it loses the sale.
  critical: [500, 1500, 3500, 7500, 15000],
  // Customer-facing status messages: worth pursuing, not worth blocking on.
  normal: [500, 1500, 3500],
  // Mass sends. A miss costs one impression; the next broadcast catches up.
  bulk: [500, 1500],
  // Card edits: the following status change rewrites the message anyway.
  edit: [500, 1500],
};

/** True when Telegram says this chat can never receive messages again. */
function isPermanentlyUnreachable(err) {
  const code = Number(err?.response?.error_code || err?.code);
  if (code !== 403 && code !== 400) return false;
  const description = String(err?.response?.description || err?.message || '').toLowerCase();
  return /blocked by the user|user is deactivated|chat not found|bot was kicked|user_deactivated/
    .test(description);
}

async function withTelegramRetry(operation, options = {}) {
  const delays = options.delays
    || RETRY_TIERS[options.tier]
    || RETRY_TIERS.critical;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (err) {
      if (!isTransientTelegramError(err) || attempt >= delays.length) throw err;
      await new Promise((resolve) => setTimeout(resolve, retryDelay(err, delays[attempt])));
    }
  }
}

async function launchBotWithRetry(bot, options = {}) {
  const delays = options.delays || [1000, 5000, 15000, 30000];
  const isStopping = options.isStopping || (() => false);
  let attempt = 0;

  while (!isStopping()) {
    try {
      await bot.launch();
      if (isStopping()) return;

      const error = new Error('Bot polling stopped unexpectedly');
      error.code = 'BOT_POLLING_STOPPED';
      throw error;
    } catch (err) {
      if (isStopping()) return;

      const isConflict = Number(err?.response?.error_code) === 409;
      const isUnexpectedStop = err?.code === 'BOT_POLLING_STOPPED';
      if (!isTransientTelegramError(err) && !isConflict && !isUnexpectedStop) throw err;

      const delay = delays[Math.min(attempt, delays.length - 1)];
      attempt += 1;
      options.onRetry?.(err, delay, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

module.exports = {
  isPermanentlyUnreachable,
  isTransientTelegramError,
  launchBotWithRetry,
  withTelegramRetry,
  RETRY_TIERS,
};
