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
  const delays = options.delays || [300, 1000];

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (err) {
      if (!isTransientTelegramError(err) || attempt >= delays.length) throw err;
      await new Promise((resolve) => setTimeout(resolve, retryDelay(err, delays[attempt])));
    }
  }
}

module.exports = {
  isTransientTelegramError,
  withTelegramRetry,
};
