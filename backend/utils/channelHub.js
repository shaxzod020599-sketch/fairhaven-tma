/**
 * Calls into the channel hub over loopback.
 *
 * The panel never talks to Billz and never touches the hub's collections: it
 * asks the hub, which owns the Billz key, the request queue and the credential
 * store. Keeping that in one helper means the shared token is read in one place
 * and a missing configuration produces the same answer everywhere.
 */

const DEFAULT_TIMEOUT_MS = 30000;

function config() {
  return {
    baseUrl: (process.env.CHANNEL_HUB_URL || '').replace(/\/+$/, ''),
    token: process.env.CHANNEL_INTERNAL_TOKEN || '',
  };
}

function isConfigured() {
  const { baseUrl, token } = config();
  return Boolean(baseUrl && token);
}

/**
 * Returns `{ ok, status, body }` rather than throwing on an HTTP error.
 *
 * A 404 from the hub is information the caller usually wants to forward, not an
 * exception; only an unreachable hub throws.
 */
async function request(method, path, { body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const { baseUrl, token } = config();
  if (!baseUrl || !token) {
    const err = new Error('channel_hub_not_configured');
    err.notConfigured = true;
    throw err;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'X-Internal-Token': token,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(timeoutMs),
  });

  return {
    ok: response.ok,
    status: response.status,
    body: await response.json().catch(() => null),
  };
}

module.exports = { isConfigured, request };
