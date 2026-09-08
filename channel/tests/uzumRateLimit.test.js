const test = require('node:test');
const assert = require('node:assert/strict');
const { IncomingMessage, ServerResponse } = require('node:http');
const { Duplex } = require('node:stream');
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/uzum-limiter-fake';
process.env.BILLZ_SECRET_TOKEN = 'test-secret';
process.env.BILLZ_SHOP_ID = 'test-shop';
process.env.DISABLE_RATE_LIMIT = 'false';
process.env.RATE_LIMIT_CHANNEL_MAX = '2';
process.env.RATE_LIMIT_CHANNEL_AUTH_MAX = '3';
const express = require('express');
const { schema } = require('./uzumSchema');
const { channelLimiter, LIMITS } = require('../src/middleware/rateLimit');
const app = express();
const router = require('../src/adapters/uzum/routes');
app.use('/uzum/v1', router); app.use('/uzum', router);
app.use('/medicalka', channelLimiter, (_req, res) => res.json({ ok: true }));
function request(path, ip, method = 'GET') {
  return new Promise((resolve, reject) => {
    const socket = new Duplex({ read() {}, write(_data, _encoding, done) { done(); } });
    socket.remoteAddress = ip;
    const req = new IncomingMessage(socket); req.method = method; req.url = path;
    req.headers = { 'x-channel-error-contract': 'uzum' };
    const res = new ServerResponse(req);
    res.end = (data) => { res.emit('finish'); resolve({ status: res.statusCode, headers: res.getHeaders(), body: JSON.parse(String(data)) }); };
    app.handle(req, res, reject); req.push(null);
  });
}
test('both real Uzum mounts use ErrorListV1 on throughput and auth-failure limits', async () => {
  let host = 1;
  for (const prefix of ['/uzum', '/uzum/v1']) {
    for (const auth of [false, true]) {
      const ip = `192.0.2.${host++}`;
      const route = auth ? '/order/id/status' : '/security/oauth/token';
      const count = auth ? LIMITS.authFailuresPerFiveMinutes : LIMITS.channelPerMinute;
      for (let n = 0; n < count; n += 1) await request(`${prefix}${route}`, ip, auth ? 'GET' : 'POST');
      const result = await request(`${prefix}${route}`, ip, auth ? 'GET' : 'POST');
      assert.equal(result.status, 429);
      schema('ErrorListV1', result.body);
      assert.deepEqual(result.body, [{ code: 429, description: 'Too many requests — slow down and retry' }]);
      assert.ok(result.headers.ratelimit); assert.ok(result.headers['retry-after']);
    }
  }
});
test('spoofed headers cannot change Medicalka limiter envelope or budgets', async () => {
  assert.deepEqual(LIMITS, { channelPerMinute: 2, authFailuresPerFiveMinutes: 3 });
  await request('/medicalka', '192.0.2.20'); await request('/medicalka', '192.0.2.20');
  const result = await request('/medicalka', '192.0.2.20');
  assert.equal(result.status, 429);
  assert.deepEqual(result.body, { detail: 'Too many requests — slow down and retry' });
});
