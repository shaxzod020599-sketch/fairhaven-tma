const hub = require('../utils/channelHub');
const ID = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
function actorFor(admin, type = 'admin-panel') {
  if (admin?.role !== 'admin' || !Number.isSafeInteger(admin.telegramId) || admin.telegramId <= 0) return null;
  return { type, telegramId: admin.telegramId, name: [admin.firstName, admin.lastName].filter(Boolean).join(' ').slice(0, 100) || 'Admin' };
}
function safeCode(result) {
  return /^uzum_[a-z_]+$/.test(result?.body?.error || '') ? result.body.error : 'uzum_service_unavailable';
}
async function proxy(res, method, segments, options) {
  try {
    const result = await hub.requestInternal(method, ['internal', 'uzum', ...segments], options);
    if (!result.ok) return res.status([403, 404, 409, 422, 503].includes(result.status) ? result.status : 502).json({ success: false, error: safeCode(result) });
    return res.json({ success: true, ...result.body });
  } catch (err) {
    return res.status(err?.notConfigured ? 503 : 502).json({ success: false, error: err?.notConfigured ? 'channel_hub_not_configured' : 'channel_hub_unreachable' });
  }
}
exports.list = async (req, res) => {
  const bucket = String(req.query?.bucket || 'active');
  const page = Number(req.query?.page || 1);
  const limit = Math.min(100, Number(req.query?.limit || 30));
  if (!['active', 'history', 'all'].includes(bucket) || !Number.isSafeInteger(page) || page < 1
    || !Number.isSafeInteger(limit) || limit < 1) return res.status(422).json({ success: false, error: 'uzum_invalid_query' });
  return proxy(res, 'GET', ['orders'], { query: { bucket, page, limit } });
};
exports.detail = async (req, res) => {
  if (!ID.test(req.params?.id || '')) return res.status(422).json({ success: false, error: 'uzum_invalid_id' });
  return proxy(res, 'GET', ['orders', req.params.id]);
};
exports.decide = async (req, res) => {
  const actor = actorFor(req.admin);
  if (!actor) return res.status(403).json({ success: false, error: 'uzum_forbidden' });
  const { action, reason = '' } = req.body || {};
  if (!ID.test(req.params?.id || '') || !['accept', 'ready', 'reject'].includes(action)
    || typeof reason !== 'string' || reason.length > 300) return res.status(422).json({ success: false, error: 'uzum_invalid_decision' });
  return proxy(res, 'POST', ['orders', req.params.id, 'decision'], { body: { action, reason: reason.trim(), actor } });
};
exports.actorFor = actorFor;
exports.safeCode = safeCode;
exports.ID = ID;
