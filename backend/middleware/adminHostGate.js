const DEFAULT_DEV_ORIGIN = 'http://admin.localhost:5173';
const DEFAULT_DEV_TMA_ORIGIN = 'http://mini.localhost:5175';

function configuredOrigin(envName, devFallback) {
  const raw = process.env[envName]
    || (process.env.NODE_ENV === 'production' ? '' : devFallback);
  if (!raw) throw new Error(`${envName} is required in production`);

  let origin;
  try {
    origin = new URL(raw);
  } catch (_) {
    throw new Error(`${envName} must be an absolute http(s) URL`);
  }
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) {
    throw new Error(`${envName} must be an absolute http(s) URL`);
  }
  if (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:') {
    throw new Error(`${envName} must use https in production`);
  }
  return origin;
}

function configuredAdminOrigin() {
  return configuredOrigin('ADMIN_ORIGIN', DEFAULT_DEV_ORIGIN);
}

const ADMIN_ORIGIN = configuredAdminOrigin();
const TMA_ORIGIN = configuredOrigin('TMA_ORIGIN', DEFAULT_DEV_TMA_ORIGIN);

function configuredAdminHost() {
  return ADMIN_ORIGIN.hostname.toLowerCase();
}

function configuredTmaHost() {
  return TMA_ORIGIN.hostname.toLowerCase();
}

function requestHostOf(req) {
  return String(req?.hostname || '').toLowerCase();
}

function rejectHost(res) {
  return res.status(421).json({ success: false, error: 'admin_host_required' });
}

/**
 * The admin API answers on two hosts, and they are not equals.
 *
 * The admin host is the panel's own origin, with a script-src of 'self' and
 * nothing else. The Mini App host also serves the storefront, so it carries a
 * wider script-src; admin authority reaches it only because the operator panel
 * inside the Mini App is the way this shop is run from a phone.
 *
 * What keeps the two apart is everything downstream: a session records the host
 * it was issued on and is refused anywhere else, the CSRF check demands the
 * Origin belonging to the host being addressed, and anything an operator does
 * not need from a phone stays behind `requireAdminHost`.
 */
function adminHostGate(req, res, next) {
  const host = requestHostOf(req);
  if (host !== configuredAdminHost() && host !== configuredTmaHost()) {
    return rejectHost(res);
  }
  return next();
}

// For routes that must stay on the panel's own hardened origin.
function requireAdminHost(req, res, next) {
  if (requestHostOf(req) !== configuredAdminHost()) return rejectHost(res);
  return next();
}

module.exports = adminHostGate;
module.exports.configuredAdminHost = configuredAdminHost;
module.exports.configuredAdminOrigin = () => ADMIN_ORIGIN;
module.exports.configuredTmaHost = configuredTmaHost;
module.exports.configuredTmaOrigin = () => TMA_ORIGIN;
module.exports.requireAdminHost = requireAdminHost;
