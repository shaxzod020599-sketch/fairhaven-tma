const crypto = require('crypto');

const DEFAULT_MAX_AGE_SECONDS = 24 * 60 * 60;
const MAX_INIT_DATA_LENGTH = 16 * 1024;

function authError(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

function validateTelegramInitData(
  initData,
  botToken = process.env.TELEGRAM_BOT_TOKEN,
  options = {}
) {
  if (!botToken) throw authError('telegram_auth_unavailable');
  if (typeof initData !== 'string' || !initData || initData.length > MAX_INIT_DATA_LENGTH) {
    throw authError('telegram_auth_required');
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) {
    throw authError('invalid_telegram_signature');
  }
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secret).update(dataCheckString).digest();
  const supplied = Buffer.from(hash, 'hex');
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    throw authError('invalid_telegram_signature');
  }

  const authDate = Number(params.get('auth_date'));
  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const maxAgeSeconds = Number(
    options.maxAgeSeconds ??
    process.env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS ??
    DEFAULT_MAX_AGE_SECONDS
  );
  if (!Number.isSafeInteger(authDate) || authDate <= 0 || authDate > nowSeconds + 60) {
    throw authError('invalid_telegram_auth_date');
  }
  if (Number.isFinite(maxAgeSeconds) && maxAgeSeconds > 0 && nowSeconds - authDate > maxAgeSeconds) {
    throw authError('stale_telegram_auth');
  }

  let user;
  try {
    user = JSON.parse(params.get('user') || '');
  } catch (_) {
    throw authError('invalid_telegram_user');
  }
  const id = Number(user?.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw authError('invalid_telegram_user');
  }

  return { ...user, id };
}

function getTelegramUserFromRequest(req) {
  if (req.telegramUser) return req.telegramUser;
  const user = validateTelegramInitData(req.headers?.['x-telegram-init-data']);
  req.telegramUser = user;
  return user;
}

async function telegramAuth(req, res, next) {
  try {
    getTelegramUserFromRequest(req);
    next();
  } catch (err) {
    const known = [
      'telegram_auth_required',
      'invalid_telegram_signature',
      'invalid_telegram_auth_date',
      'stale_telegram_auth',
      'invalid_telegram_user',
    ].includes(err.code);
    if (!known) console.error('[telegramAuth]', err);
    return res.status(401).json({
      success: false,
      error: known ? err.code : 'telegram_auth_required',
    });
  }
}

function requireSelf(paramName = 'telegramId') {
  return function selfAuthorization(req, res, next) {
    const requestedId = Number(req.params?.[paramName]);
    if (!Number.isSafeInteger(requestedId) || requestedId !== Number(req.telegramUser?.id)) {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }
    next();
  };
}

module.exports = telegramAuth;
module.exports.getTelegramUserFromRequest = getTelegramUserFromRequest;
module.exports.requireSelf = requireSelf;
module.exports.validateTelegramInitData = validateTelegramInitData;
