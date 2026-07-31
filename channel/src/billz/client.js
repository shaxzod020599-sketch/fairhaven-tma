const config = require('../config');
const logger = require('../logger');
const auth = require('./auth');
const { createLimiter, sleep } = require('./limiter');

/**
 * Billz HTTP client.
 *
 * Every call in the process funnels through one limiter, so the service as a
 * whole stays under the documented 2 req/s. On top of that:
 *
 *  - 429 backs off, honouring Retry-After when Billz sends one.
 *  - 401 invalidates the cached token and retries once.
 *  - Write verbs are refused unless BILLZ_WRITE_ENABLED is on, so a half-built
 *    sales flow cannot mutate the client's live inventory by accident.
 */

const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const limiter = createLimiter({ requestsPerSecond: config.billz.requestsPerSecond });

class BillzError extends Error {
  constructor(message, { status, path, body }) {
    super(message);
    this.name = 'BillzError';
    this.status = status;
    this.path = path;
    this.body = body;
  }
}

async function send(method, path, { query, body, token }) {
  const url = new URL(path, config.billz.baseUrl);
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(config.billz.timeoutMs),
  });

  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch (_) { parsed = { raw: text.slice(0, 300) }; }
  return { res, parsed };
}

async function request(method, path, options = {}) {
  if (WRITE_METHODS.has(method) && !config.billzWriteEnabled) {
    throw new BillzError(
      `refusing ${method} ${path}: BILLZ_WRITE_ENABLED is off`,
      { status: 0, path }
    );
  }

  let retriedAuth = false;

  for (let attempt = 0; ; attempt += 1) {
    const token = await auth.getAccessToken();
    const { res, parsed } = await limiter.schedule(() => send(method, path, { ...options, token }));

    if (res.ok) return parsed;

    if (res.status === 401 && !retriedAuth) {
      retriedAuth = true;
      logger.warn('billz token rejected, re-authenticating', { path });
      await auth.invalidate();
      continue;
    }

    const retriable = res.status === 429 || res.status >= 500;
    if (retriable && attempt < RETRY_DELAYS_MS.length) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const delay = retryAfter > 0 ? retryAfter * 1000 : RETRY_DELAYS_MS[attempt];
      logger.warn('billz request retrying', { path, status: res.status, delay });
      await sleep(delay);
      continue;
    }

    throw new BillzError(`billz ${method} ${path} failed`, {
      status: res.status,
      path,
      body: parsed,
    });
  }
}

const get = (path, query) => request('GET', path, { query });

/** Reads one page of the catalogue. Stock and prices are nested per shop. */
async function listProducts({ page = 1, limit = config.billz.pageSize } = {}) {
  const data = await get('/v2/products', { page, limit });
  return {
    total: Number(data?.count) || 0,
    products: Array.isArray(data?.products) ? data.products : [],
  };
}

/** Confirms the key works and returns the shop list. Used by the health check. */
async function listShops() {
  const data = await get('/v1/shop');
  return Array.isArray(data?.shops) ? data.shops : [];
}

module.exports = { request, get, listProducts, listShops, BillzError, limiter };
