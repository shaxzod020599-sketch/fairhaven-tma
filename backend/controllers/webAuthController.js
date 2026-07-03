const crypto = require('crypto');
const WebLoginToken = require('../models/WebLoginToken');
const User = require('../models/User');
const { sendError } = require('../utils/http');
const {
  signSession,
  sessionCookieOptions,
  COOKIE_NAME,
} = require('../middleware/webAuth');

const TOKEN_TTL_MINUTES = 10;
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function botUsername(req) {
  return (
    req.app.locals.botUsername ||
    process.env.WEB_BOT_USERNAME ||
    ''
  );
}

function publicUser(user) {
  return {
    telegramId: user.telegramId,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    phone: user.phone,
    photoUrl: user.photoUrl,
    languageCode: user.languageCode,
    role: user.role || 'user',
  };
}

/**
 * POST /api/web/auth/start
 * Creates a one-time login token and returns the bot deep-link the visitor
 * must open. The site then polls /status until the bot claims the token.
 */
exports.start = async (req, res) => {
  try {
    if (!process.env.WEB_JWT_SECRET) {
      return res.status(503).json({ success: false, error: 'web_auth_disabled' });
    }
    const username = botUsername(req);
    if (!username) {
      return res.status(503).json({ success: false, error: 'bot_unavailable' });
    }

    // 32 random bytes → 43-char base64url. Telegram start payload cap is 64.
    const raw = crypto.randomBytes(32).toString('base64url');
    await WebLoginToken.create({
      tokenHash: hashToken(raw),
      status: 'pending',
      expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000),
    });

    res.json({
      success: true,
      data: {
        token: raw,
        botUrl: `https://t.me/${username}?start=web_${raw}`,
        expiresInSeconds: TOKEN_TTL_MINUTES * 60,
      },
    });
  } catch (err) {
    sendError(res, 500, err);
  }
};

/**
 * GET /api/web/auth/status?token=...
 * pending → { status: 'pending' }
 * ready   → sets the session cookie, consumes the token, returns the profile.
 */
exports.status = async (req, res) => {
  try {
    const raw = String(req.query.token || '');
    if (!TOKEN_RE.test(raw)) {
      return res.status(400).json({ success: false, error: 'invalid_token' });
    }

    const doc = await WebLoginToken.findOne({
      tokenHash: hashToken(raw),
      expiresAt: { $gt: new Date() },
    });
    if (!doc) {
      return res.json({ success: true, data: { status: 'expired' } });
    }
    if (doc.status !== 'ready' || !doc.telegramId) {
      return res.json({ success: true, data: { status: 'pending' } });
    }

    const user = await User.findOne({ telegramId: doc.telegramId });
    if (!user || !user.isRegistered()) {
      return res.json({ success: true, data: { status: 'pending' } });
    }

    // Single use — burn the token before issuing the session.
    await WebLoginToken.deleteOne({ _id: doc._id });

    res.cookie(COOKIE_NAME, signSession(user), sessionCookieOptions());
    res.json({
      success: true,
      data: { status: 'ready', user: publicUser(user) },
    });
  } catch (err) {
    sendError(res, 500, err);
  }
};

/** GET /api/web/auth/me — requires webAuth middleware. */
exports.me = async (req, res) => {
  res.json({ success: true, data: publicUser(req.webUser) });
};

/** POST /api/web/auth/logout */
exports.logout = async (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ success: true });
};
