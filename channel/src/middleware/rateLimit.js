const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

/**
 * Inbound limits for the channel surface.
 *
 * The published Medicalka contract documents a 429, so one has to exist. Two
 * things need protecting: key guessing, which is cheap for an attacker and
 * costs us an indexed lookup each time, and the catalogue endpoints, which read
 * the database a marketplace shares with the live shop.
 *
 * Limits are deliberately generous against the polling schedule the contract
 * asks for — a catalogue sweep every hour, stock every five minutes — so a
 * well-behaved integrator never sees one.
 */

const DISABLED = process.env.DISABLE_RATE_LIMIT === 'true';

function build({ windowMs, max, keyGenerator }) {
  if (DISABLED) return (_req, _res, next) => next();
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      // Same envelope the rest of the Medicalka surface uses, so their client
      // can read the reason instead of guessing from the status alone.
      res.status(429).json({ detail: 'Too many requests — slow down and retry' });
    },
    ...(keyGenerator ? { keyGenerator } : {}),
  });
}

/**
 * Per authenticated key where possible, per IP otherwise.
 *
 * Keying on the caller's key means one integrator cannot exhaust another's
 * budget, and an unauthenticated flood is still bounded by IP.
 */
const channelLimiter = build({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_CHANNEL_MAX || 240),
  keyGenerator: (req) => (
    req.channelKey ? `key:${req.channelKey.id}` : `ip:${ipKeyGenerator(req.ip)}`
  ),
});

// Anything that fails authentication is a guess. Tight, and per IP by
// definition — there is no key to attribute it to.
const authFailureLimiter = build({
  windowMs: 5 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_CHANNEL_AUTH_MAX || 60),
});

module.exports = { channelLimiter, authFailureLimiter };
