const crypto = require('crypto');
const {
  configuredAdminHost,
  configuredAdminOrigin,
  configuredTmaHost,
  configuredTmaOrigin,
} = require('./adminHostGate');

const READ_ONLY = new Set(['GET', 'HEAD', 'OPTIONS']);

function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function reject(res) {
  return res.status(403).json({ success: false, error: 'csrf_rejected' });
}

function hasExactOrigin(req, expectedOrigin) {
  const origin = typeof req.get === 'function' ? req.get('origin') : req.headers?.origin;
  const fetchSite = typeof req.get === 'function'
    ? req.get('sec-fetch-site')
    : req.headers?.['sec-fetch-site'];
  return origin === expectedOrigin && fetchSite !== 'cross-site';
}

function hasExactAdminOrigin(req) {
  return hasExactOrigin(req, configuredAdminOrigin().origin);
}

/**
 * The Origin a request must carry is decided by the host it was sent to, so a
 * page on one surface can never spend a session that belongs to the other: the
 * Mini App origin is only ever accepted on the Mini App host, and the panel
 * origin only on the panel host. A request with no recognisable host falls back
 * to the panel origin, which is the stricter of the two.
 */
function expectedOriginForHost(req) {
  const host = String(req?.hostname || '').toLowerCase();
  if (host && host === configuredTmaHost() && host !== configuredAdminHost()) {
    return configuredTmaOrigin().origin;
  }
  return configuredAdminOrigin().origin;
}

function hasExactSurfaceOrigin(req) {
  return hasExactOrigin(req, expectedOriginForHost(req));
}

function requireAdminOrigin(req, res, next) {
  if (!hasExactAdminOrigin(req)) return reject(res);
  return next();
}

// For the routes both surfaces share; each host still gets exactly one origin.
function requireSurfaceOrigin(req, res, next) {
  if (!hasExactSurfaceOrigin(req)) return reject(res);
  return next();
}

function adminCsrf(req, res, next) {
  if (READ_ONLY.has(String(req.method || '').toUpperCase())) return next();

  const supplied = typeof req.get === 'function'
    ? req.get('x-fh-csrf')
    : req.headers?.['x-fh-csrf'];

  if (!hasExactSurfaceOrigin(req)) return reject(res);
  if (!constantTimeEqual(supplied, req.adminCsrfToken)) return reject(res);
  return next();
}

module.exports = adminCsrf;
module.exports.constantTimeEqual = constantTimeEqual;
module.exports.hasExactAdminOrigin = hasExactAdminOrigin;
module.exports.hasExactSurfaceOrigin = hasExactSurfaceOrigin;
module.exports.requireAdminOrigin = requireAdminOrigin;
module.exports.requireSurfaceOrigin = requireSurfaceOrigin;
