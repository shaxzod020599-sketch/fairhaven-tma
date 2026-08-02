const ADMIN_BASE = '/api/admin';

export class ApiError extends Error {
  constructor(message, { code = 'request_failed', status = 0, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * CSRF token for this session. Kept in memory only: the server hands it back
 * from /auth/whoami and from the login exchange, and a page reload asks again.
 * Deliberately never written to storage — a token that survives there is a
 * token an injected script can read at leisure.
 */
let csrfToken = '';

export function setCsrfToken(value) {
  csrfToken = String(value || '');
}

export function getCsrfToken() {
  return csrfToken;
}

export function clearCsrfToken() {
  csrfToken = '';
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function requestHeaders(method, body, extra = {}) {
  return {
    ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    ...(MUTATING.has(method) && csrfToken ? { 'X-FH-CSRF': csrfToken } : {}),
    ...extra,
  };
}

async function readJson(response) {
  const type = response.headers.get('Content-Type') || '';
  if (!type.includes('application/json')) return null;
  return response.json().catch(() => null);
}

const MESSAGES = {
  csrf_rejected: 'Сессия устарела. Обновите страницу и войдите заново.',
  admin_session_required: 'Сессия закончилась. Войдите снова.',
  admin_host_required: 'Панель открыта не по своему адресу.',
  channel_hub_not_configured: 'Сервис каналов ещё не настроен.',
  channel_hub_unreachable: 'Сервис каналов не отвечает.',
};

function errorFrom(response, data) {
  const code = data?.error || data?.code || 'request_failed';
  const fallback = MESSAGES[code]
    || (response.status >= 500 ? 'Сервис временно недоступен' : 'Не удалось выполнить запрос');
  return new ApiError(data?.message || fallback, {
    code,
    status: response.status,
    details: data?.details,
  });
}

export async function rawRequest(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body;
  return fetch(path, {
    ...options,
    method,
    credentials: 'same-origin',
    headers: requestHeaders(method, body, options.headers),
    body: body && !(body instanceof FormData) && typeof body === 'object'
      ? JSON.stringify(body)
      : body,
  });
}

export async function apiRequest(path, options = {}) {
  const response = await rawRequest(`${ADMIN_BASE}${path}`, options);
  const data = await readJson(response);
  if (!response.ok || data?.success === false) throw errorFrom(response, data);
  // whoami and the login exchange carry the session's CSRF token.
  if (data?.data?.csrfToken) setCsrfToken(data.data.csrfToken);
  return data ?? { success: true };
}

function responseFilename(response) {
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] || 'fairhaven-export.xlsx';
}

export async function downloadRequest(path) {
  const response = await rawRequest(`${ADMIN_BASE}${path}`);
  if (!response.ok) throw errorFrom(response, await readJson(response));
  return { blob: await response.blob(), filename: responseFilename(response) };
}
