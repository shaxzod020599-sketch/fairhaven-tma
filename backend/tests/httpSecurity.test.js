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
  assert.equal(res.headers['X-Frame-Options'], 'SAMEORIGIN');
  assert.match(res.headers['Permissions-Policy'], /camera=\(\)/);
});
