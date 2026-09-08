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

/**
 * The resolved budgets, exported so they can be asserted rather than reasoned
 * about. Both defaults are a judgement about what traffic is legitimate, and a
 * silent edit to either is the kind of change that only shows up as an outage.
 */
const LIMITS = {
  channelPerMinute: Number(process.env.RATE_LIMIT_CHANNEL_MAX || 240),
  authFailuresPerFiveMinutes: Number(process.env.RATE_LIMIT_CHANNEL_AUTH_MAX || 300),
};

function build({ windowMs, max, keyGenerator, failuresOnly = false }) {
  if (DISABLED) return (_req, _res, next) => next();
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Counts only requests that were refused. Without this the "auth failure"
    // limiter is really a request limiter under another name, and a
    // well-behaved integrator polling on the schedule its own contract
    // prescribes gets cut off — Uzum alone asks for a status check per order
    // per minute, which passes 60 in five minutes with ten orders open.
    ...(failuresOnly ? { skipSuccessfulRequests: true } : {}),
    handler: (_req, res) => {
      // Same envelope the rest of the Medicalka surface uses, so their client
      // can read the reason instead of guessing from the status alone.
      const description = 'Too many requests — slow down and retry';
      res.status(429).json(res.locals.channelErrorContract === 'uzum'
        ? [{ code: 429, description }] : { detail: description });
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
  max: LIMITS.channelPerMinute,
  keyGenerator: (req) => (
    req.channelKey ? `key:${req.channelKey.id}` : `ip:${ipKeyGenerator(req.ip)}`
  ),
});

/**
 * Bounds a flood of rejected requests, per IP.
 *
 * Sized against the wrong threat, this control does more harm than good. It is
 * not what stops a key being guessed — the keys are 256 bits of CSPRNG output,
 * so no request rate on any timescale gets anywhere near one. What it protects
 * is our database from a flood of indexed lookups.
 *
 * That reframing sets the budget. It has to sit far above any legitimate error
 * rate, because it is keyed per IP and a marketplace often shares an egress
 * address with everything else that company runs: one misconfigured staging
 * script behind the same NAT would otherwise take their production integration
 * down with it. Three hundred rejections in five minutes is one per second —
 * plainly a flood, and just as plainly not an integrator having a bad morning.
 *
 * Successful requests do not count at all; throughput is bounded by
 * channelLimiter, which knows whose budget it is spending.
 */
const authFailureLimiter = build({
  windowMs: 5 * 60 * 1000,
  max: LIMITS.authFailuresPerFiveMinutes,
  failuresOnly: true,
});

module.exports = { LIMITS, channelLimiter, authFailureLimiter };
