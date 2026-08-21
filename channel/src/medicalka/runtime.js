const config = require('../config');
const logger = require('../logger');
const MedicalkaApproval = require('../models/MedicalkaApproval');
const notify = require('../notify/telegram');
const { MedicalkaPartnerClient } = require('./partnerClient');
const { createApprovalService } = require('./approvals');

const client = new MedicalkaPartnerClient({
  baseUrl: config.medicalkaPartner.baseUrl,
  username: config.medicalkaPartner.username,
  password: config.medicalkaPartner.password,
  timeoutMs: config.medicalkaPartner.timeoutMs,
  maxResponseBytes: config.medicalkaPartner.maxResponseBytes,
});

const service = createApprovalService({
  client,
  onNew: async (approval) => {
    if (typeof notify.announceMedicalkaApproval === 'function') {
      await notify.announceMedicalkaApproval(approval);
    }
  },
});

let pollTimer = null;
const health = {
  lastPollAt: null,
  lastSuccessAt: null,
  lastError: '',
};

function cleanApproval(row) {
  if (!row) return null;
  return {
    id: String(row._id),
    externalId: row.externalId,
    checkoutId: row.checkoutId,
    pharmacyId: row.pharmacyId,
    pharmacyName: row.pharmacyName,
    status: row.status,
    comment: row.comment,
    sourceCreatedAt: row.sourceCreatedAt,
    deadlineAt: row.deadlineAt,
    checkoutStatus: row.checkoutStatus,
    checkoutActive: row.checkoutActive,
    requiresAction: row.requiresAction,
    deliveryType: row.deliveryType,
    deliveryData: row.deliveryData,
    orderId: row.orderId,
    customer: row.customer,
    items: row.items,
    subtotal: row.subtotal,
    decision: row.decision,
    inProgress: Boolean(row.operation?.token),
    sync: {
      lastError: row.sync?.lastError || '',
      lastSuccessAt: row.sync?.lastSuccessAt || null,
    },
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    updatedAt: row.updatedAt,
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function listApprovals({ bucket = 'active', search = '', page = 1, limit = 30 } = {}) {
  const query = {};
  if (bucket === 'active') {
    query.status = 'pending';
    query.requiresAction = true;
  } else if (bucket === 'history') {
    query.status = { $ne: 'pending' };
  }
  if (search) {
    const match = new RegExp(escapeRegex(search), 'i');
    query.$or = [
      { externalId: match },
      { checkoutId: match },
      { 'customer.firstName': match },
      { 'customer.lastName': match },
      { 'customer.phone': match },
    ];
  }

  const [rows, total] = await Promise.all([
    MedicalkaApproval().find(query)
      .sort({ requiresAction: -1, sourceCreatedAt: -1 })
      .skip((page - 1) * limit).limit(limit).lean(),
    MedicalkaApproval().countDocuments(query),
  ]);
  return {
    data: rows.map(cleanApproval),
    meta: { page, limit, total },
    sync: {
      enabled: config.medicalkaPartner.enabled,
      lastPollAt: health.lastPollAt,
      lastSuccessAt: health.lastSuccessAt,
      lastError: health.lastError,
      stale: Boolean(health.lastError),
    },
  };
}

async function getApproval(id) {
  if (!/^[a-f\d]{24}$/i.test(String(id || ''))) return null;
  return cleanApproval(await MedicalkaApproval().findById(id).lean());
}

async function respondToApproval(id, decision) {
  if (!config.medicalkaPartner.enabled) {
    const err = new Error('medicalka_inbound_disabled');
    err.code = 'medicalka_inbound_disabled';
    err.status = 503;
    throw err;
  }
  const stored = await MedicalkaApproval().findById(id).select({ externalId: 1 }).lean();
  if (!stored) {
    const err = new Error('medicalka_approval_not_found');
    err.code = 'medicalka_approval_not_found';
    err.status = 404;
    throw err;
  }
  const result = await service.respond(stored.externalId, decision);
  return { ...result, approval: cleanApproval(result.approval) };
}

async function pollOnce() {
  health.lastPollAt = new Date();
  try {
    const result = await service.pollOnce();
    if (!result.skipped) {
      health.lastSuccessAt = new Date();
      health.lastError = '';
    }
    return result;
  } catch (err) {
    health.lastError = String(err?.code || 'medicalka_poll_failed');
    logger.warn('medicalka approval poll failed', { code: health.lastError });
    throw err;
  }
}

function start() {
  if (!config.medicalkaPartner.enabled || pollTimer) return pollTimer;
  pollOnce().catch(() => {});
  pollTimer = setInterval(() => pollOnce().catch(() => {}), config.medicalkaPartner.pollMs);
  pollTimer.unref?.();
  return pollTimer;
}

function stop() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

module.exports = {
  cleanApproval,
  getApproval,
  listApprovals,
  pollOnce,
  respondToApproval,
  start,
  stop,
};
