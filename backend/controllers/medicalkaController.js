const channelHub = require('../utils/channelHub');
const audit = require('../services/adminAudit');

const BUCKETS = new Set(['active', 'history', 'all']);
const SUBORDER_BUCKETS = new Set(['active', 'history', 'reconciliation', 'all']);
const ID = /^[a-f\d]{24}$/i;
const PARTNER_ENVIRONMENTS = new Set(['staging', 'production']);
const PARTNER_MODES = new Set(['observe', 'live']);

function readQuery(raw = {}, buckets = BUCKETS) {
  const bucket = String(raw.bucket || 'active');
  const page = Number(raw.page || 1);
  const limit = Math.min(100, Number(raw.limit || 30));
  const search = String(raw.search || '').trim().slice(0, 120);
  if (
    !buckets.has(bucket)
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

function adminActor(admin) {
  const telegramId = Number(admin?.telegramId);
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) return null;
  return { type: 'admin-panel', telegramId, name: adminName(admin) };
}

function safePartnerProfile(row = {}) {
  return {
    environment: String(row.environment || ''),
    baseUrl: String(row.baseUrl || ''),
    username: String(row.username || ''),
    passwordConfigured: Boolean(row.passwordConfigured),
    processingMode: row.processingMode === 'live' ? 'live' : 'observe',
    active: Boolean(row.active),
    pharmacyCount: Math.max(0, Number(row.pharmacyCount) || 0),
    pharmacies: (Array.isArray(row.pharmacies) ? row.pharmacies : []).map((pharmacy) => ({
      id: String(pharmacy?.id || ''), name: String(pharmacy?.name || ''),
    })).filter((pharmacy) => pharmacy.id),
    lastValidatedAt: row.lastValidatedAt || null,
    health: {
      lastSuccessAt: row.health?.lastSuccessAt || null,
      lastErrorCode: String(row.health?.lastErrorCode || ''),
    },
    source: String(row.source || ''),
  };
}

function safePartnerSummary(body = {}) {
  if (Array.isArray(body.profiles)) {
    return {
      activeEnvironment: PARTNER_ENVIRONMENTS.has(body.activeEnvironment)
        ? body.activeEnvironment : '',
      profiles: body.profiles.map(safePartnerProfile),
    };
  }
  return safePartnerProfile(body);
}

function readPartnerProfile(req) {
  const environment = String(req.params?.environment || '');
  const body = req.body;
  if (!PARTNER_ENVIRONMENTS.has(environment) || !body || Array.isArray(body)) return null;
  const allowed = new Set(['username', 'password', 'processingMode']);
  if (Object.keys(body).some((key) => !allowed.has(key))) return null;
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const requestedMode = String(body.processingMode || 'observe');
  if (
    username.length > 200 || password.length > 500
    || !PARTNER_MODES.has(requestedMode)
  ) return null;
  return {
    username,
    password,
    processingMode: environment === 'staging' ? 'observe' : requestedMode,
  };
}

function pharmacyCount(body, environment) {
  if (Array.isArray(body?.profiles)) {
    return Number(body.profiles.find((row) => row.environment === environment)?.pharmacyCount) || 0;
  }
  return Number(body?.pharmacyCount) || 0;
}

async function auditPartner(req, action, environment, outcome, result) {
  await audit.record({
    admin: req.admin,
    action,
    entityType: 'medicalka-partner-profile',
    entityId: environment,
    summary: {
      environment,
      outcome,
      pharmacyCount: pharmacyCount(result, environment),
    },
  });
}

exports.partnerSummary = async (_req, res) => {
  try {
    const result = await channelHub.requestInternal(
      'GET', ['internal', 'medicalka', 'partner']
    );
    if (!result.ok) return safeUpstream(res, result);
    return res.json({ success: true, data: safePartnerSummary(result.body) });
  } catch (err) {
    return unavailable(res, err);
  }
};

exports.updatePartnerProfile = async (req, res) => {
  const environment = String(req.params?.environment || '');
  const body = readPartnerProfile(req);
  if (!body) return res.status(400).json({ success: false, error: 'medicalka_invalid_profile' });
  try {
    const result = await channelHub.requestInternal(
      'PUT', ['internal', 'medicalka', 'partner', 'profiles', environment], { body }
    );
    if (!result.ok) return safeUpstream(res, result);
    const data = safePartnerSummary(result.body);
    await auditPartner(req, 'medicalka.partner.profile.update', environment, 'validated', data);
    return res.json({ success: true, data });
  } catch (err) {
    return unavailable(res, err);
  }
};

exports.activatePartnerProfile = async (req, res) => {
  const environment = String(req.body?.environment || '');
  if (!PARTNER_ENVIRONMENTS.has(environment)) {
    return res.status(400).json({ success: false, error: 'medicalka_invalid_environment' });
  }
  try {
    const result = await channelHub.requestInternal(
      'POST', ['internal', 'medicalka', 'partner', 'activate'], { body: { environment } }
    );
    if (!result.ok) return safeUpstream(res, result);
    const data = safePartnerSummary(result.body);
    await auditPartner(req, 'medicalka.partner.profile.activate', environment, 'activated', data);
    return res.json({ success: true, data });
  } catch (err) {
    return unavailable(res, err);
  }
};

exports.setPartnerMode = async (req, res) => {
  const environment = String(req.body?.environment || '');
  const processingMode = String(req.body?.processingMode || '');
  if (
    !PARTNER_ENVIRONMENTS.has(environment)
    || !PARTNER_MODES.has(processingMode)
    || (environment === 'staging' && processingMode !== 'observe')
  ) {
    return res.status(400).json({
      success: false, error: 'medicalka_invalid_processing_mode',
    });
  }
  try {
    const result = await channelHub.requestInternal(
      'POST', ['internal', 'medicalka', 'partner', 'mode'], {
        body: { environment, processingMode },
      }
    );
    if (!result.ok) return safeUpstream(res, result);
    const data = safePartnerSummary(result.body);
    await auditPartner(
      req, 'medicalka.partner.profile.mode', environment, processingMode, data
    );
    return res.json({ success: true, data });
  } catch (err) {
    return unavailable(res, err);
  }
};

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
  const actor = adminActor(req.admin);
  if (
    !ID.test(id)
    || !['accepted', 'rejected'].includes(action)
    || comment.length > 500
    || !actor
  ) {
    return res.status(400).json({ success: false, error: 'medicalka_invalid_decision' });
  }
  try {
    const result = await channelHub.requestInternal(
      'POST', ['internal', 'medicalka', 'approvals', id, 'respond'], {
        body: {
          action,
          comment,
          actor,
        },
      }
    );
    if (!result.ok) return safeUpstream(res, result);
    return res.json({ success: true, ...result.body });
  } catch (err) {
    return unavailable(res, err);
  }
};

exports.listSubOrders = async (req, res) => {
  const query = readQuery(req.query, SUBORDER_BUCKETS);
  if (!query) return res.status(400).json({ success: false, error: 'medicalka_invalid_query' });
  try {
    const result = await channelHub.requestInternal(
      'GET', ['internal', 'medicalka', 'sub-orders'], { query }
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

exports.detailSubOrder = async (req, res) => {
  const id = String(req.params?.id || '');
  if (!ID.test(id)) return res.status(400).json({ success: false, error: 'medicalka_invalid_id' });
  try {
    const result = await channelHub.requestInternal(
      'GET', ['internal', 'medicalka', 'sub-orders', id]
    );
    if (!result.ok) return safeUpstream(res, result);
    return res.json({ success: true, data: result.body?.data || null });
  } catch (err) {
    return unavailable(res, err);
  }
};

async function subOrderAction(req, res, tail, body) {
  const id = String(req.params?.id || '');
  const actor = adminActor(req.admin);
  if (!ID.test(id) || !actor) {
    return res.status(400).json({ success: false, error: 'medicalka_invalid_action' });
  }
  try {
    const result = await channelHub.requestInternal(
      'POST', ['internal', 'medicalka', 'sub-orders', id, tail],
      { body: { ...body, actor } }
    );
    if (!result.ok) return safeUpstream(res, result);
    return res.json({ success: true, data: result.body?.data || null });
  } catch (err) {
    return unavailable(res, err);
  }
}

exports.transitionSubOrder = async (req, res) => {
  const status = String(req.body?.status || '');
  if (!['shipped', 'delivered', 'completed'].includes(status)) {
    return res.status(400).json({ success: false, error: 'medicalka_invalid_suborder_status' });
  }
  return subOrderAction(req, res, 'status', { status });
};

exports.cancelSubOrder = async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (!reason || reason.length > 500) {
    return res.status(400).json({ success: false, error: 'medicalka_invalid_cancel_reason' });
  }
  return subOrderAction(req, res, 'cancel', { reason });
};

exports.addSubOrderLabel = async (req, res) => {
  const itemId = String(req.body?.itemId || '').trim();
  const label = String(req.body?.label || '');
  if (!itemId || label.length < 21 || label.length > 500) {
    return res.status(400).json({ success: false, error: 'medicalka_invalid_label' });
  }
  return subOrderAction(req, res, 'labels', { itemId, label });
};

module.exports.readQuery = readQuery;
