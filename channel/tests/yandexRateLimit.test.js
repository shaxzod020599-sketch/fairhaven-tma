const test = require('node:test');
const assert = require('node:assert/strict');
const { IncomingMessage, ServerResponse } = require('node:http');
const { Duplex } = require('node:stream');
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/yandex-limiter';
process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'test-shop';
process.env.DISABLE_RATE_LIMIT = 'false';
process.env.RATE_LIMIT_CHANNEL_MAX = '2';
process.env.RATE_LIMIT_CHANNEL_AUTH_MAX = '3';
const express = require('express');
const { channelLimiter } = require('../src/middleware/rateLimit');
const app = express();
app.use('/yandex', require('../src/adapters/yandex/routes'));
app.use('/medicalka', channelLimiter, (_req, res) => res.json({ ok: true }));
function request(route, ip, method = 'GET') {
  return new Promise((resolve, reject) => {
    const socket = new Duplex({ read() {}, write(_data, _encoding, done) { done(); } });
    socket.remoteAddress = ip;
    const req = new IncomingMessage(socket); req.method = method; req.url = route;
    req.headers = { 'x-channel-error-contract': 'yandex' };
    const res = new ServerResponse(req);
    res.end = (data) => { res.emit('finish'); resolve({ status: res.statusCode, body: JSON.parse(String(data)) }); };
    app.handle(req, res, reject); req.push(null);
  });
}
test('real Yandex throughput and auth limits return channel arrays', async () => {
  for (const [route, method, count, ip] of [
    ['/yandex/security/oauth/token', 'POST', 2, '192.0.2.1'],
    ['/yandex/order/unknown/status', 'GET', 3, '192.0.2.2'],
  ]) {
    for (let i = 0; i < count; i += 1) await request(route, ip, method);
    const res = await request(route, ip, method);
    assert.equal(res.status, 429);
    assert.deepEqual(res.body, [{ code: 429, description: 'Too many requests — slow down and retry' }]);
  }
});
test('spoofed Yandex headers leave Medicalka limiter envelope unchanged', async () => {
  await request('/medicalka', '192.0.2.3'); await request('/medicalka', '192.0.2.3');
  const res = await request('/medicalka', '192.0.2.3');
  assert.equal(res.status, 429);
  assert.deepEqual(res.body, { detail: 'Too many requests — slow down and retry' });
});
