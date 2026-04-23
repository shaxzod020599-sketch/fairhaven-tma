const User = require('../models/User');

/**
 * Resolves the caller's Telegram ID from either an explicit header
 * (X-Admin-Telegram-Id) or from Telegram WebApp init_data passed via the
 * X-Telegram-Init-Data header. Anything that ends up as an admin gets
 * attached as `req.admin`.
 */
async function resolveAdmin(req) {
  let tgId = Number(req.headers['x-admin-telegram-id']);

  if (!tgId) {
    const init = req.headers['x-telegram-init-data'];
    if (init) {
      try {
        const params = new URLSearchParams(init);
        const userJson = params.get('user');
        if (userJson) {
          const u = JSON.parse(decodeURIComponent(userJson));
          if (u && u.id) tgId = Number(u.id);
        }
      } catch (_) {}
    }
  }

  if (!tgId) return null;
  const user = await User.findOne({ telegramId: tgId });
  if (!user || user.role !== 'admin') return null;
  return user;
}

module.exports = async function adminAuth(req, res, next) {
  try {
    const admin = await resolveAdmin(req);
    if (!admin) {
      return res.status(401).json({
        success: false,
        error: 'admin_required',
        message: 'Доступ только для администраторов',
      });
    }
    req.admin = admin;
    next();
  } catch (err) {
    console.error('[adminAuth]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports.resolveAdmin = resolveAdmin;
