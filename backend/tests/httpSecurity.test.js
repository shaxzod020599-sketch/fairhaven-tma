const assert = require('node:assert/strict');
const test = require('node:test');

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
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

test('internal error response never exposes exception message', () => {
  const { sendError } = require('../utils/http');
  const res = responseRecorder();

  sendError(res, 500, new Error('mongodb://user:secret@localhost/private'));

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { success: false, error: 'internal_error' });
});

test('security headers middleware applies browser protections', () => {
  const { securityHeaders } = require('../utils/http');
  const res = responseRecorder();
  let called = false;

  securityHeaders({}, res, () => { called = true; });

  assert.equal(called, true);
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
  assert.match(res.headers['Permissions-Policy'], /camera=\(\)/);
  assert.equal(res.headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
});

test('framing is controlled by CSP, not X-Frame-Options', () => {
  // Telegram Web embeds the Mini App in an iframe. X-Frame-Options cannot
  // express an allow-list, so sending SAMEORIGIN would block the app there.
  const { securityHeaders } = require('../utils/http');
  const res = responseRecorder();

  securityHeaders({}, res, () => {});

  assert.equal(res.headers['X-Frame-Options'], undefined);
  assert.match(res.headers['Content-Security-Policy'], /frame-ancestors[^;]*https:\/\/\*\.telegram\.org/);
});

test('content security policy locks down script origins and plugins', () => {
  const { CONTENT_SECURITY_POLICY } = require('../utils/http');

  assert.match(CONTENT_SECURITY_POLICY, /default-src 'self'/);
  assert.match(CONTENT_SECURITY_POLICY, /script-src [^;]*https:\/\/telegram\.org/);
  assert.match(CONTENT_SECURITY_POLICY, /object-src 'none'/);
  assert.match(CONTENT_SECURITY_POLICY, /base-uri 'self'/);
  // No external script host may be reachable beyond telegram.org.
  const scriptSrc = CONTENT_SECURITY_POLICY.split('; ').find((d) => d.startsWith('script-src'));
  assert.equal(/https:\/\/(?!telegram\.org)/.test(scriptSrc), false);
});

test('inline scripts cannot execute', () => {
  // The cache-bust bootstrap lives in public/build-guard.js precisely so this
  // holds; an injected <script> is the payload this directive exists to stop.
  const { CONTENT_SECURITY_POLICY } = require('../utils/http');
  const scriptSrc = CONTENT_SECURITY_POLICY.split('; ').find((d) => d.startsWith('script-src'));

  assert.equal(scriptSrc.includes("'unsafe-inline'"), false);
  assert.equal(scriptSrc.includes("'unsafe-eval'"), false);
});

test('admin host gets isolated CSP and no-store admin API responses', () => {
  const { securityHeaders } = require('../utils/http');
  const res = responseRecorder();

  securityHeaders({
    hostname: 'admin.fairhaven.uz',
    path: '/api/admin/orders',
  }, res, () => {});

  assert.match(res.headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.match(res.headers['Content-Security-Policy'], /script-src 'self'(?:;|$)/);
  assert.equal(res.headers['Content-Security-Policy'].includes('telegram.org'), false);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('Telegram Mini App host retains Telegram framing and SDK allowlist', () => {
  const { securityHeaders } = require('../utils/http');
  const res = responseRecorder();

  securityHeaders({ hostname: 'mini.fairhaven.uz', path: '/' }, res, () => {});

  assert.match(res.headers['Content-Security-Policy'], /https:\/\/telegram\.org/);
  assert.match(res.headers['Content-Security-Policy'], /frame-ancestors[^;]*https:\/\/\*\.telegram\.org/);
});

test('production responses enable HSTS for every FairHaven host', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const { securityHeaders } = require('../utils/http');
  const res = responseRecorder();

  try {
    securityHeaders({ hostname: 'admin.fairhaven.uz', path: '/' }, res, () => {});
    assert.equal(res.headers['Strict-Transport-Security'], 'max-age=31536000; includeSubDomains');
  } finally {
    process.env.NODE_ENV = previous;
  }
});
