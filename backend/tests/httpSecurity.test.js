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
