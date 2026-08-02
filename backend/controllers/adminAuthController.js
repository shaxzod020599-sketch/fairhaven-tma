const User = require('../models/User');
const login = require('../services/adminLogin');
const sessions = require('../services/adminSession');
const audit = require('../services/adminAudit');

function publicAdmin(admin, csrfToken) {
  return {
    isAdmin: true,
    telegramId: admin.telegramId,
    firstName: admin.firstName,
    lastName: admin.lastName,
    username: admin.username,
    csrfToken,
  };
}

function authFailure(res, err) {
  const code = err?.code || 'admin_auth_failed';
  const known = new Set([
    'admin_required',
    'telegram_auth_required',
    'telegram_auth_unavailable',
    'invalid_telegram_signature',
    'invalid_telegram_auth_date',
    'stale_telegram_auth',
    'invalid_telegram_user',
    'telegram_init_data_replayed',
  ]);
  return res.status(known.has(code) ? 401 : 500).json({
    success: false,
    error: known.has(code) ? code : 'admin_auth_failed',
  });
}

exports.startLogin = async (req, res) => {
  try {
    const username = req.app?.locals?.botUsername || process.env.WEB_BOT_USERNAME || '';
    if (!username) return res.status(503).json({ success: false, error: 'bot_unavailable' });
    const attempt = await login.createAttempt({
      ip: req.ip,
      userAgent: typeof req.get === 'function' ? req.get('user-agent') : '',
    });
    return res.json({
      success: true,
      data: {
        pollToken: attempt.pollToken,
        userCode: attempt.userCode,
        botUrl: `https://t.me/${username}?start=admin_${attempt.pollToken}`,
        expiresInSeconds: 180,
      },
    });
  } catch (err) {
    return authFailure(res, err);
  }
};

exports.pollLogin = async (req, res) => {
  try {
    const pollToken = String(req.body?.pollToken || '');
    const attempt = await login.consumeApproved(pollToken);
    if (!attempt) {
      const state = await login.loginState(pollToken);
      const publicState = ['pending', 'denied'].includes(state) ? state : 'expired';
      return res.json({ success: true, data: { status: publicState } });
    }

    const admin = await User.findOne({ telegramId: attempt.adminTelegramId, role: 'admin' });
    if (!admin) return res.status(401).json({ success: false, error: 'admin_required' });
    const issued = await sessions.issueSession({ admin, req, res });
    await audit.record({
      admin,
      action: 'auth.login',
      entityType: 'admin_session',
      summary: { method: 'telegram_bot_confirm' },
    });
    return res.json({
      success: true,
      data: { status: 'ready', csrfToken: issued.csrfToken },
    });
  } catch (err) {
    return authFailure(res, err);
  }
};

exports.telegramLogin = async (req, res) => {
  try {
    const issued = await login.exchangeTelegram({
      initData: req.body?.initData,
      req,
      res,
    });
    await audit.record({
      admin: issued.admin,
      action: 'auth.login',
      entityType: 'admin_session',
      summary: { method: 'telegram_init_data_exchange' },
    });
    return res.json({ success: true, data: { status: 'ready', csrfToken: issued.csrfToken } });
  } catch (err) {
    return authFailure(res, err);
  }
};

exports.whoami = async (req, res) => {
  try {
    const resolved = await sessions.resolveSession(req);
    if (!resolved) return res.json({ success: true, data: { isAdmin: false } });
    return res.json({ success: true, data: publicAdmin(resolved.admin, resolved.csrfToken) });
  } catch (err) {
    return authFailure(res, err);
  }
};

exports.logout = async (req, res) => {
  try {
    await sessions.revokeSession(req, res);
    await audit.record({
      admin: req.admin,
      action: 'auth.logout',
      entityType: 'admin_session',
    });
    return res.json({ success: true });
  } catch (err) {
    return authFailure(res, err);
  }
};

exports.revokeAll = async (req, res) => {
  try {
    await sessions.revokeAllForAdmin(req.admin.telegramId);
    await audit.record({
      admin: req.admin,
      action: 'auth.revoke_all',
      entityType: 'admin_session',
    });
    await sessions.revokeSession(req, res);
    return res.json({ success: true });
  } catch (err) {
    return authFailure(res, err);
  }
};

exports.devLogin = async (req, res) => {
  if (process.env.NODE_ENV === 'production' || process.env.ADMIN_DEV_BYPASS !== '1') {
    return res.status(404).json({ success: false, error: 'route_not_found' });
  }
  try {
    const admin = await User.findOne({ role: 'admin' });
    if (!admin) return res.status(404).json({ success: false, error: 'admin_not_seeded' });
    const issued = await sessions.issueSession({ admin, req, res });
    return res.json({ success: true, data: { status: 'ready', csrfToken: issued.csrfToken } });
  } catch (err) {
    return authFailure(res, err);
  }
};
