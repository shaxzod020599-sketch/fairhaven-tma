const path = require('path');

const DEV_ORIGINS = {
  public: 'http://fairhaven.localhost:5174',
  admin: 'http://admin.localhost:5173',
  tma: 'http://mini.localhost:5175',
};

function parseOrigin(envName, fallback) {
  const raw = process.env[envName]
    || (process.env.NODE_ENV === 'production' ? '' : fallback);
  if (!raw) throw new Error(`${envName} is required in production`);
  let url;
  try {
    url = new URL(raw);
  } catch (_) {
    throw new Error(`${envName} must be an absolute http(s) URL`);
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(`${envName} must be an absolute http(s) URL`);
  }
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error(`${envName} must use https in production`);
  }
  return url;
}

const ORIGINS = {
  public: parseOrigin('PUBLIC_ORIGIN', DEV_ORIGINS.public),
  admin: parseOrigin('ADMIN_ORIGIN', DEV_ORIGINS.admin),
  tma: parseOrigin('TMA_ORIGIN', DEV_ORIGINS.tma),
};

const SURFACES = [
  { key: 'public', origin: ORIGINS.public.origin, host: ORIGINS.public.hostname.toLowerCase(), dist: path.resolve(__dirname, '../../web/dist') },
  { key: 'admin', origin: ORIGINS.admin.origin, host: ORIGINS.admin.hostname.toLowerCase(), dist: path.resolve(__dirname, '../../admin/dist') },
  { key: 'tma', origin: ORIGINS.tma.origin, host: ORIGINS.tma.hostname.toLowerCase(), dist: path.resolve(__dirname, '../../frontend/dist') },
];

function surfaceForHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return SURFACES.find((surface) => surface.host === host) || null;
}

function publicAdminRedirect(hostname, pathname) {
  if (surfaceForHost(hostname)?.key !== 'public') return '';
  const pathValue = String(pathname || '');
  if (pathValue !== '/admin' && pathValue !== '/admin/' && !pathValue.startsWith('/admin/')) return '';
  const suffix = pathValue.slice('/admin'.length) || '/';
  return `${ORIGINS.admin.origin}${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
}

function allowedOrigins() {
  return new Set(SURFACES.map((surface) => surface.origin));
}

module.exports = {
  ORIGINS,
  SURFACES,
  allowedOrigins,
  publicAdminRedirect,
  surfaceForHost,
};
