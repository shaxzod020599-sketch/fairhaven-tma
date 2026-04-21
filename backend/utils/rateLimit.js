function createRateLimiter({ windowMs = 60_000, max = 120 } = {}) {
  const hits = new Map();

  return (req, res, next) => {
    const key = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const now = Date.now();
    const entry = hits.get(key);

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
