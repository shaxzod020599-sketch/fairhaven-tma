const crypto = require('crypto');
const config = require('../../config');
const logger = require('../../logger');
const ChannelKey = require('../../models/ChannelKey');
const { hashKey } = require('../../models/ChannelKey');

/**
 * OAuth2 client credentials, from the provider's side.
 *
 * Uzum posts a client id and secret to `/security/oauth/token` and gets a bearer
 * token back, which it then sends on every catalogue and order call. We issue
 * those tokens; nobody else does.
 *
 * **The token carries no server-side session.** It is a signed statement —
 * channel, key id, expiry — and verifying it is a signature check plus one
 * indexed lookup of the key it names. Two consequences, both deliberate:
 *
 *   - Revoking a client's key kills its outstanding tokens immediately, because
 *     verification re-reads the key record every time. A token store would have
 *     to be swept separately, and anything not swept stays valid.
 *   - There is no token collection to grow, expire or leak.
 *
 * The signing key is required rather than defaulted. A default would mean every
 * deployment that forgot to set one shares a signing key with every other, and
 * a token minted anywhere would be accepted here.
 */

const TOKEN_TTL_SECONDS = 3600;
const CHANNEL = 'uzum';

function signingKey() {
  const key = config.uzum.tokenSigningKey;
  if (!key || key.length < 32) {
    throw new Error(
      'UZUM_TOKEN_SIGNING_KEY must be set to at least 32 characters before the '
      + 'Uzum adapter can issue tokens'
    );
  }
  return key;
}

function sign(payload) {
  return crypto.createHmac('sha256', signingKey()).update(payload).digest('base64url');
}

/** `<base64url payload>.<base64url signature>` — deliberately not a JWT. */
function mintToken({ keyId, expiresAt }) {
  const payload = Buffer.from(
    JSON.stringify({ c: CHANNEL, k: String(keyId), e: expiresAt }),
    'utf8'
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

/**
 * Verifies a bearer token and returns the key it was issued against.
 *
 * The signature is checked before the payload is parsed, so a forged token
 * never reaches JSON.parse, and compared with `timingSafeEqual` on equal-length
 * digests.
 */
async function resolveToken(presented) {
  const raw = String(presented || '');
  const dot = raw.indexOf('.');
  if (dot <= 0) return null;

  const payload = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);

  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (claims.c !== CHANNEL) return null;
  if (!Number.isFinite(claims.e) || claims.e * 1000 <= Date.now()) return null;

  // Re-read every time: this is what makes revocation take effect at once
  // rather than whenever the token would have expired anyway.
  const record = await ChannelKey().findById(claims.k).lean();
  if (!record || record.channel !== CHANNEL || record.kind !== 'oauth') return null;
  if (!record.active) return null;

  return record;
}

/**
 * Reads the client credentials.
 *
 * Accepts both forms the OAuth2 spec allows: HTTP Basic, which Uzum's own
 * examples use, and form fields in the body. Rejecting one of them would fail an
 * integrator for a reason no error message could explain.
 */
function readCredentials(req) {
  const header = req.get('authorization') || '';
  if (/^basic /i.test(header)) {
    const decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8');
    const split = decoded.indexOf(':');
    if (split > 0) {
      return { clientId: decoded.slice(0, split), clientSecret: decoded.slice(split + 1) };
    }
  }
  return {
    clientId: String(req.body?.client_id || ''),
    clientSecret: String(req.body?.client_secret || ''),
  };
}

/** Authentication failures use the documented ErrorListV1 envelope. */
function oauthError(res, status, error, description) {
  return res.status(status).json([{ code: status, description: `${error}: ${description}` }]);
}

/** `POST /security/oauth/token` */
async function issueToken(req, res) {
  const grant = String(req.body?.grant_type || '');
  if (grant && grant !== 'client_credentials') {
    return oauthError(res, 400, 'unsupported_grant_type', 'only client_credentials is supported');
  }

  const { clientId, clientSecret } = readCredentials(req);
  if (!clientId || !clientSecret) {
    return oauthError(res, 400, 'invalid_request', 'client_id and client_secret are required');
  }

  let record;
  try {
    record = await ChannelKey().findOne({ channel: CHANNEL, kind: 'oauth', clientId }).lean();
  } catch (err) {
    logger.error('oauth lookup failed', { err });
    return oauthError(res, 500, 'server_error', 'internal error');
  }

  // One message for an unknown id and a wrong secret. Distinguishing them tells
  // an attacker which client ids exist.
  const presented = hashKey(clientSecret);
  const stored = record?.hash || '';
  const matches = record
    && presented.length === stored.length
    && crypto.timingSafeEqual(Buffer.from(presented), Buffer.from(stored));

  if (!matches) {
    logger.warn('uzum token request rejected', { clientId: String(clientId).slice(0, 24) });
    return oauthError(res, 401, 'invalid_client', 'client authentication failed');
  }
  if (!record.active) {
    return oauthError(res, 401, 'invalid_client', 'this client has been disabled');
  }

  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  let token;
  try {
    token = mintToken({ keyId: record._id, expiresAt });
  } catch (err) {
    logger.error('uzum token signing is not configured', { err });
    return oauthError(res, 500, 'server_error', 'token issuing is not configured');
  }

  ChannelKey()
    .updateOne({ _id: record._id }, { $set: { lastUsedAt: new Date() } })
    .catch(() => {});

  // No store, no refresh token: a client credentials grant re-authenticates
  // with the same credentials, so a refresh token would add a second long-lived
  // secret protecting nothing extra.
  res.set('Cache-Control', 'no-store');
  return res.json({
    access_token: token,
    token_type: 'bearer',
    expires_in: TOKEN_TTL_SECONDS,
    scope: 'read write',
  });
}

function bearerError(req, res, reason) {
  const isOrder = /^\/order(?:\/|$)/.test(req.path);
  return res.status(401).json(isOrder ? { reason } : [{ code: 401, description: reason }]);
}

/** Guards every endpoint other than the token endpoint itself. */
async function requireBearer(req, res, next) {
  const header = req.get('authorization') || '';
  if (!/^bearer /i.test(header)) {
    res.set('WWW-Authenticate', 'Bearer realm="fairhaven"');
    return bearerError(req, res, 'A bearer token is required');
  }

  let record;
  try {
    record = await resolveToken(header.slice(7).trim());
  } catch (err) {
    logger.error('uzum token verification failed', { err });
    return res.status(500).json([{ code: 500, description: 'internal error' }]);
  }

  if (!record) {
    res.set('WWW-Authenticate', 'Bearer error="invalid_token"');
    return bearerError(req, res, 'The token is invalid or expired');
  }

  req.channelKey = { id: record._id, kind: record.kind, label: record.label };
  return next();
}

module.exports = {
  CHANNEL,
  TOKEN_TTL_SECONDS,
  issueToken,
  mintToken,
  readCredentials,
  requireBearer,
  resolveToken,
};
