const config = require('../config');
const logger = require('../logger');
const MedicalkaApproval = require('../models/MedicalkaApproval');
const MedicalkaSubOrder = require('../models/MedicalkaSubOrder');
const notify = require('../notify/telegram');
const { MedicalkaPartnerClient } = require('./partnerClient');
const { createApprovalService } = require('./approvals');
const { startNotificationWorker } = require('./notificationWorker');
const { createSubOrderService } = require('./subOrders');
const {
  ENVIRONMENTS,
  createPartnerProfileService,
  maskUsername,
} = require('./partnerProfiles');
const { createPartnerRuntimeManager } = require('./runtimeManager');

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
    deliveryProvider: row.deliveryProvider,
    courierStatus: row.courierStatus,
    deliveryServiceStatus: row.deliveryServiceStatus,
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

function runtimeError(code, status = 503) {
  const err = new Error(code);
  err.code = code;
  err.status = status;
  return err;
}

function createRuntimeContext({ profile, credentials }) {
  const environment = profile.environment;
  const ApprovalModel = MedicalkaApproval(environment);
  const SubOrderModel = MedicalkaSubOrder(environment);
  const client = new MedicalkaPartnerClient({
    baseUrl: profile.baseUrl,
    username: credentials.username,
    password: credentials.password,
    timeoutMs: config.medicalkaPartner.timeoutMs,
    maxResponseBytes: config.medicalkaPartner.maxResponseBytes,
  });
  const health = {
    lastPollAt: null,
    lastSuccessAt: null,
    lastError: '',
    subOrdersLastSuccessAt: null,
    subOrdersLastError: '',
  };
  let approvalService = null;
  let subOrderService = null;
  let pollTimer = null;
  let historyTimer = null;
  let notificationTimer = null;
  let subOrderTimer = null;

  function initializeServices() {
    if (!approvalService) {
      approvalService = createApprovalService({
        client,
        Model: ApprovalModel,
        onNew: async (approval) => {
          if (typeof notify.announceMedicalkaApproval === 'function') {
            return notify.announceMedicalkaApproval(approval, { ApprovalModel });
          }
          return false;
        },
        onDecision: async (approval) => {
          if (typeof notify.finalizeMedicalkaApproval === 'function') {
            await notify.finalizeMedicalkaApproval(String(approval._id), { ApprovalModel });
          }
        },
      });
    }
    if (!subOrderService) {
      subOrderService = createSubOrderService({
        client,
        Model: SubOrderModel,
        historyPollMs: config.medicalkaPartner.subOrderHistoryPollMs,
        historyWindowDays: config.medicalkaPartner.subOrderHistoryDays,
        environment,
        processingMode: profile.processingMode,
        billzWriteEnabled: () => config.billzWriteEnabled,
        onChanged: async (subOrder) => {
          if (typeof notify.announceMedicalkaSubOrder === 'function') {
            await notify.announceMedicalkaSubOrder(subOrder, { Model: SubOrderModel });
          }
        },
      });
    }
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
      ApprovalModel.find(query).sort({ requiresAction: -1, sourceCreatedAt: -1 })
        .skip((page - 1) * limit).limit(limit).lean(),
      ApprovalModel.countDocuments(query),
    ]);
    return {
      data: rows.map(cleanApproval),
      meta: { page, limit, total },
      sync: {
        enabled: config.medicalkaPartner.enabled,
        environment,
        lastPollAt: health.lastPollAt,
        lastSuccessAt: health.lastSuccessAt,
        lastError: health.lastError,
        stale: Boolean(health.lastError),
      },
    };
  }

  async function getApproval(id) {
    if (!/^[a-f\d]{24}$/i.test(String(id || ''))) return null;
    return cleanApproval(await ApprovalModel.findById(id).lean());
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
      query.$and = [{ $or: [
        { externalId: match }, { orderNumber: match }, { subOrderNumber: match },
        { 'customer.firstName': match }, { 'customer.lastName': match },
        { 'customer.phone': match },
      ] }];
    }
    const [rows, total] = await Promise.all([
      SubOrderModel.find(query).sort({ sourceCreatedAt: -1 })
        .skip((page - 1) * limit).limit(limit).lean(),
      SubOrderModel.countDocuments(query),
    ]);
    return {
      data: rows.map(cleanSubOrder),
      meta: { page, limit, total },
      sync: {
        enabled: config.medicalkaPartner.enabled && config.medicalkaPartner.subOrdersEnabled,
        environment,
        processingMode: profile.processingMode,
        lastSuccessAt: health.subOrdersLastSuccessAt,
        lastError: health.subOrdersLastError,
        stale: Boolean(health.subOrdersLastError),
      },
    };
  }

  async function getSubOrder(id) {
    if (!/^[a-f\d]{24}$/i.test(String(id || ''))) return null;
    return cleanSubOrder(await SubOrderModel.findById(id).lean());
  }

  function requireSubOrders() {
    if (config.medicalkaPartner.enabled && config.medicalkaPartner.subOrdersEnabled) return;
    throw runtimeError('medicalka_suborders_disabled');
  }

  async function storedSubOrder(id) {
    const stored = /^[a-f\d]{24}$/i.test(String(id || ''))
      ? await SubOrderModel.findById(id).select({ externalId: 1 }).lean()
      : null;
    if (stored) return stored;
    throw runtimeError('medicalka_suborder_not_found', 404);
  }

  async function transitionSubOrder(id, status, actor) {
    requireSubOrders();
    const stored = await storedSubOrder(id);
    initializeServices();
    return cleanSubOrder(await subOrderService.transition(stored.externalId, status, actor));
  }

  async function cancelSubOrder(id, reason, actor) {
    requireSubOrders();
    const stored = await storedSubOrder(id);
    initializeServices();
    return cleanSubOrder(await subOrderService.cancel(stored.externalId, reason, actor));
  }

  async function addSubOrderLabel(id, body) {
    requireSubOrders();
    const stored = await storedSubOrder(id);
    initializeServices();
    return cleanSubOrder(await subOrderService.addLabel(stored.externalId, body));
  }

  async function respondToApproval(id, decision) {
    if (!config.medicalkaPartner.enabled) throw runtimeError('medicalka_inbound_disabled');
    const stored = await ApprovalModel.findById(id).select({ externalId: 1 }).lean();
    if (!stored) throw runtimeError('medicalka_approval_not_found', 404);
    initializeServices();
    const result = await approvalService.respond(stored.externalId, decision);
    return { ...result, approval: cleanApproval(result.approval) };
  }

  async function pollOnce() {
    health.lastPollAt = new Date();
    initializeServices();
    try {
      const result = await approvalService.pollOnce();
      if (!result.skipped) {
        health.lastSuccessAt = new Date();
        health.lastError = '';
      }
      return result;
    } catch (err) {
      health.lastError = String(err?.code || 'medicalka_poll_failed');
      logger.warn('medicalka approval poll failed', { environment, code: health.lastError });
      throw err;
    }
  }

  async function reconcileOnce() {
    initializeServices();
    try {
      return await approvalService.reconcileOnce();
    } catch (err) {
      logger.warn('medicalka approval history sync failed', {
        environment, code: String(err?.code || 'medicalka_history_sync_failed'),
      });
      throw err;
    }
  }

  async function pollSubOrdersOnce() {
    initializeServices();
    try {
      const result = await subOrderService.pollOnce();
      if (!result.skipped) {
        health.subOrdersLastSuccessAt = new Date();
        health.subOrdersLastError = '';
      }
      return result;
    } catch (err) {
      health.subOrdersLastError = String(err?.code || 'medicalka_suborders_poll_failed');
      logger.warn('medicalka sub-orders poll failed', {
        environment, code: health.subOrdersLastError,
      });
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
      () => reconcileOnce().catch(() => {}), config.medicalkaPartner.historyPollMs
    );
    historyTimer.unref?.();
    notificationTimer = startNotificationWorker({
      drain: () => Promise.all([
        approvalService.drainNotificationsOnce(),
        typeof notify.drainMedicalkaSubOrderNotifications === 'function'
          ? notify.drainMedicalkaSubOrderNotifications({ Model: SubOrderModel })
          : null,
      ]),
      intervalMs: config.medicalkaPartner.notificationPollMs,
    });
    if (config.medicalkaPartner.subOrdersEnabled) {
      pollSubOrdersOnce().catch(() => {});
      subOrderTimer = setInterval(
        () => pollSubOrdersOnce().catch(() => {}), config.medicalkaPartner.subOrderPollMs
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

  async function hasInProgress() {
    const [approval, subOrder] = await Promise.all([
      ApprovalModel.exists({ 'operation.token': { $nin: ['', null] } }),
      SubOrderModel.exists({ 'operation.token': { $nin: ['', null] } }),
    ]);
    return Boolean(approval || subOrder);
  }

  return {
    environment,
    processingMode: profile.processingMode,
    addSubOrderLabel,
    cancelSubOrder,
    getApproval,
    getSubOrder,
    hasInProgress,
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
}

function fallbackProfile() {
  const environment = String(config.medicalkaPartner.baseUrl).includes('.staging.')
    ? 'staging' : 'production';
  return {
    environment,
    baseUrl: ENVIRONMENTS[environment].baseUrl,
    processingMode: 'observe',
    active: true,
    legacyCredentials: {
      username: config.medicalkaPartner.username,
      password: config.medicalkaPartner.password,
    },
  };
}

let manager = null;

function createProfilesFacade() {
  const fallback = fallbackProfile();
  const stored = config.medicalkaPartner.credentialsEncryptionKey
    ? createPartnerProfileService() : null;

  function requireStored() {
    if (stored) return stored;
    throw runtimeError('medicalka_credentials_key_missing');
  }

  function fallbackSummary() {
    return {
      environment: fallback.environment,
      baseUrl: fallback.baseUrl,
      username: maskUsername(fallback.legacyCredentials.username),
      passwordConfigured: Boolean(fallback.legacyCredentials.password),
      processingMode: 'observe',
      active: true,
      pharmacyCount: 0,
      pharmacies: [],
      lastValidatedAt: null,
      health: { lastSuccessAt: null, lastErrorCode: '' },
      source: 'environment',
    };
  }

  return {
    credentials(profile) {
      return profile.legacyCredentials || requireStored().credentials(profile);
    },
    async get(environment) {
      const row = stored ? await stored.get(environment) : null;
      if (row) return row;
      return environment === fallback.environment ? fallback : null;
    },
    async getActive() {
      return (stored && await stored.getActive()) || fallback;
    },
    async listSummaries() {
      const rows = stored ? await stored.listSummaries() : [];
      if (!rows.some((row) => row.environment === fallback.environment)) {
        rows.push(fallbackSummary());
      }
      for (const environment of Object.keys(ENVIRONMENTS)) {
        if (!rows.some((row) => row.environment === environment)) {
          rows.push({
            environment,
            baseUrl: ENVIRONMENTS[environment].baseUrl,
            username: '',
            passwordConfigured: false,
            processingMode: 'observe',
            active: false,
            pharmacyCount: 0,
            pharmacies: [],
            lastValidatedAt: null,
            health: { lastSuccessAt: null, lastErrorCode: '' },
            source: 'unconfigured',
          });
        }
      }
      return rows.sort((a, b) => a.environment.localeCompare(b.environment));
    },
    async setActive(environment) {
      return requireStored().setActive(environment);
    },
    async setProcessingMode(environment, mode) {
      return requireStored().setProcessingMode(environment, mode);
    },
    async validateAndSave(input) {
      const service = requireStored();
      const saved = await service.validateAndSave(input);
      if (input.environment === fallback.environment && !(await service.getActive())) {
        await service.setActive(input.environment);
        return service.summarize(await service.get(input.environment));
      }
      return saved;
    },
  };
}

function ensureManager() {
  if (manager) return manager;
  const profiles = createProfilesFacade();
  manager = createPartnerRuntimeManager({
    profiles,
    createContext: (profile) => createRuntimeContext({
      profile,
      credentials: profiles.credentials(profile),
    }),
  });
  return manager;
}

function currentContext() {
  const context = manager?.current();
  if (!context) throw runtimeError('medicalka_runtime_not_started');
  return context;
}

async function start() {
  return ensureManager().start();
}

function stop() {
  manager?.stop();
  manager = null;
}

async function connectionSummary() {
  return ensureManager().connectionSummary();
}

async function updatePartnerProfile(input) {
  return ensureManager().updateProfile(input);
}

async function activatePartnerProfile(environment) {
  return ensureManager().activate(environment);
}

async function setPartnerProcessingMode(environment, mode) {
  return ensureManager().setProcessingMode(environment, mode);
}

module.exports = {
  cleanApproval,
  cleanSubOrder,
  activatePartnerProfile,
  connectionSummary,
  setPartnerProcessingMode,
  start,
  stop,
  updatePartnerProfile,
  addSubOrderLabel: (...args) => currentContext().addSubOrderLabel(...args),
  cancelSubOrder: (...args) => currentContext().cancelSubOrder(...args),
  getApproval: (...args) => currentContext().getApproval(...args),
  getSubOrder: (...args) => currentContext().getSubOrder(...args),
  listApprovals: (...args) => currentContext().listApprovals(...args),
  listSubOrders: (...args) => currentContext().listSubOrders(...args),
  pollOnce: (...args) => currentContext().pollOnce(...args),
  pollSubOrdersOnce: (...args) => currentContext().pollSubOrdersOnce(...args),
  reconcileOnce: (...args) => currentContext().reconcileOnce(...args),
  respondToApproval: (...args) => currentContext().respondToApproval(...args),
  transitionSubOrder: (...args) => currentContext().transitionSubOrder(...args),
};
