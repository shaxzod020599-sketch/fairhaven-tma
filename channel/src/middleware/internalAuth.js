const crypto = require('crypto');
const config = require('../config');
const logger = require('../logger');

/**
 * Guard for the service-to-service surface under /internal.
 *
 * These routes move stock, so they are protected three ways rather than one:
 * the service binds to loopback by default, nginx never proxies /internal, and
 * every request carries a shared token compared in constant time. Any one of
 * the three failing still leaves two.
 */

/**
 * Constant-time comparison of two secrets of any length.
 *
 * Comparing raw buffers here would be a remote crash rather than a wrong answer:
 * `timingSafeEqual` throws unless both buffers are the same byte length, and a
 * JavaScript string's `.length` counts UTF-16 code units, not bytes. One
 * multi-byte character in the header — "…abcdéf" — passes a character-length
 * check while producing a 33-byte buffer against a 32-byte secret, and the throw
 * escapes an async Express handler as an unhandled rejection, which Node
 * terminates on by default. Hashing first makes both sides 32 bytes whatever
 * arrives.
 */
function tokensMatch(presented, expected) {
  const a = crypto.createHash('sha256').update(String(presented)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Rejects a request that does not carry the shared token.
 *
 * An unconfigured token fails closed with a 503: an empty string would otherwise
 * match an empty header and open the whole surface to anyone who reached the
 * port.
 */
function requireInternalToken(req, res, next) {
  const expected = config.internalToken;
  if (!expected) {
    logger.error('an /internal route was called but CHANNEL_INTERNAL_TOKEN is unset');
    return res.status(503).json({ error: 'internal_token_not_configured' });
  }
  if (!tokensMatch(req.get('X-Internal-Token') || '', expected)) {
    logger.warn('internal request rejected', { path: req.path, ip: req.ip });
    return res.status(401).json({ error: 'unauthorized' });
  }
  return next();
}

module.exports = { requireInternalToken, tokensMatch };
