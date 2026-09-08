const test = require('node:test');
const assert = require('node:assert/strict');
const { IncomingMessage, ServerResponse } = require('node:http');
const { Duplex } = require('node:stream');
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/yandex-router';
process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'test-shop';
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.CHANNEL_TELEGRAM_ENABLED = 'false';
const config = require('../src/config');
const disabled = require('../src/server');
// Exercise the enabled mount without supplying any runtime credentials.
config.yandex = { ...config.yandex, enabled: true };
delete require.cache[require.resolve('../src/server')];
const enabled = require('../src/server');

function request(path, body, type = 'application/json', target = enabled.app) {
  return new Promise((resolve, reject) => {
    const socket = new Duplex({ read() {}, write(_data, _encoding, done) { done(); } });
    const req = new IncomingMessage(socket);
    req.method = 'POST'; req.url = path;
    req.headers = { 'content-type': type, 'content-length': Buffer.byteLength(body), 'x-channel': 'yandex' };
    const res = new ServerResponse(req);
    res.end = (data) => resolve({ status: res.statusCode, body: JSON.parse(String(data)) });
    target.handle(req, res, reject);
    req.push(body); req.push(null);
  });
}

test('Yandex defaults off and disabled startup needs no Yandex configuration', () => {
  delete require.cache[require.resolve('../src/config')];
  const defaults = require('../src/config');
  assert.equal(defaults.yandex?.enabled, false);
  config.yandex.enabled = false;
  assert.doesNotThrow(() => disabled.checkYandexConfig());
  config.yandex.enabled = true;
  assert.throws(() => enabled.checkYandexConfig(), /YANDEX_PLACE_ID/);
});

test('enabled Yandex parses ordinary and vendor bodies into bounded channel errors', async () => {
  for (const prefix of ['/yandex', '/YANDEX']) {
    for (const type of ['application/json', 'application/vnd.eats.order.v2+json']) {
      for (const [body, status] of [['{"eatsId":', 400], [JSON.stringify({ comment: 'x'.repeat(256 * 1024) }), 413]]) {
        const res = await request(`${prefix}/order`, body, type);
        assert.equal(res.status, status);
        assert.deepEqual(res.body, [{ code: status, description: status === 400 ? 'Malformed JSON' : 'Request body is too large' }]);
      }
    }
  }
});

test('disabled Yandex and prefix lookalikes preserve existing global parser behavior', async () => {
  for (const [target, paths] of [[enabled.app, ['/yandexevil/order', '/medicalka/v1/order']], [disabled.app, ['/yandex/order']]]) {
    for (const path of paths) {
      const res = await request(path, '{', 'application/json', target);
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { error: 'internal_error' });
    }
  }
  const res = await request('/yandex/order', '{', 'application/vnd.eats.order.v2+json', disabled.app);
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: 'not_found' });
});

test('Yandex missing auth uses reason object and missing signing config fails closed', async () => {
  const res = await request('/yandex/order', '{}');
  assert.equal(res.status, 401);
  assert.equal(typeof res.body.reason, 'string');
  assert.deepEqual(Object.keys(res.body), ['reason']);
});
