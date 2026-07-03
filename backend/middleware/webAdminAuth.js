const webAuth = require('./webAuth');

/**
 * Site-admin gate: a valid web session (Telegram-bot login) whose user has
 * the admin role. Reuses webAuth, then checks the role — no extra passwords.
 */
module.exports = async function webAdminAuth(req, res, next) {
  webAuth(req, res, (err) => {
    if (err) return next(err);
    if (!req.webUser || req.webUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'admin_required' });
    }
    next();
  });
};
