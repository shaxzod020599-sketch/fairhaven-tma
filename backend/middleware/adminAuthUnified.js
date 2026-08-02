const { resolveSession } = require('../services/adminSession');

async function resolveAdminAny(req) {
  const resolved = await resolveSession(req);
  return resolved?.admin || null;
}

async function adminAuthUnified(req, res, next) {
  try {
    const resolved = await resolveSession(req);
    if (!resolved) {
      return res.status(401).json({
        success: false,
        error: 'admin_session_required',
        message: 'Доступ только для администраторов',
      });
    }
    req.admin = resolved.admin;
    req.adminSession = resolved.session;
    req.adminSessionToken = resolved.rawToken;
    req.adminCsrfToken = resolved.csrfToken;
    return next();
  } catch (err) {
    console.error('adminAuthUnified error:', err?.name || 'Error');
    return res.status(500).json({ success: false, error: 'auth_error' });
  }
}

module.exports = adminAuthUnified;
module.exports.resolveAdminAny = resolveAdminAny;
