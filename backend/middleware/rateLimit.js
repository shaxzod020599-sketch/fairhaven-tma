const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

/**
 * Rate limiters.
 *
 * IMPORTANT: these only work correctly when `app.set('trust proxy', ...)` is
 * configured, otherwise every request behind nginx looks like it comes from
 * 127.0.0.1 and a single busy client throttles everyone. server.js sets it.
 *
 * Telegram delivers webhook updates from its own IP range at a rate we do not
 * control, so the webhook path is never rate limited — it is authenticated by
 * a secret token instead.
 */

const DISABLED = process.env.DISABLE_RATE_LIMIT === 'true';

function limitReached(_req, res) {
  res.status(429).json({ success: false, error: 'too_many_requests' });
}

function build({ windowMs, max, keyGenerator }) {
  if (DISABLED) return (_req, _res, next) => next();
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: limitReached,
    ...(keyGenerator ? { keyGenerator } : {}),
  });
}

// Broad ceiling for the whole API. Sustained ~2 req/s per IP, which clears the
// admin panel (10-15 calls per page) and the site's login status polling with
// room to spare.
const apiLimiter = build({
  windowMs: 5 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_API_MAX || 600),
});

// Guessable-secret endpoints: bot login handshake, promo codes, guest checkout.
// A legitimate caller hits these a handful of times; an attacker needs volume.
const authLimiter = build({
  windowMs: 5 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_AUTH_MAX || 30),
});

// Admin authentication has a much smaller legitimate volume than customer
// login. Keep it separate so public traffic cannot consume the operator budget.
const adminLoginLimiter = build({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_ADMIN_LOGIN_MAX || 5),
});

// Login status polls every ~2 seconds for at most three minutes.
const adminPollLimiter = build({
  windowMs: 5 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_ADMIN_POLL_MAX || 120),
});

// Uploads are keyed per admin rather than per IP: several admins may share one
// office NAT, and an admin importing a batch of product photos is legitimate.
// `req.admin` is set by the mini-app gate, `req.webUser` by the site gate.
const uploadLimiter = build({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_UPLOAD_MAX || 60),
  // ipKeyGenerator normalises IPv6 to its /64 prefix; using req.ip raw would
  // let one IPv6 client rotate addresses within its own subnet to bypass this.
  keyGenerator: (req) => {
    const id = req.admin?.telegramId ?? req.webUser?.telegramId;
    return id ? `admin:${id}` : `ip:${ipKeyGenerator(req.ip)}`;
  },
});

// Excel generation is CPU/memory-heavy and can page through up to 5,000 rows.
// Keyed per authenticated admin so one operator cannot consume every worker.
const adminExportLimiter = build({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_ADMIN_EXPORT_MAX || 10),
  keyGenerator: (req) => {
    const id = req.admin?.telegramId;
    return id ? `admin-export:${id}` : `ip:${ipKeyGenerator(req.ip)}`;
  },
});

module.exports = {
  retailCredentialLimiter: build({ windowMs: 15 * 60 * 1000, max: 30 }),
  adminExportLimiter,
  adminLoginLimiter,
  adminPollLimiter,
  apiLimiter,
  authLimiter,
  uploadLimiter,
};
