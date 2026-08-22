const config = require('../config');
const logger = require('../logger');
const MedicalkaApproval = require('../models/MedicalkaApproval');
const MedicalkaSubOrder = require('../models/MedicalkaSubOrder');
const notify = require('../notify/telegram');
const { MedicalkaPartnerClient } = require('./partnerClient');
const { createApprovalService } = require('./approvals');
const { startNotificationWorker } = require('./notificationWorker');
const { createSubOrderService } = require('./subOrders');

const client = new MedicalkaPartnerClient({
  baseUrl: config.medicalkaPartner.baseUrl,
  username: config.medicalkaPartner.username,
  password: config.medicalkaPartner.password,
  timeoutMs: config.medicalkaPartner.timeoutMs,
  maxResponseBytes: config.medicalkaPartner.maxResponseBytes,
});

let service = null;
let subOrders = null;

function initializeServices() {
  if (!service) {
    service = createApprovalService({
      client,
      onNew: async (approval) => {
        if (typeof notify.announceMedicalkaApproval === 'function') {
          await notify.announceMedicalkaApproval(approval);
        }
      },
      onDecision: async (approval) => {
        if (typeof notify.finalizeMedicalkaApproval === 'function') {
          await notify.finalizeMedicalkaApproval(String(approval._id));
        }
      },
    });
  }
  if (!subOrders) {
    subOrders = createSubOrderService({
      client,
      historyPollMs: config.medicalkaPartner.subOrderHistoryPollMs,
      historyWindowDays: config.medicalkaPartner.subOrderHistoryDays,
    });
  }
}

function approvalService() {
  initializeServices();
  return service;
}

function subOrderService() {
  initializeServices();
  return subOrders;
}

let pollTimer = null;
let historyTimer = null;
let notificationTimer = null;
let subOrderTimer = null;
const health = {
  lastPollAt: null,
  lastSuccessAt: null,
  lastError: '',
  subOrdersLastSuccessAt: null,
  subOrdersLastError: '',
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
    reconciliationRequired: Boolean(row.operation?.reconciliationRequired),
    sync: {
      lastError: row.sync?.lastError || '',
      lastSuccessAt: row.sync?.lastSuccessAt || null,
    },
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    updatedAt: row.updatedAt,
  };
}

function cleanSubOrder(row) {
  if (!row) return null;
  return {
    id: String(row._id),
    externalId: row.externalId,
    orderId: row.orderId,
    orderNumber: row.orderNumber,
    subOrderNumber: row.subOrderNumber,
    pharmacyName: row.pharmacyName,
    paymentStatus: row.paymentStatus,
    paymentMethod: row.paymentMethod,
    status: row.status,
    deliveryType: row.deliveryType,
    subtotal: row.subtotal,
    sourceCreatedAt: row.sourceCreatedAt,
    customer: row.customer,
    items: row.items,
    mapping: row.mapping,
    sale: row.sale,
    operation: {
      inProgress: Boolean(row.operation?.token),
      reconciliationRequired: Boolean(row.operation?.reconciliationRequired),
      lastError: row.operation?.lastError || '',
    },
    lastAction: row.lastAction,
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
    query.checkoutActive = true;
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

async function listSubOrders({ bucket = 'active', search = '', page = 1, limit = 30 } = {}) {
  const query = {};
  if (bucket === 'active') {
    query.paymentStatus = 'paid';
    query.status = { $in: ['processing', 'shipped'] };
  } else if (bucket === 'history') {
    query.status = { $nin: ['processing', 'shipped'] };
  } else if (bucket === 'reconciliation') {
    query.$or = [
      { 'mapping.state': 'reconciliation_required' },
      { 'sale.reconciliationRequired': true },
      { 'operation.reconciliationRequired': true },
    ];
  }
  if (search) {
    const match = new RegExp(escapeRegex(search), 'i');
    const searchRows = [
      { externalId: match }, { orderNumber: match }, { subOrderNumber: match },
      { 'customer.firstName': match }, { 'customer.lastName': match }, { 'customer.phone': match },
    ];
    query.$and = [...(query.$and || []), { $or: searchRows }];
  }
  const [rows, total] = await Promise.all([
    MedicalkaSubOrder().find(query).sort({ sourceCreatedAt: -1 })
      .skip((page - 1) * limit).limit(limit).lean(),
    MedicalkaSubOrder().countDocuments(query),
  ]);
  return {
    data: rows.map(cleanSubOrder),
    meta: { page, limit, total },
    sync: {
      enabled: config.medicalkaPartner.enabled && config.medicalkaPartner.subOrdersEnabled,
      lastSuccessAt: health.subOrdersLastSuccessAt,
      lastError: health.subOrdersLastError,
      stale: Boolean(health.subOrdersLastError),
    },
  };
}

async function getSubOrder(id) {
  if (!/^[a-f\d]{24}$/i.test(String(id || ''))) return null;
  return cleanSubOrder(await MedicalkaSubOrder().findById(id).lean());
}

function subOrdersEnabled() {
  return config.medicalkaPartner.enabled && config.medicalkaPartner.subOrdersEnabled;
}

function requireSubOrders() {
  if (subOrdersEnabled()) return;
  const err = new Error('medicalka_suborders_disabled');
  err.code = 'medicalka_suborders_disabled';
  err.status = 503;
  throw err;
}

async function storedSubOrder(id) {
  const stored = /^[a-f\d]{24}$/i.test(String(id || ''))
    ? await MedicalkaSubOrder().findById(id).select({ externalId: 1 }).lean()
    : null;
  if (stored) return stored;
  const err = new Error('medicalka_suborder_not_found');
  err.code = 'medicalka_suborder_not_found';
  err.status = 404;
  throw err;
}

async function transitionSubOrder(id, status, actor) {
  requireSubOrders();
  const stored = await storedSubOrder(id);
  return cleanSubOrder(await subOrderService().transition(stored.externalId, status, actor));
}

async function cancelSubOrder(id, reason, actor) {
  requireSubOrders();
  const stored = await storedSubOrder(id);
  return cleanSubOrder(await subOrderService().cancel(stored.externalId, reason, actor));
}

async function addSubOrderLabel(id, body) {
  requireSubOrders();
  const stored = await storedSubOrder(id);
  return cleanSubOrder(await subOrderService().addLabel(stored.externalId, body));
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
  const result = await approvalService().respond(stored.externalId, decision);
  return { ...result, approval: cleanApproval(result.approval) };
}

async function pollOnce() {
  health.lastPollAt = new Date();
  try {
    const result = await approvalService().pollOnce();
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

async function reconcileOnce() {
  try {
    return await approvalService().reconcileOnce();
  } catch (err) {
    const code = String(err?.code || 'medicalka_history_sync_failed');
    logger.warn('medicalka approval history sync failed', { code });
    throw err;
  }
}

async function pollSubOrdersOnce() {
  try {
    const result = await subOrderService().pollOnce();
    if (!result.skipped) {
      health.subOrdersLastSuccessAt = new Date();
      health.subOrdersLastError = '';
    }
    return result;
  } catch (err) {
    health.subOrdersLastError = String(err?.code || 'medicalka_suborders_poll_failed');
    logger.warn('medicalka sub-orders poll failed', { code: health.subOrdersLastError });
    throw err;
  }
}

function start() {
  if (!config.medicalkaPartner.enabled || pollTimer) return pollTimer;
  initializeServices();
  pollOnce().catch(() => {});
  pollTimer = setInterval(() => pollOnce().catch(() => {}), config.medicalkaPartner.pollMs);
  pollTimer.unref?.();
  historyTimer = setInterval(
    () => reconcileOnce().catch(() => {}),
    config.medicalkaPartner.historyPollMs
  );
  historyTimer.unref?.();
  notificationTimer = startNotificationWorker({
    drain: () => approvalService().drainNotificationsOnce(),
    intervalMs: config.medicalkaPartner.notificationPollMs,
  });
  if (config.medicalkaPartner.subOrdersEnabled) {
    pollSubOrdersOnce().catch(() => {});
    subOrderTimer = setInterval(
      () => pollSubOrdersOnce().catch(() => {}),
      config.medicalkaPartner.subOrderPollMs
    );
    subOrderTimer.unref?.();
  }
  return pollTimer;
}

function stop() {
  if (pollTimer) clearInterval(pollTimer);
  if (historyTimer) clearInterval(historyTimer);
  if (notificationTimer) clearInterval(notificationTimer);
  if (subOrderTimer) clearInterval(subOrderTimer);
  pollTimer = null;
  historyTimer = null;
  notificationTimer = null;
  subOrderTimer = null;
}

module.exports = {
  cleanApproval,
  cleanSubOrder,
  addSubOrderLabel,
  cancelSubOrder,
  getApproval,
  getSubOrder,
  listApprovals,
  listSubOrders,
  pollOnce,
  pollSubOrdersOnce,
  reconcileOnce,
  respondToApproval,
  start,
  stop,
  transitionSubOrder,
};
