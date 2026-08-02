const DEFAULT_DEV_ORIGIN = 'http://admin.localhost:5173';

function configuredAdminOrigin() {
  const raw = process.env.ADMIN_ORIGIN
    || (process.env.NODE_ENV === 'production' ? '' : DEFAULT_DEV_ORIGIN);
  if (!raw) throw new Error('ADMIN_ORIGIN is required in production');

  let origin;
  try {
    origin = new URL(raw);
  } catch (_) {
    throw new Error('ADMIN_ORIGIN must be an absolute http(s) URL');
  }
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) {
    throw new Error('ADMIN_ORIGIN must be an absolute http(s) URL');
  }
  if (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:') {
    throw new Error('ADMIN_ORIGIN must use https in production');
  }
  return origin;
}

const ADMIN_ORIGIN = configuredAdminOrigin();

function configuredAdminHost() {
  return ADMIN_ORIGIN.hostname.toLowerCase();
}

function adminHostGate(req, res, next) {
  const requestHost = String(req.hostname || '').toLowerCase();
  if (requestHost !== configuredAdminHost()) {
    return res.status(421).json({ success: false, error: 'admin_host_required' });
  }
  return next();
}

module.exports = adminHostGate;
module.exports.configuredAdminHost = configuredAdminHost;
module.exports.configuredAdminOrigin = () => ADMIN_ORIGIN;
