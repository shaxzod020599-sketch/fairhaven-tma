const config = require('../config');
const logger = require('../logger');
const BillzToken = require('../models/BillzToken');
const { limiter } = require('./queue');

/**
 * Access-token lifecycle for the Billz integration key.
 *
 * Tokens are valid for 15 days, so the common path is a cache hit. The two
 * things worth getting right are:
 *
 *  - Only one login may be in flight at a time. Without the promise lock, a
 *    burst of expired-token requests would each issue their own login and
 *    immediately trip the 2 req/s limit.
 *  - The token is persisted, so restarts do not re-login.
 */

// Refresh this long before the real expiry so an in-flight request never
// arrives at Billz with a token that expired in transit.
const EXPIRY_SAFETY_MARGIN_MS = 60 * 60 * 1000;

let cached = null;
let inFlight = null;

function isUsable(token) {
  return Boolean(token) && token.expiresAt.getTime() - EXPIRY_SAFETY_MARGIN_MS > Date.now();
}

async function login() {
  // Through the shared queue: a login is a Billz request and counts against
  // the same 2 req/s ceiling as everything else.
  const res = await limiter.schedule(() => fetch(`${config.billz.baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret_token: config.billz.secretToken }),
    signal: AbortSignal.timeout(config.billz.timeoutMs),
  }));

  const body = await res.json().catch(() => null);
  const data = body?.data;
  if (!res.ok || !data?.access_token) {
    // Never echo the response body — it is the one place the secret could
    // plausibly be reflected back.
    throw new Error(`billz login failed with status ${res.status}`);
  }

  const expiresInSec = Number(data.expires_in) || 15 * 24 * 60 * 60;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || '',
    expiresAt: new Date(Date.now() + expiresInSec * 1000),
  };
}

async function loadPersisted() {
  const doc = await BillzToken().findOne({ kind: 'default' }).lean();
  if (!doc) return null;
  return {
    accessToken: doc.accessToken,
    refreshToken: doc.refreshToken,
    expiresAt: new Date(doc.expiresAt),
  };
}

async function persist(token) {
  await BillzToken().updateOne(
    { kind: 'default' },
    { $set: { ...token, kind: 'default' } },
    { upsert: true }
  );
}

async function issue() {
  const stored = await loadPersisted();
  if (isUsable(stored)) {
    logger.debug('billz token loaded from store');
    return stored;
  }
  const fresh = await login();
  await persist(fresh);
  logger.info('billz token issued', { expiresAt: fresh.expiresAt.toISOString() });
  return fresh;
}

/** Returns a usable access token, logging in only when necessary. */
async function getAccessToken() {
  if (isUsable(cached)) return cached.accessToken;
  if (!inFlight) {
    inFlight = issue()
      .then((token) => { cached = token; return token; })
      .finally(() => { inFlight = null; });
  }
  const token = await inFlight;
  return token.accessToken;
}

/** Drops the cached token so the next call re-authenticates. Used on a 401. */
async function invalidate() {
  cached = null;
  await BillzToken().deleteOne({ kind: 'default' }).catch(() => {});
}

/** Test seam. */
function _reset() {
  cached = null;
  inFlight = null;
}

module.exports = { getAccessToken, invalidate, _reset, EXPIRY_SAFETY_MARGIN_MS };
