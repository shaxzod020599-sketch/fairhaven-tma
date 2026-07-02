const User = require('../models/User');
const { getTelegramUserFromRequest } = require('./telegramAuth');

/**
 * Resolves an admin only from Telegram-signed WebApp init data.
 */
async function resolveAdmin(req) {
  let telegramUser;
  try {
    telegramUser = getTelegramUserFromRequest(req);
  } catch (_) {
    return null;
  }
  const user = await User.findOne({ telegramId: telegramUser.id });
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
    console.error('[adminAuth]', err?.name || 'Error', err?.code || '');
    res.status(500).json({ success: false, error: 'internal_error' });
  }
};

module.exports.resolveAdmin = resolveAdmin;
