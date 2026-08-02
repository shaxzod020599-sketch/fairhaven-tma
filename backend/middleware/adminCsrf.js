const crypto = require('crypto');
const { configuredAdminOrigin } = require('./adminHostGate');

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

function hasExactAdminOrigin(req) {
  const expectedOrigin = configuredAdminOrigin().origin;
  const origin = typeof req.get === 'function' ? req.get('origin') : req.headers?.origin;
  const fetchSite = typeof req.get === 'function'
    ? req.get('sec-fetch-site')
    : req.headers?.['sec-fetch-site'];
  return origin === expectedOrigin && fetchSite !== 'cross-site';
}

function requireAdminOrigin(req, res, next) {
  if (!hasExactAdminOrigin(req)) return reject(res);
  return next();
}

function adminCsrf(req, res, next) {
  if (READ_ONLY.has(String(req.method || '').toUpperCase())) return next();

  const supplied = typeof req.get === 'function'
    ? req.get('x-fh-csrf')
    : req.headers?.['x-fh-csrf'];

  if (!hasExactAdminOrigin(req)) return reject(res);
  if (!constantTimeEqual(supplied, req.adminCsrfToken)) return reject(res);
  return next();
}

module.exports = adminCsrf;
module.exports.constantTimeEqual = constantTimeEqual;
module.exports.hasExactAdminOrigin = hasExactAdminOrigin;
module.exports.requireAdminOrigin = requireAdminOrigin;
