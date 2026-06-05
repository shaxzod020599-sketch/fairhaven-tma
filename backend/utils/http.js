function sendError(res, status, _err, code) {
  const safeCode = code || (status >= 500 ? 'internal_error' : 'invalid_request');
  return res.status(status).json({ success: false, error: safeCode });
}

function securityHeaders(_req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  res.set('Cross-Origin-Resource-Policy', 'same-origin');
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
  errorLabel,
  redactPath,
  securityHeaders,
  sendError,
};
