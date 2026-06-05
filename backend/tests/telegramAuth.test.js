const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const BOT_TOKEN = '123456:test-token';
process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;

function signedInitData(user, authDate = Math.floor(Date.now() / 1000), token = BOT_TOKEN) {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: 'AAEAAAE',
    user: JSON.stringify(user),
  });
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('validates signed Telegram init data and returns authenticated user', () => {
  const { validateTelegramInitData } = require('../middleware/telegramAuth');
  const user = { id: 123456, first_name: 'Client' };

  const result = validateTelegramInitData(signedInitData(user), BOT_TOKEN);

  assert.equal(result.id, user.id);
  assert.equal(result.first_name, user.first_name);
});

test('rejects tampered Telegram init data', () => {
  const { validateTelegramInitData } = require('../middleware/telegramAuth');
  const initData = signedInitData({ id: 123456, first_name: 'Client' })
    .replace('123456', '999999');

  assert.throws(
    () => validateTelegramInitData(initData, BOT_TOKEN),
    /invalid_telegram_signature/
  );
});

test('rejects stale Telegram init data', () => {
  const { validateTelegramInitData } = require('../middleware/telegramAuth');
  const stale = Math.floor(Date.now() / 1000) - (25 * 60 * 60);

  assert.throws(
    () => validateTelegramInitData(signedInitData({ id: 123456 }, stale), BOT_TOKEN),
    /stale_telegram_auth/
  );
});

test('telegram auth middleware rejects missing init data', async () => {
  const telegramAuth = require('../middleware/telegramAuth');
  const res = responseRecorder();
  let called = false;

  await telegramAuth({ headers: {} }, res, () => { called = true; });

  assert.equal(called, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'telegram_auth_required');
});

test('admin auth ignores spoofed admin id header', async () => {
  const adminAuth = require('../middleware/adminAuth');
  const res = responseRecorder();
  let called = false;

  await adminAuth(
    { headers: { 'x-admin-telegram-id': '769874135' } },
    res,
    () => { called = true; }
  );

  assert.equal(called, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'admin_required');
});
