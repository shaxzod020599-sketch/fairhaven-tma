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

async function withTelegramRetry(operation, options = {}) {
  // VPS egress to api.telegram.org is throttled (~60% failure rate per
  // call from UZ networks). 5 retries with widening backoff lift effective
  // success rate to ~99% while keeping worst-case latency under ~30s.
  const delays = options.delays || [500, 1500, 3500, 7500, 15000];

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
  isTransientTelegramError,
  launchBotWithRetry,
  withTelegramRetry,
};
