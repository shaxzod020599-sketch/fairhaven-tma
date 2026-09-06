const test = require('node:test');
const assert = require('node:assert/strict');
const { IncomingMessage, ServerResponse } = require('node:http');
const { Duplex } = require('node:stream');
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/uzum-router-pure';
process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'test-shop';
process.env.BILLZ_CASHBOX_ID = 'test-cashbox';
process.env.BILLZ_PAYMENT_TYPE_ID = 'test-payment';
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.UZUM_ENABLED = 'true';
const { response } = require('./uzumSchema');
const { app } = require('../src/server');
const config = require('../src/config');
config.uzum.enabled = false;
delete require.cache[require.resolve('../src/server')];
const { app: disabledApp } = require('../src/server');
config.uzum.enabled = true;

function request(method, url, body = '', type = 'application/vnd.eats.order.v2+json', target = app) {
  return new Promise((resolve, reject) => {
    const socket = new Duplex({ read() {}, write(_data, _encoding, done) { done(); } });
    const req = new IncomingMessage(socket);
    req.method = method;
    req.url = url;
    req.headers = { 'content-type': type, 'content-length': Buffer.byteLength(body) };
    const res = new ServerResponse(req);
    res.end = (data) => resolve({ status: res.statusCode, type: res.getHeader('content-type'), body: JSON.parse(String(data)) });
    target.handle(req, res, reject);
    req.push(body);
    req.push(null);
  });
}
test('actual router returns YAML malformed vendor JSON errors on both mounts', async () => {
  for (const prefix of ['/uzum', '/uzum/v1']) {
    const res = await request('POST', `${prefix}/order`, '{"eatsId":');
    assert.equal(res.status, 400);
    response('/order', 'post', res);
  }
});
test('full app scopes malformed and oversized ordinary/vendor JSON to both enabled Uzum mounts', async () => {
  for (const prefix of ['/uzum', '/uzum/v1']) {
    for (const type of ['application/json', 'application/vnd.eats.order.v2+json']) {
      for (const [body, status] of [['{"eatsId":', 400], [JSON.stringify({ comment: 'x'.repeat(256 * 1024) }), 413]]) {
        const res = await request('POST', `${prefix}/order`, body, type);
        assert.equal(res.status, status, `${prefix} ${type}`);
        response('/order', 'post', res);
      }
    }
  }
});
test('full app preserves non-Uzum and disabled-Uzum parser behavior', async () => {
  for (const [target, paths] of [[app, ['/medicalka/v1/order', '/medicalka/order', '/uzummalicious/order']], [disabledApp, ['/uzum/order', '/uzum/v1/order']]]) {
    for (const path of paths) {
      for (const body of ['{"eatsId":', JSON.stringify({ comment: 'x'.repeat(256 * 1024) })]) {
        const res = await request('POST', path, body, 'application/json', target);
        assert.equal(res.status, 500, path);
        assert.deepEqual(res.body, { error: 'internal_error' });
      }
    }
  }
  for (const path of ['/uzum/order', '/uzum/v1/order']) {
    const res = await request('POST', path, '{"eatsId":', 'application/vnd.eats.order.v2+json', disabledApp);
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'not_found' });
  }
});
test('actual router auth and OAuth errors match route-specific YAML', async () => {
  for (const [method, route, schemaRoute] of [['POST', '/order', '/order'], ['GET', '/order/id', '/order/{orderId}'], ['GET', '/order/id/status', '/order/{orderId}/status'], ['GET', '/nomenclature/id/composition', '/v1/nomenclature/{storeId}/composition'], ['GET', '/nomenclature/id/availability', '/v1/nomenclature/{storeId}/availability']]) {
    const res = await request(method, `/uzum${route}`);
    assert.equal(res.status, 401);
    response(schemaRoute, method, res);
  }
  const res = await request('POST', '/uzum/security/oauth/token', 'grant_type=password', 'application/x-www-form-urlencoded');
  assert.equal(res.status, 400);
  response('/security/oauth/token', 'post', res);
});
