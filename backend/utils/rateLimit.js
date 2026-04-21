function createRateLimiter({ windowMs = 60_000, max = 120 } = {}) {
  const hits = new Map();

  return (req, res, next) => {
    const forwardedFor = req.headers['x-forwarded-for'];
    const firstForwardedIp = typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0].trim()
      : '';
    const key = req.ip || firstForwardedIp || 'unknown';
    const now = Date.now();
    const entry = hits.get(key);

    if (hits.size > 10_000) {
      for (const [k, v] of hits.entries()) {
        if (now > v.resetAt) hits.delete(k);
      }
    }

    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      const retryAfter = Math.max(Math.ceil((entry.resetAt - now) / 1000), 1);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ success: false, error: 'Too many requests' });
    }

    return next();
  };
}

module.exports = { createRateLimiter };
