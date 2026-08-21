const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const { MedicalkaPartnerClient } = require('../src/medicalka/partnerClient');

let server;
let baseUrl;
let calls;
let handler;

function json(res, status, body) {
  const bytes = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': bytes.length });
  res.end(bytes);
}

async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null;
}

test.before(async () => {
  server = http.createServer(async (req, res) => {
    const request = {
      method: req.method,
      url: req.url,
      authorization: req.headers.authorization || '',
      body: await body(req),
    };
    calls.push(request);
    await handler(request, res);
  });
  server.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});

test.beforeEach(() => {
  calls = [];
  handler = (_request, res) => json(res, 404, { detail: 'missing fixture' });
});

test.after(async () => {
  server?.close();
});

function client(overrides = {}) {
  return new MedicalkaPartnerClient({
    baseUrl,
    username: 'fairhaven-admin',
    password: 'private-password',
    timeoutMs: 500,
    maxResponseBytes: 4096,
    ...overrides,
  });
}

test('signs in once and sends the documented approval query', async () => {
  handler = (request, res) => {
    if (request.url === '/api/v1/signin') {
      assert.deepEqual(request.body, {
        username: 'fairhaven-admin',
        password: 'private-password',
      });
      return json(res, 200, { access_token: 'access-1', refresh_token: 'refresh-1' });
    }
    assert.equal(request.authorization, 'Bearer access-1');
    return json(res, 200, { items: [{ id: 'approval-1' }], total: 1, limit: 100, offset: 0 });
  };

  const api = client();
  const result = await api.listApprovals({
    pharmacyIds: ['pharmacy-a', 'pharmacy-b'], status: 'pending', limit: 100, offset: 0,
  });

  assert.equal(result.items[0].id, 'approval-1');
  assert.equal(calls.filter((call) => call.url === '/api/v1/signin').length, 1);
  const query = new URL(calls[1].url, baseUrl).searchParams;
  assert.deepEqual(query.getAll('pharmacy_ids'), ['pharmacy-a', 'pharmacy-b']);
  assert.equal(query.get('status'), 'pending');
  assert.equal(query.get('limit'), '100');
  assert.equal(query.get('offset'), '0');
});

test('rotates refresh token once when concurrent requests receive 401', async () => {
  let refreshes = 0;
  handler = (request, res) => {
    if (request.url === '/api/v1/signin') {
      return json(res, 200, { access_token: 'expired', refresh_token: 'refresh-1' });
    }
    if (request.url === '/api/v1/refresh') {
      refreshes += 1;
      assert.deepEqual(request.body, { refresh_token: 'refresh-1' });
      return setTimeout(() => json(res, 200, {
        access_token: 'access-2', refresh_token: 'refresh-2',
      }), 20);
    }
    if (request.authorization === 'Bearer expired') return json(res, 401, { detail: 'expired' });
    assert.equal(request.authorization, 'Bearer access-2');
    return json(res, 200, { items: [], total: 0 });
  };

  const api = client();
  await Promise.all([api.getPharmacies(), api.getPharmacies(), api.getPharmacies()]);

  assert.equal(refreshes, 1);
  assert.equal(calls.filter((call) => call.authorization === 'Bearer access-2').length, 3);
});

test('sends official accept response without retrying a write', async () => {
  handler = (request, res) => {
    if (request.url === '/api/v1/signin') {
      return json(res, 200, { access_token: 'access-1', refresh_token: 'refresh-1' });
    }
    assert.equal(request.method, 'PATCH');
    assert.equal(request.url,
      '/api/v1/orders/checkout-requests/checkout-a/pharmacies/pharmacy-a/respond');
    assert.deepEqual(request.body, { action: 'accepted', comment: 'Ready' });
    return json(res, 200, {});
  };

  const api = client();
  await api.respondToApproval({
    checkoutId: 'checkout-a', pharmacyId: 'pharmacy-a', action: 'accepted', comment: 'Ready',
  });

  assert.equal(calls.length, 2);
});

test('bounds slow and oversized responses without leaking credentials', async () => {
  handler = (request, res) => {
    if (request.url === '/api/v1/signin') {
      return json(res, 200, { access_token: 'access-1', refresh_token: 'refresh-1' });
    }
    if (request.url.includes('pharmacy-approvals')) {
      res.writeHead(200, { 'content-type': 'application/json', 'content-length': '2048' });
      return res.end('{}');
    }
    return setTimeout(() => json(res, 200, { items: [] }), 100);
  };

  const api = client({ timeoutMs: 30, maxResponseBytes: 128 });
  await assert.rejects(
    () => api.listApprovals({ pharmacyIds: ['pharmacy-a'], status: 'pending' }),
    (err) => err.code === 'medicalka_response_too_large'
      && !err.message.includes('private-password')
      && !err.message.includes('access-1')
  );

  await assert.rejects(
    () => api.getPharmacies(),
    (err) => err.code === 'medicalka_timeout'
      && !err.message.includes('private-password')
      && !err.message.includes('access-1')
  );
});
