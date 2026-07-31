const jwt = require('jsonwebtoken');
const User = require('../models/User');

const COOKIE_NAME = 'fh_session';
const SESSION_DAYS = 30;

function getSecret() {
  return process.env.WEB_JWT_SECRET || '';
}

function signSession(user) {
  const secret = getSecret();
  if (!secret) throw new Error('WEB_JWT_SECRET missing');
  return jwt.sign(
    { tid: user.telegramId, uid: user._id.toString() },
    secret,
    { expiresIn: `${SESSION_DAYS}d` }
  );
}

/**
 * Whether the session cookie must carry the Secure flag.
 *
 * Deriving this from NODE_ENV alone is fragile: if the process manager on the
 * server does not export NODE_ENV=production, the session cookie silently
 * downgrades to being sent over plain HTTP. The configured public URL is the
 * more reliable signal — an https origin means the deployment is TLS-only.
 */
function isHttpsDeployment() {
  const configured = [process.env.WEB_PUBLIC_URL, process.env.FRONTEND_URL];
  if (configured.some((u) => typeof u === 'string' && u.startsWith('https://'))) return true;
  return process.env.NODE_ENV === 'production';
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttpsDeployment(),
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

async function resolveWebUser(req) {
  const secret = getSecret();
  const raw = req.cookies ? req.cookies[COOKIE_NAME] : null;
  if (!secret || !raw) return null;
  let payload;
  try {
    // Pin the algorithm — prevents alg-confusion tokens from being accepted.
    payload = jwt.verify(raw, secret, { algorithms: ['HS256'] });
  } catch (_) {
    return null;
  }
  const telegramId = Number(payload.tid);
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) return null;
  const user = await User.findOne({ telegramId });
  if (!user || !user.isRegistered()) return null;
  return user;
}

/** Requires a valid web session; 401 otherwise. */
async function webAuth(req, res, next) {
  try {
    const user = await resolveWebUser(req);
    if (!user) {
      return res.status(401).json({ success: false, error: 'web_auth_required' });
    }
    req.webUser = user;
    req.telegramUser = { id: user.telegramId };
    next();
  } catch (err) {
    console.error('[webAuth]', err?.name || 'Error');
    res.status(401).json({ success: false, error: 'web_auth_required' });
  }
}

/** Attaches req.webUser when a valid session exists; never blocks. */
async function webAuthOptional(req, _res, next) {
  try {
    const user = await resolveWebUser(req);
    if (user) {
      req.webUser = user;
      req.telegramUser = { id: user.telegramId };
    }
  } catch (_) { /* guest path */ }
  next();
}

module.exports = webAuth;
module.exports.webAuthOptional = webAuthOptional;
module.exports.signSession = signSession;
module.exports.sessionCookieOptions = sessionCookieOptions;
module.exports.COOKIE_NAME = COOKIE_NAME;
