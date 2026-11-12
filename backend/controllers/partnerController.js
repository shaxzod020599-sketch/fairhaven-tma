const channelHub = require('../utils/channelHub');
const audit = require('../services/adminAudit');

/**
 * Admin-panel proxy for Partner API partners (channel hub /internal/partners).
 *
 * The hub owns validation; this layer only forwards, keeps the error codes it
 * recognises, and records every action that hands out or changes access.
 */

const CODE = /^[a-z][a-z0-9-]{2,23}$/;
const ID = /^[a-f\d]{24}$/i;

function adminName(admin) {
  return [admin?.firstName, admin?.lastName].filter(Boolean).join(' ')
    || (admin?.username ? `@${admin.username}` : 'Admin');
}

function forward(res, result) {
  if (result.ok) return res.status(result.status === 201 ? 201 : 200).json({ success: true, data: result.body });
  const raw = String(result?.body?.error || '');
  const error = /^[a-z0-9_]{3,60}$/.test(raw) ? raw : 'partner_unavailable';
  const status = [404, 409, 422, 503].includes(result?.status) ? result.status : 502;
  return res.status(status).json({ success: false, error, message: result?.body?.message || undefined });
}

function unavailable(res, err) {
  if (err?.notConfigured) return res.status(503).json({ success: false, error: 'channel_hub_not_configured' });
  return res.status(502).json({ success: false, error: 'channel_hub_unreachable' });
}

async function record(req, action, code, summary = {}) {
  try {
    await audit.record({ admin: req.admin, action, entityType: 'partner', entityId: code, summary });
  } catch (_) { /* the action itself succeeded; an audit hiccup must not undo it */ }
}

function validCode(req, res) {
  const code = String(req.params.code || '');
  if (!CODE.test(code)) {
    res.status(404).json({ success: false, error: 'partner_not_found' });
    return null;
  }
  return code;
}

exports.list = async (_req, res) => {
  try {
    return forward(res, await channelHub.requestInternal('GET', ['internal', 'partners']));
  } catch (err) { return unavailable(res, err); }
};

exports.create = async (req, res) => {
  const body = {
    code: String(req.body?.code || '').trim().toLowerCase(),
    name: String(req.body?.name || '').trim(),
    ...(req.body?.decisionMinutes !== undefined ? { decisionMinutes: Number(req.body.decisionMinutes) } : {}),
    ...(req.body?.webhookUrl !== undefined ? { webhookUrl: String(req.body.webhookUrl) } : {}),
    ...(req.body?.note !== undefined ? { note: String(req.body.note) } : {}),
  };
  try {
    const result = await channelHub.requestInternal('POST', ['internal', 'partners'], { body });
    if (result.ok) await record(req, 'partner.create', body.code, { name: body.name });
    return forward(res, result);
  } catch (err) { return unavailable(res, err); }
};

const PATCH_FIELDS = ['name', 'mode', 'decisionMinutes', 'note', 'webhookUrl', 'billzSecret', 'billzPaymentTypeId', 'billzPaymentTypeName'];

exports.update = async (req, res) => {
  const code = validCode(req, res);
  if (!code) return undefined;
  const body = {};
  for (const field of PATCH_FIELDS) {
    if (req.body?.[field] !== undefined) body[field] = req.body[field];
  }
  try {
    const result = await channelHub.requestInternal('PATCH', ['internal', 'partners', code], { body });
    if (result.ok) {
      await record(req, 'partner.update', code, {
        fields: Object.keys(body),
        ...(body.mode ? { mode: body.mode } : {}),
        ...(body.billzSecret !== undefined ? { billzKey: body.billzSecret ? 'set' : 'removed' } : {}),
      });
    }
    return forward(res, result);
  } catch (err) { return unavailable(res, err); }
};

exports.issueKeys = async (req, res) => {
  const code = validCode(req, res);
  if (!code) return undefined;
  try {
    const result = await channelHub.requestInternal('POST', ['internal', 'partners', code, 'keys']);
    if (result.ok) await record(req, 'partner.keys.issue', code);
    return forward(res, result);
  } catch (err) { return unavailable(res, err); }
};

exports.webhookSecret = async (req, res) => {
  const code = validCode(req, res);
  if (!code) return undefined;
  try {
    const result = await channelHub.requestInternal('GET', ['internal', 'partners', code, 'webhook-secret']);
    if (result.ok) await record(req, 'partner.webhook_secret.view', code);
    return forward(res, result);
  } catch (err) { return unavailable(res, err); }
};

exports.rotateWebhookSecret = async (req, res) => {
  const code = validCode(req, res);
  if (!code) return undefined;
  try {
    const result = await channelHub.requestInternal('POST', ['internal', 'partners', code, 'webhook-secret']);
    if (result.ok) await record(req, 'partner.webhook_secret.rotate', code);
    return forward(res, result);
  } catch (err) { return unavailable(res, err); }
};

exports.testWebhook = async (req, res) => {
  const code = validCode(req, res);
  if (!code) return undefined;
  try {
    return forward(res, await channelHub.requestInternal('POST', ['internal', 'partners', code, 'webhook', 'test']));
  } catch (err) { return unavailable(res, err); }
};

exports.orders = async (req, res) => {
  const code = validCode(req, res);
  if (!code) return undefined;
  const limit = Math.min(Math.max(Number(req.query?.limit) || 30, 1), 100);
  try {
    return forward(res, await channelHub.requestInternal('GET', ['internal', 'partners', code, 'orders'], { query: { limit } }));
  } catch (err) { return unavailable(res, err); }
};

exports.decide = async (req, res) => {
  const id = String(req.params.id || '');
  const action = req.body?.action;
  if (!ID.test(id)) return res.status(404).json({ success: false, error: 'order_not_found' });
  if (!['accept', 'reject'].includes(action)) return res.status(422).json({ success: false, error: 'invalid_action' });
  try {
    const result = await channelHub.requestInternal('POST', ['internal', 'partners', 'orders', id, 'decision'], {
      body: { action, actor: { name: adminName(req.admin) } },
      timeoutMs: 60000,
    });
    if (result.ok) await record(req, `partner.order.${action}`, id);
    return forward(res, result);
  } catch (err) { return unavailable(res, err); }
};

exports.cancel = async (req, res) => {
  const id = String(req.params.id || '');
  if (!ID.test(id)) return res.status(404).json({ success: false, error: 'order_not_found' });
  try {
    const result = await channelHub.requestInternal('POST', ['internal', 'partners', 'orders', id, 'cancel'], {
      body: { actor: { name: adminName(req.admin) } },
      timeoutMs: 60000,
    });
    if (result.ok) await record(req, 'partner.order.cancel', id);
    return forward(res, result);
  } catch (err) { return unavailable(res, err); }
};
