const { randomUUID } = require('node:crypto');
const MedicalkaApproval = require('../models/MedicalkaApproval');

const FINAL_STATUSES = new Set(['accepted', 'rejected', 'cancelled']);
const HISTORY_STATUSES = ['accepted', 'rejected', 'cancelled'];
const NOTIFICATION_LEASE_MS = 60 * 1000;
const NOTIFICATION_BATCH_SIZE = 20;
const NOTIFICATION_RETRY_BASE_MS = 30 * 1000;
const NOTIFICATION_RETRY_MAX_MS = 10 * 60 * 1000;
const OPERATION_LEASE_MS = 60 * 1000;

function text(value) {
  return value === null || value === undefined ? '' : String(value);
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function date(value, fallback) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function normalizeApproval(raw, seenAt = new Date()) {
  const sourceCreatedAt = date(raw?.created_at, seenAt);
  return {
    externalId: text(raw?.id),
    checkoutId: text(raw?.checkout_id),
    pharmacyId: text(raw?.pharmacy_id),
    pharmacyName: text(raw?.pharmacy_name),
    status: text(raw?.status) || 'pending',
    comment: text(raw?.comment),
    sourceCreatedAt,
    deadlineAt: new Date(sourceCreatedAt.getTime() + (3 * 60 * 1000)),
    checkoutStatus: text(raw?.checkout_status),
    checkoutActive: Boolean(raw?.checkout_is_active),
    requiresAction: Boolean(raw?.requires_action),
    deliveryType: text(raw?.delivery_type),
    deliveryData: raw?.checkout_delivery_data ?? null,
    orderId: text(raw?.order_id),
    customer: {
      firstName: text(raw?.customer_first_name),
      lastName: text(raw?.customer_last_name),
      phone: text(raw?.customer_phone),
    },
    items: (Array.isArray(raw?.items) ? raw.items : []).map((item) => ({
      stockId: text(item?.stock_id),
      productId: text(item?.product_id),
      name: text(item?.product_name),
      externalName: text(item?.product_external_name),
      quantity: number(item?.quantity),
      unitPrice: number(item?.unit_price),
      lineTotal: number(item?.line_total),
    })),
    subtotal: number(raw?.pharmacy_items_subtotal),
    approvals: Array.isArray(raw?.checkout_pharmacy_approvals)
      ? raw.checkout_pharmacy_approvals : [],
    rawIn: raw ?? null,
    firstSeenAt: seenAt,
    lastSeenAt: seenAt,
  };
}

function approvalError(code, status) {
  const err = new Error(code);
  err.code = code;
  err.status = status;
  return err;
}

function clearOperationFields() {
  return {
    'operation.token': '',
    'operation.action': '',
    'operation.startedAt': null,
    'operation.actorType': '',
    'operation.actorTelegramId': null,
    'operation.actorName': '',
    'operation.comment': '',
    'operation.reconciliationRequired': false,
  };
}

function decisionFields(operation, action, at) {
  if (!operation || operation.action !== action) return {};
  return {
    'decision.action': action,
    'decision.actorType': text(operation.actorType),
    'decision.actorTelegramId': operation.actorTelegramId ?? null,
    'decision.actorName': text(operation.actorName),
    'decision.comment': text(operation.comment),
    'decision.at': at,
  };
}

function retryAt(at, attempts) {
  const delay = Math.min(
    NOTIFICATION_RETRY_BASE_MS * (2 ** Math.min(Math.max(attempts - 1, 0), 4)),
    NOTIFICATION_RETRY_MAX_MS
  );
  return new Date(at.getTime() + delay);
}

function createApprovalService({
  client,
  Model = MedicalkaApproval(),
  onNew = async () => {},
  onDecision = async () => {},
  now = () => new Date(),
  schedule = (job) => setImmediate(job),
} = {}) {
  let syncing = false;
  let notificationWorking = false;
  let notificationScheduled = false;

  async function settleFinalOperation(stored, at) {
    const operation = stored?.operation || {};
    if (!operation.action) return stored;
    const filter = {
      _id: stored._id,
      status: stored.status,
      'operation.action': operation.action,
    };
    if (operation.token) filter['operation.token'] = operation.token;
    const updated = await Model.findOneAndUpdate(filter, {
      $set: {
        ...clearOperationFields(),
        ...decisionFields(operation, stored.status, at),
      },
    }, { new: true }).lean();
    return updated || Model.findById(stored._id).lean();
  }

  async function announceIfNeeded(externalId) {
    const claimToken = randomUUID();
    const claimedAt = now();
    const staleAt = new Date(claimedAt.getTime() - NOTIFICATION_LEASE_MS);
    const claimed = await Model.findOneAndUpdate({
      externalId,
      status: 'pending',
      requiresAction: true,
      checkoutActive: true,
      'notification.notifiedAt': null,
      $and: [
        { $or: [
          { 'notification.claimToken': '' },
          { 'notification.claimToken': null },
          { 'notification.claimedAt': { $lte: staleAt } },
        ] },
        { $or: [
          { 'notification.retryAt': null },
          { 'notification.retryAt': { $lte: claimedAt } },
        ] },
      ],
    }, {
      $set: {
        'notification.claimToken': claimToken,
        'notification.claimedAt': claimedAt,
      },
    }, { new: true }).lean();
    if (!claimed) return false;

    try {
      const delivered = await onNew(claimed);
      // Legacy callbacks return undefined (or their own result) on success.
      if (delivered === false || delivered === null) {
        throw new Error('medicalka_telegram_not_delivered');
      }
      await Model.updateOne({
        externalId,
        'notification.claimToken': claimToken,
      }, {
        $set: {
          'notification.notifiedAt': now(),
          'notification.claimToken': '',
          'notification.claimedAt': null,
          'notification.retryAt': null,
          'notification.lastError': '',
        },
      });
      return true;
    } catch (err) {
      const current = await Model.findById(claimed._id).lean();
      const actionable = current?.status === 'pending'
        && current.requiresAction && current.checkoutActive;
      const attempts = Number(claimed.notification?.attempts || 0) + 1;
      await Model.updateOne({
        externalId,
        'notification.claimToken': claimToken,
      }, {
        $set: {
          'notification.claimToken': '',
          'notification.claimedAt': null,
          'notification.retryAt': actionable ? retryAt(now(), attempts) : null,
          'notification.lastError': actionable ? 'medicalka_telegram_announce_failed' : '',
        },
        $inc: { 'notification.attempts': actionable ? 1 : 0 },
      });
      if (!actionable) return false;
      throw err;
    }
  }

  async function drainNotificationsOnce() {
    if (notificationWorking) return { skipped: true };
    notificationWorking = true;
    try {
      const queuedAt = now();
      const announcements = await Model.find({
        status: 'pending',
        requiresAction: true,
        checkoutActive: true,
        'notification.notifiedAt': null,
        $or: [
          { 'notification.retryAt': null },
          { 'notification.retryAt': { $lte: queuedAt } },
        ],
      }).sort({ sourceCreatedAt: 1 }).limit(NOTIFICATION_BATCH_SIZE).lean();
      await Promise.allSettled(
        announcements.map((row) => announceIfNeeded(row.externalId))
      );

      const finalizations = await Model.find({
        'notification.messages': {
          $elemMatch: {
            finalizedAt: null,
            $or: [
              { finalizeRetryAt: null },
              { finalizeRetryAt: { $lte: queuedAt } },
            ],
          },
        },
        $or: [
          { status: { $in: [...FINAL_STATUSES] } },
          { requiresAction: false },
          { checkoutActive: false },
        ],
      }).sort({ updatedAt: 1 }).limit(NOTIFICATION_BATCH_SIZE).lean();
      await Promise.allSettled(finalizations.map((row) => onDecision(row)));
      return { announcements: announcements.length, finalizations: finalizations.length };
    } finally {
      notificationWorking = false;
    }
  }

  function scheduleNotifications() {
    if (notificationScheduled || notificationWorking) return;
    notificationScheduled = true;
    schedule(async () => {
      notificationScheduled = false;
      try { await drainNotificationsOnce(); } catch (_) { /* persisted work retries on next poll */ }
    });
  }

  async function upsertApproval(raw, { announce = true } = {}) {
    const seenAt = now();
    const normalized = normalizeApproval(raw, seenAt);
    const previous = await Model.findOne({ externalId: normalized.externalId }).lean();
    const { firstSeenAt, ...snapshot } = normalized;
    if (previous && FINAL_STATUSES.has(previous.status) && normalized.status === 'pending') {
      delete snapshot.status;
      delete snapshot.requiresAction;
    }
    if (FINAL_STATUSES.has(normalized.status)) {
      snapshot.requiresAction = false;
      snapshot['sync.lastError'] = '';
      snapshot['sync.lastSuccessAt'] = seenAt;
    }
    let stored = await Model.findOneAndUpdate({ externalId: normalized.externalId }, {
      $set: snapshot,
      $setOnInsert: { firstSeenAt },
    }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
    if (FINAL_STATUSES.has(stored.status) && stored.operation?.action) {
      stored = await settleFinalOperation(stored, seenAt);
    }
    if (announce && stored.status === 'pending' && stored.requiresAction && stored.checkoutActive) {
      scheduleNotifications();
    }
    const becameFinal = FINAL_STATUSES.has(stored.status)
      && (!previous || !FINAL_STATUSES.has(previous.status));
    const lostActionability = Boolean(
      previous?.status === 'pending'
      && previous.requiresAction
      && previous.checkoutActive
      && (stored.status !== 'pending' || !stored.requiresAction || !stored.checkoutActive)
    );
    if (becameFinal || lostActionability) scheduleNotifications();
    return stored;
  }

  async function pharmacyIds() {
    const pharmacies = await client.getPharmacies();
    const rows = Array.isArray(pharmacies)
      ? pharmacies
      : (Array.isArray(pharmacies?.items) ? pharmacies.items : []);
    return rows
      .map((row) => text(row?.id)).filter(Boolean);
  }

  async function eachApproval(ids, status, visit) {
    let offset = 0;
    let received = 0;
    const seen = new Set();
    const limit = 100;
    while (true) {
      const page = await client.listApprovals({
        pharmacyIds: ids, status, limit, offset,
      });
      const rows = Array.isArray(page?.items) ? page.items : [];
      for (const row of rows) {
        const id = text(row?.id);
        if (id) seen.add(id);
        await visit(row);
      }
      received += rows.length;
      offset += rows.length;
      const total = number(page?.total);
      if (!rows.length || rows.length < limit || (total && offset >= total)) break;
    }
    return { received, seen };
  }

  async function closeMissingPending(ids, seen) {
    const missing = await Model.find({
      pharmacyId: { $in: ids },
      status: 'pending',
      requiresAction: true,
      externalId: { $nin: [...seen] },
    }).lean();
    for (const row of missing) {
      const closed = await Model.findOneAndUpdate({
        _id: row._id,
        status: 'pending',
        requiresAction: true,
        'operation.token': { $in: ['', null] },
      }, {
        $set: {
          requiresAction: false,
          'sync.lastError': 'medicalka_approval_missing_from_pending',
        },
      }, { new: true }).lean();
      if (closed) {
        scheduleNotifications();
      }
    }
  }

  async function pollOnce() {
    if (syncing) return { skipped: true };
    syncing = true;
    try {
      const ids = await pharmacyIds();
      if (!ids.length) return { received: 0 };
      const page = await eachApproval(
        ids, 'pending', (row) => upsertApproval(row, { announce: true })
      );
      await closeMissingPending(ids, page.seen);
      scheduleNotifications();
      return { received: page.received };
    } finally {
      syncing = false;
    }
  }

  async function reconcileOnce() {
    if (syncing) return { skipped: true };
    syncing = true;
    try {
      const ids = await pharmacyIds();
      if (!ids.length) return { received: 0 };
      let received = 0;
      for (const status of HISTORY_STATUSES) {
        received += (await eachApproval(
          ids, status, (row) => upsertApproval(row, { announce: false })
        )).received;
      }
      scheduleNotifications();
      return { received };
    } finally {
      syncing = false;
    }
  }

  async function remoteFinal(externalId, pharmacyId) {
    for (const status of HISTORY_STATUSES) {
      let found = null;
      await eachApproval([pharmacyId], status, async (row) => {
        if (text(row?.id) === externalId) found = row;
      });
      if (found) return found;
    }
    return null;
  }

  async function markDecisionUncertain(claimed, token) {
    try {
      await Model.updateOne({
        _id: claimed._id,
        'operation.token': token,
      }, {
        $set: {
          'operation.token': '',
          'operation.startedAt': null,
          'operation.reconciliationRequired': true,
          'sync.lastError': 'medicalka_action_uncertain',
        },
      });
    } catch (_) { /* existing claim still prevents a blind retry */ }
    throw approvalError('medicalka_reconciliation_required', 409);
  }

  async function recoverDecision(claimed, token, action) {
    let remote = null;
    try { remote = await remoteFinal(claimed.externalId, claimed.pharmacyId); } catch (_) {}
    if (remote) {
      try {
        const reconciled = await upsertApproval(remote, { announce: false });
        if (reconciled.status === action) {
          return { approval: reconciled, idempotent: true, reconciled: true };
        }
        throw approvalError('medicalka_action_conflict', 409);
      } catch (err) {
        if (err?.code === 'medicalka_action_conflict') throw err;
      }
    }
    return markDecisionUncertain(claimed, token);
  }

  async function respond(externalId, {
    action,
    comment = '',
    actor = {},
  } = {}) {
    if (!['accepted', 'rejected'].includes(action)) {
      throw approvalError('medicalka_invalid_action', 422);
    }
    const cleanComment = text(comment).trim();
    if (cleanComment.length > 500) {
      throw approvalError('medicalka_comment_too_long', 422);
    }

    const current = await Model.findOne({ externalId }).lean();
    if (!current) throw approvalError('medicalka_approval_not_found', 404);
    if (current.status === action) {
      const approval = current.operation?.action
        ? await settleFinalOperation(current, now()) : current;
      return { approval, idempotent: true };
    }
    if (FINAL_STATUSES.has(current.status)) {
      throw approvalError('medicalka_action_conflict', 409);
    }
    if (!current.requiresAction || !current.checkoutActive) {
      throw approvalError('medicalka_approval_not_actionable', 409);
    }
    if (current.operation?.token) {
      const started = new Date(current.operation.startedAt).getTime();
      const stale = Number.isFinite(started) && started <= now().getTime() - OPERATION_LEASE_MS;
      if (stale) {
        let remote = null;
        try { remote = await remoteFinal(current.externalId, current.pharmacyId); } catch (_) {}
        if (remote) {
          const reconciled = await upsertApproval(remote, { announce: false });
          if (reconciled.status === action) {
            return { approval: reconciled, idempotent: true, reconciled: true };
          }
          throw approvalError('medicalka_action_conflict', 409);
        }
        await Model.updateOne({
          _id: current._id,
          'operation.token': current.operation.token,
        }, {
          $set: {
            'operation.token': '',
            'operation.startedAt': null,
            'operation.reconciliationRequired': true,
            'sync.lastError': 'medicalka_action_uncertain',
          },
        });
        throw approvalError('medicalka_reconciliation_required', 409);
      }
      throw approvalError('medicalka_action_in_progress', 409);
    }
    if (current.operation?.reconciliationRequired) {
      throw approvalError('medicalka_reconciliation_required', 409);
    }

    const token = randomUUID();
    const startedAt = now();
    const claimed = await Model.findOneAndUpdate({
      _id: current._id,
      status: current.status,
      requiresAction: true,
      checkoutActive: true,
      'operation.token': '',
      'operation.reconciliationRequired': { $ne: true },
    }, {
      $set: {
        'operation.token': token,
        'operation.action': action,
        'operation.startedAt': startedAt,
        'operation.actorType': text(actor?.type),
        'operation.actorTelegramId': actor?.telegramId ?? null,
        'operation.actorName': text(actor?.name),
        'operation.comment': cleanComment,
      },
    }, { new: true }).lean();

    if (!claimed) {
      const latest = await Model.findOne({ externalId }).lean();
      if (latest?.status === action) return { approval: latest, idempotent: true };
      if (latest?.operation?.token) throw approvalError('medicalka_action_in_progress', 409);
      if (!latest?.requiresAction || !latest?.checkoutActive) {
        throw approvalError('medicalka_approval_not_actionable', 409);
      }
      throw approvalError('medicalka_action_conflict', 409);
    }

    try {
      await client.respondToApproval({
        checkoutId: claimed.checkoutId,
        pharmacyId: claimed.pharmacyId,
        action,
        comment: cleanComment,
      });
    } catch (err) {
      if (err?.retrySafe !== true) return recoverDecision(claimed, token, action);
      await Model.updateOne({
        _id: claimed._id,
        'operation.token': token,
      }, {
        $set: {
          ...clearOperationFields(),
          'sync.lastError': text(err?.code) || 'medicalka_partner_error',
        },
      });
      throw err;
    }

    const decidedAt = now();
    let approval;
    try {
      approval = await Model.findOneAndUpdate({
        _id: claimed._id,
        'operation.token': token,
      }, {
        $set: {
          status: action,
          requiresAction: false,
          ...decisionFields(claimed.operation, action, decidedAt),
          ...clearOperationFields(),
          'sync.lastError': '',
          'sync.lastSuccessAt': decidedAt,
        },
      }, { new: true }).lean();
    } catch (_) {
      return recoverDecision(claimed, token, action);
    }
    if (!approval) {
      const latest = await Model.findOne({ externalId }).lean();
      if (latest?.status === action) {
        return { approval: latest, idempotent: true, reconciled: true };
      }
      return recoverDecision(claimed, token, action);
    }
    scheduleNotifications();
    return { approval, idempotent: false };
  }

  return { drainNotificationsOnce, pollOnce, reconcileOnce, respond };
}

module.exports = { createApprovalService, normalizeApproval };
