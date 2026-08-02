const crypto = require('crypto');
const AdminSession = require('../models/AdminSession');
const User = require('../models/User');
const { configuredAdminHost } = require('../middleware/adminHostGate');

const ABSOLUTE_TTL_MS = 8 * 60 * 60 * 1000;
const IDLE_TTL_MS = 30 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 1000;

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function cookieName() {
  return isProduction() ? '__Host-fh_admin_session' : 'fh_admin_session_dev';
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'strict',
    path: '/',
    maxAge: ABSOLUTE_TTL_MS,
  };
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw || '')).digest('hex');
}

function csrfSecret() {
  const secret = process.env.ADMIN_CSRF_SECRET
    || (isProduction() ? '' : 'fairhaven-local-admin-csrf-secret-only');
  if (secret.length < 32) {
    throw new Error('ADMIN_CSRF_SECRET must contain at least 32 characters');
  }
  return secret;
}

function csrfForToken(rawToken) {
  return crypto.createHmac('sha256', csrfSecret()).update(String(rawToken || '')).digest('base64url');
}

function sessionUsable(session, requestHost, now = new Date()) {
  if (!session || session.revokedAt) return false;
  if (String(session.host || '').toLowerCase() !== String(requestHost || '').toLowerCase()) return false;
  if (new Date(session.expiresAt).getTime() <= now.getTime()) return false;
  if (now.getTime() - new Date(session.lastSeenAt).getTime() > IDLE_TTL_MS) return false;
  return true;
}

function requestUserAgent(req) {
  const value = typeof req.get === 'function' ? req.get('user-agent') : req.headers?.['user-agent'];
  return String(value || '').slice(0, 240);
}

async function issueSession({ admin, req, res }) {
  if (!admin || admin.role && admin.role !== 'admin') throw new Error('admin_required');
  if (!Number.isSafeInteger(Number(admin.telegramId))) throw new Error('admin_telegram_id_required');
  const host = String(req.hostname || '').toLowerCase();
  if (host !== configuredAdminHost()) throw new Error('admin_host_required');

  const rawToken = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  await AdminSession.create({
    tokenHash: hashToken(rawToken),
    adminTelegramId: Number(admin.telegramId),
    host,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + ABSOLUTE_TTL_MS),
    ip: String(req.ip || '').slice(0, 64),
    userAgent: requestUserAgent(req),
  });

  res.cookie(cookieName(), rawToken, sessionCookieOptions());
  return { csrfToken: csrfForToken(rawToken), expiresAt: new Date(now.getTime() + ABSOLUTE_TTL_MS) };
}

async function resolveSession(req) {
  const rawToken = req.cookies?.[cookieName()];
  if (!rawToken || typeof rawToken !== 'string' || rawToken.length > 128) return null;

  const session = await AdminSession.findOne({ tokenHash: hashToken(rawToken) });
  const host = String(req.hostname || '').toLowerCase();
  const now = new Date();
  if (!sessionUsable(session, host, now)) return null;

  const admin = await User.findOne({ telegramId: session.adminTelegramId, role: 'admin' });
  if (!admin) {
    await AdminSession.updateOne({ _id: session._id }, { $set: { revokedAt: now } });
    return null;
  }

  if (now.getTime() - new Date(session.lastSeenAt).getTime() >= TOUCH_INTERVAL_MS) {
    await AdminSession.updateOne(
      { _id: session._id, revokedAt: null },
      { $set: { lastSeenAt: now } }
    );
    session.lastSeenAt = now;
  }

  return { admin, session, rawToken, csrfToken: csrfForToken(rawToken) };
}

async function revokeSession(req, res) {
  const rawToken = req.cookies?.[cookieName()];
  if (rawToken) {
    await AdminSession.updateOne(
      { tokenHash: hashToken(rawToken), revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
  }
  res.clearCookie(cookieName(), { path: '/', secure: isProduction(), sameSite: 'strict' });
}

async function revokeAllForAdmin(telegramId) {
  return AdminSession.updateMany(
    { adminTelegramId: Number(telegramId), revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
}

module.exports = {
  ABSOLUTE_TTL_MS,
  IDLE_TTL_MS,
  cookieName,
  csrfForToken,
  hashToken,
  issueSession,
  resolveSession,
  revokeAllForAdmin,
  revokeSession,
  sessionCookieOptions,
  sessionUsable,
};
