function sendError(res, status, _err, code) {
  const safeCode = code || (status >= 500 ? 'internal_error' : 'invalid_request');
  return res.status(status).json({ success: false, error: safeCode });
}

// Telegram serves Mini Apps inside an iframe on Telegram Web (web.telegram.org,
// webk./webz. variants). X-Frame-Options has no allow-list — ALLOW-FROM is dead —
// so framing is controlled by CSP frame-ancestors instead and XFO is not sent.
const FRAME_ANCESTORS = ["'self'", 'https://telegram.org', 'https://*.telegram.org'];

// No 'unsafe-inline' in script-src: the cache-bust bootstrap that used to sit
// inline in index.html now lives in public/build-guard.js, so an injected
// <script> — the main XSS payload — cannot execute at all.
//
// style-src keeps 'unsafe-inline' because React writes style attributes and
// Vite injects a stylesheet at runtime. Inline styles cannot exfiltrate or
// execute, so the trade-off is not the same one.
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' https://telegram.org",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "connect-src 'self'",
  `frame-ancestors ${FRAME_ANCESTORS.join(' ')}`,
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
];

const CONTENT_SECURITY_POLICY = CSP_DIRECTIVES.join('; ');

function securityHeaders(_req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  res.set('Cross-Origin-Resource-Policy', 'same-origin');
  if (process.env.DISABLE_CSP !== 'true') {
    res.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  }
  next();
}

function redactPath(path = '') {
  return String(path)
    .replace(/[a-f0-9]{24}/gi, ':id')
    .replace(/\/\d{5,}(?=\/|$)/g, '/:id');
}

function errorLabel(err) {
  return err?.code || err?.cause?.code || err?.response?.error_code || err?.name || 'Error';
}

module.exports = {
  CONTENT_SECURITY_POLICY,
  errorLabel,
  redactPath,
  securityHeaders,
  sendError,
};
