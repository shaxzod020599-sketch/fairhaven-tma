const channelHub = require('../utils/channelHub');

const BUCKETS = new Set(['active', 'history', 'all']);
const ID = /^[a-f\d]{24}$/i;

function readQuery(raw = {}) {
  const bucket = String(raw.bucket || 'active');
  const page = Number(raw.page || 1);
  const limit = Math.min(100, Number(raw.limit || 30));
  const search = String(raw.search || '').trim().slice(0, 120);
  if (
    !BUCKETS.has(bucket)
    || !Number.isSafeInteger(page) || page < 1
    || !Number.isSafeInteger(limit) || limit < 1
  ) return null;
  return { bucket, page, limit, search };
}

function safeUpstream(res, result) {
  const code = String(result?.body?.error || 'medicalka_unavailable');
  const error = code.startsWith('medicalka_') ? code : 'medicalka_unavailable';
  const status = [404, 409, 422, 503].includes(result?.status) ? result.status : 502;
  return res.status(status).json({ success: false, error });
}

function unavailable(res, err) {
  if (err?.notConfigured) {
    return res.status(503).json({ success: false, error: 'channel_hub_not_configured' });
  }
  return res.status(502).json({ success: false, error: 'channel_hub_unreachable' });
}

function adminName(admin) {
  return [admin?.firstName, admin?.lastName].filter(Boolean).join(' ')
    || (admin?.username ? `@${admin.username}` : 'Admin');
}

exports.list = async (req, res) => {
  const query = readQuery(req.query);
  if (!query) return res.status(400).json({ success: false, error: 'medicalka_invalid_query' });
  try {
    const result = await channelHub.requestInternal(
      'GET', ['internal', 'medicalka', 'approvals'], { query }
    );
    if (!result.ok) return safeUpstream(res, result);
    return res.json({
      success: true,
      data: result.body?.data || [],
      meta: result.body?.meta || { page: query.page, limit: query.limit, total: 0 },
      sync: result.body?.sync || { stale: true },
    });
  } catch (err) {
    return unavailable(res, err);
  }
};

exports.detail = async (req, res) => {
  const id = String(req.params?.id || '');
  if (!ID.test(id)) {
    return res.status(400).json({ success: false, error: 'medicalka_invalid_id' });
  }
  try {
    const result = await channelHub.requestInternal(
      'GET', ['internal', 'medicalka', 'approvals', id]
    );
    if (!result.ok) return safeUpstream(res, result);
    return res.json({ success: true, data: result.body?.data || null });
  } catch (err) {
    return unavailable(res, err);
  }
};

exports.respond = async (req, res) => {
  const id = String(req.params?.id || '');
  const action = String(req.body?.action || '');
  const comment = String(req.body?.comment || '').trim();
  const telegramId = Number(req.admin?.telegramId);
  if (
    !ID.test(id)
    || !['accepted', 'rejected'].includes(action)
    || comment.length > 500
    || !Number.isSafeInteger(telegramId) || telegramId <= 0
  ) {
    return res.status(400).json({ success: false, error: 'medicalka_invalid_decision' });
  }
  try {
    const result = await channelHub.requestInternal(
      'POST', ['internal', 'medicalka', 'approvals', id, 'respond'], {
        body: {
          action,
          comment,
          actor: {
            type: 'admin-panel',
            telegramId,
            name: adminName(req.admin),
          },
        },
      }
    );
    if (!result.ok) return safeUpstream(res, result);
    return res.json({ success: true, ...result.body });
  } catch (err) {
    return unavailable(res, err);
  }
};

module.exports.readQuery = readQuery;
