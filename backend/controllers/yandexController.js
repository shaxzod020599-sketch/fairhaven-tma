const hub = require('../utils/channelHub');
const ID = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const ACTIONS = ['accept', 'cooking', 'ready', 'reject'];
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const revision = (value) => Number.isSafeInteger(value) && value > 0;
const validId = (value) => typeof value === 'string' && ID.test(value);
const validReason = (value) => value === undefined || (typeof value === 'string' && value.length <= 300);
function actorFor(admin, type = 'admin-panel') {
  if (admin?.role !== 'admin' || !revision(admin.telegramId)) return null;
  const name = [admin.firstName, admin.lastName].filter((part) => typeof part === 'string' && part.trim()).join(' ').trim().toWellFormed();
  let bounded = '';
  for (const point of name) { if (bounded.length + point.length > 100) break; bounded += point; }
  return { type, telegramId: admin.telegramId, name: bounded || 'Admin' };
}
function safeCode(result) {
  const code = result?.body?.error;
  return typeof code === 'string' && /^yandex_[a-z_]{1,73}$/.test(code) ? code : 'yandex_service_unavailable';
}
function invalid(res, code) { return res.status(422).json({ success: false, error: code }); }
async function proxy(res, method, segments, options) {
  try {
    const result = await hub.requestInternal(method, ['internal', 'yandex', ...segments], options);
    if (!result.ok) return res.status([403, 404, 409, 422, 503].includes(result.status) ? result.status : 502)
      .json({ success: false, error: safeCode(result) });
    return res.json({ success: true, ...result.body });
  } catch (error) {
    return res.status(error?.notConfigured ? 503 : 502).json({ success: false,
      error: error?.notConfigured ? 'channel_hub_not_configured' : 'channel_hub_unreachable' });
  }
}
function validQuery(query, keys) {
  return Object.keys(query).every((key) => keys.includes(key) && typeof query[key] === 'string' && query[key].length <= 120);
}
function integer(value, fallback, max) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return NaN;
  const number = Number(value);
  return revision(number) && number <= max ? number : NaN;
}
function decisionBody(body) {
  return object(body) && Object.keys(body).every((key) => ['action', 'reason', 'expectedRevision', 'expectedItemsRevision', 'actor', 'role'].includes(key))
    && ACTIONS.includes(body.action) && revision(body.expectedRevision) && validReason(body.reason)
    && (body.expectedItemsRevision === undefined ? body.action !== 'accept' : revision(body.expectedItemsRevision));
}
function validItems(items) {
  if (!Array.isArray(items) || items.length > 100) return false;
  const ids = new Set();
  return items.every((item) => {
    if (!object(item) || Object.keys(item).some((key) => !['billzProductId', 'quantity'].includes(key))
      || typeof item.billzProductId !== 'string' || !item.billzProductId.trim() || item.billzProductId.length > 64
      || !revision(item.quantity) || item.quantity > 10000 || ids.has(item.billzProductId)) return false;
    ids.add(item.billzProductId); return true;
  });
}
exports.list = async (req, res) => {
  const query = req.query || {}; const bucket = query.bucket === undefined ? 'active' : query.bucket;
  const page = integer(query.page, 1, 100000); const limit = integer(query.limit, 30, 100);
  if (!validQuery(query, ['bucket', 'page', 'limit']) || !['active', 'history', 'all'].includes(bucket)
    || !revision(page) || !revision(limit)) return invalid(res, 'yandex_invalid_query');
  return proxy(res, 'GET', ['orders'], { query: { bucket, page, limit } });
};
exports.detail = async (req, res) => {
  if (!validId(req.params?.id)) return invalid(res, 'yandex_invalid_id');
  return proxy(res, 'GET', ['orders', req.params.id]);
};
exports.products = async (req, res) => {
  const query = req.query || {}; const limit = integer(query.limit, 30, 100);
  if (!validQuery(query, ['search', 'limit']) || !revision(limit)) return invalid(res, 'yandex_invalid_query');
  return proxy(res, 'GET', ['products'], { query: { search: query.search || '', limit } });
};
exports.decide = async (req, res) => {
  const actor = actorFor(req.admin);
  if (!actor) return res.status(403).json({ success: false, error: 'yandex_forbidden' });
  if (!validId(req.params?.id) || !decisionBody(req.body)) return invalid(res, 'yandex_invalid_decision');
  const { action, reason = '', expectedRevision, expectedItemsRevision } = req.body;
  return proxy(res, 'POST', ['orders', req.params.id, 'decision'], { body: { action, reason: reason.trim(), expectedRevision,
    ...(expectedItemsRevision === undefined ? {} : { expectedItemsRevision }), actor } });
};
exports.updateItems = async (req, res) => {
  const actor = actorFor(req.admin);
  if (!actor) return res.status(403).json({ success: false, error: 'yandex_forbidden' });
  const body = req.body;
  if (!validId(req.params?.id) || !object(body)
    || Object.keys(body).some((key) => !['items', 'reason', 'expectedItemsRevision', 'actor', 'role'].includes(key))
    || !revision(body.expectedItemsRevision) || !validReason(body.reason) || !validItems(body.items)) return invalid(res, 'yandex_invalid_items_request');
  return proxy(res, 'PUT', ['orders', req.params.id, 'items'], { body: {
    items: body.items.map(({ billzProductId, quantity }) => ({ billzProductId, quantity })),
    expectedItemsRevision: body.expectedItemsRevision, reason: (body.reason || '').trim(), actor,
  } });
};
exports.actorFor = actorFor;
exports.safeCode = safeCode;
exports.validId = validId;
exports.decisionBody = decisionBody;
