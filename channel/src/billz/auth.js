const crypto = require('node:crypto');
const config = require('../config');
const logger = require('../logger');
const BillzToken = require('../models/BillzToken');
const { limiter } = require('./queue');

/**
 * Access-token lifecycle for the Billz integration keys.
 *
 * There is a shared key (BILLZ_SECRET_TOKEN, stored as `default`) and,
 * optionally, one per sales channel (see `config.billz.channels`). Billz shows
 * the key that wrote a sale as its author, so a channel with its own key has
 * its sales attributed to itself rather than to the shared «medicalka api».
 *
 * Tokens are valid for 15 days, so the common path is a cache hit. The things
 * worth getting right are:
 *
 *  - Only one login per key may be in flight at a time. Without the promise
 *    lock, a burst of expired-token requests would each issue their own login
 *    and immediately trip the 2 req/s limit.
 *  - The token is persisted, so restarts do not re-login.
 *  - A persisted token is reused only for the secret that issued it. Replacing
 *    a key in `.env` must not keep writing sales as the old key's author for
 *    the rest of that token's 15 days.
 */

// Refresh this long before the real expiry so an in-flight request never
// arrives at Billz with a token that expired in transit.
const EXPIRY_SAFETY_MARGIN_MS = 60 * 60 * 1000;

const DEFAULT_KEY = 'default';

const cached = new Map();
const inFlight = new Map();

/** The key a channel writes with: its own when configured, else the shared one. */
function keyForChannel(channel) {
  return config.billz.channels?.[channel]?.secretToken ? channel : DEFAULT_KEY;
}

/**
 * The secret behind a key name. A channel key that is no longer configured
 * falls back to the shared one, so an order pinned to it can still be finished.
 */
function resolve(key) {
  if (key && key !== DEFAULT_KEY) {
    const own = config.billz.channels?.[key]?.secretToken;
    if (own) return { key, secret: own };
    logger.warn('billz channel key is no longer configured, using the shared key', { key });
  }
  return { key: DEFAULT_KEY, secret: config.billz.secretToken };
}

function fingerprint(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest('hex').slice(0, 16);
}

function isUsable(token) {
  return Boolean(token) && token.expiresAt.getTime() - EXPIRY_SAFETY_MARGIN_MS > Date.now();
}

/**
 * A failed login happens before any request it was meant to authorise, so it
 * cannot have changed anything in Billz. Saying so lets a write that never got
 * as far as Billz be retried instead of being fenced for reconciliation.
 */
function loginError(message, status) {
  const err = new Error(message);
  err.status = status;
  err.outcomeUnknown = false;
  err.retrySafe = true;
  return err;
}

async function login(key, secret) {
  // Through the shared queue: a login is a Billz request and counts against
  // the same 2 req/s ceiling as everything else.
  let res;
  try {
    res = await limiter.schedule(() => fetch(`${config.billz.baseUrl}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret_token: secret }),
      signal: AbortSignal.timeout(config.billz.timeoutMs),
    }));
  } catch (_) {
    throw loginError(`billz login for the ${key} key failed`, 0);
  }

  const body = await res.json().catch(() => null);
  const data = body?.data;
  if (!res.ok || !data?.access_token) {
    // Never echo the response body — it is the one place the secret could
    // plausibly be reflected back.
    throw loginError(`billz login for the ${key} key failed with status ${res.status}`, res.status);
  }

  const expiresInSec = Number(data.expires_in) || 15 * 24 * 60 * 60;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || '',
    expiresAt: new Date(Date.now() + expiresInSec * 1000),
  };
}

async function loadPersisted(key, print) {
  const doc = await BillzToken().findOne({ kind: key }).lean();
  if (!doc || doc.fingerprint !== print) return null;
  return {
    accessToken: doc.accessToken,
    refreshToken: doc.refreshToken,
    expiresAt: new Date(doc.expiresAt),
  };
}

async function persist(key, print, token) {
  await BillzToken().updateOne(
    { kind: key },
    { $set: { ...token, kind: key, fingerprint: print } },
    { upsert: true }
  );
}

async function issue(key, secret) {
  const print = fingerprint(secret);
  const stored = await loadPersisted(key, print);
  if (isUsable(stored)) {
    logger.debug('billz token loaded from store', { key });
    return stored;
  }
  const fresh = await login(key, secret);
  await persist(key, print, fresh);
  logger.info('billz token issued', { key, expiresAt: fresh.expiresAt.toISOString() });
  return fresh;
}

/** Returns a usable access token for a key, logging in only when necessary. */
async function getAccessToken(requested = DEFAULT_KEY) {
  const { key, secret } = resolve(requested);
  const current = cached.get(key);
  if (isUsable(current)) return current.accessToken;
  if (!inFlight.has(key)) {
    inFlight.set(key, issue(key, secret)
      .then((token) => { cached.set(key, token); return token; })
      .finally(() => { inFlight.delete(key); }));
  }
  const token = await inFlight.get(key);
  return token.accessToken;
}

/**
 * Drops a token that Billz rejected, so the next call re-authenticates.
 *
 * Takes the token that actually failed. Clearing unconditionally meant a
 * request holding an old token could delete one another caller had just
 * issued — every in-flight request then 401'd in turn and each triggered its
 * own login, which is the storm the promise lock exists to avoid.
 */
async function invalidate(staleToken, requested = DEFAULT_KEY) {
  const { key } = resolve(requested);
  const current = cached.get(key);
  if (staleToken && current && current.accessToken !== staleToken) {
    // Someone already refreshed; the caller simply raced and should retry.
    return;
  }
  cached.delete(key);
  const filter = staleToken
    ? { kind: key, accessToken: staleToken }
    : { kind: key };
  await BillzToken().deleteOne(filter).catch(() => {});
}

/** Test seam. */
function _reset() {
  cached.clear();
  inFlight.clear();
}

module.exports = {
  DEFAULT_KEY,
  EXPIRY_SAFETY_MARGIN_MS,
  getAccessToken,
  invalidate,
  keyForChannel,
  _reset,
};
