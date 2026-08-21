const { randomUUID } = require('node:crypto');
const MedicalkaApproval = require('../models/MedicalkaApproval');

const FINAL_STATUSES = new Set(['accepted', 'rejected']);
const NOTIFICATION_LEASE_MS = 60 * 1000;

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

function createApprovalService({
  client,
  Model = MedicalkaApproval(),
  onNew = async () => {},
  onDecision = async () => {},
  now = () => new Date(),
} = {}) {
  let polling = false;

  async function announceIfNeeded(externalId) {
    const claimToken = randomUUID();
    const claimedAt = now();
    const staleAt = new Date(claimedAt.getTime() - NOTIFICATION_LEASE_MS);
    const claimed = await Model.findOneAndUpdate({
      externalId,
      'notification.notifiedAt': null,
      $or: [
        { 'notification.claimToken': '' },
        { 'notification.claimedAt': { $lte: staleAt } },
      ],
    }, {
      $set: {
        'notification.claimToken': claimToken,
        'notification.claimedAt': claimedAt,
      },
    }, { new: true }).lean();
    if (!claimed) return false;

    try {
      await onNew(claimed);
      await Model.updateOne({
        externalId,
        'notification.claimToken': claimToken,
      }, {
        $set: {
          'notification.notifiedAt': now(),
          'notification.claimToken': '',
          'notification.claimedAt': null,
        },
      });
      return true;
    } catch (err) {
      await Model.updateOne({
        externalId,
        'notification.claimToken': claimToken,
      }, {
        $set: {
          'notification.claimToken': '',
          'notification.claimedAt': null,
        },
      });
      throw err;
    }
  }

  async function upsertApproval(raw) {
    const seenAt = now();
    const normalized = normalizeApproval(raw, seenAt);
    const { firstSeenAt, ...snapshot } = normalized;
    await Model.findOneAndUpdate({ externalId: normalized.externalId }, {
      $set: snapshot,
      $setOnInsert: { firstSeenAt },
    }, { upsert: true, new: true, setDefaultsOnInsert: true });
    await announceIfNeeded(normalized.externalId);
  }

  async function pollOnce() {
    if (polling) return { skipped: true };
    polling = true;
    try {
      const pharmacies = await client.getPharmacies();
      const pharmacyIds = (Array.isArray(pharmacies?.items) ? pharmacies.items : [])
        .map((row) => text(row?.id)).filter(Boolean);
      if (!pharmacyIds.length) return { received: 0 };

      let offset = 0;
      let received = 0;
      const limit = 100;
      while (true) {
        const page = await client.listApprovals({
          pharmacyIds, status: 'pending', limit, offset,
        });
        const rows = Array.isArray(page?.items) ? page.items : [];
        for (const row of rows) await upsertApproval(row);
        received += rows.length;
        offset += rows.length;
        const total = number(page?.total);
        if (!rows.length || rows.length < limit || (total && offset >= total)) break;
      }
      return { received };
    } finally {
      polling = false;
    }
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
    if (current.status === action) return { approval: current, idempotent: true };
    if (FINAL_STATUSES.has(current.status)) {
      throw approvalError('medicalka_action_conflict', 409);
    }
    if (current.operation?.token) {
      throw approvalError('medicalka_action_in_progress', 409);
    }

    const token = randomUUID();
    const startedAt = now();
    const claimed = await Model.findOneAndUpdate({
      _id: current._id,
      status: current.status,
      'operation.token': '',
    }, {
      $set: {
        'operation.token': token,
        'operation.action': action,
        'operation.startedAt': startedAt,
      },
    }, { new: true }).lean();

    if (!claimed) {
      const latest = await Model.findOne({ externalId }).lean();
      if (latest?.status === action) return { approval: latest, idempotent: true };
      if (latest?.operation?.token) throw approvalError('medicalka_action_in_progress', 409);
      throw approvalError('medicalka_action_conflict', 409);
    }

    try {
      await client.respondToApproval({
        checkoutId: claimed.checkoutId,
        pharmacyId: claimed.pharmacyId,
        action,
        comment: cleanComment,
      });
      const decidedAt = now();
      const approval = await Model.findOneAndUpdate({
        _id: claimed._id,
        'operation.token': token,
      }, {
        $set: {
          status: action,
          requiresAction: false,
          'decision.action': action,
          'decision.actorType': text(actor?.type),
          'decision.actorTelegramId': actor?.telegramId ?? null,
          'decision.actorName': text(actor?.name),
          'decision.comment': cleanComment,
          'decision.at': decidedAt,
          'operation.token': '',
          'operation.action': '',
          'operation.startedAt': null,
          'sync.lastError': '',
          'sync.lastSuccessAt': decidedAt,
        },
      }, { new: true }).lean();
      try { await onDecision(approval); } catch (_) { /* decision already committed upstream */ }
      return { approval, idempotent: false };
    } catch (err) {
      await Model.updateOne({
        _id: claimed._id,
        'operation.token': token,
      }, {
        $set: {
          'operation.token': '',
          'operation.action': '',
          'operation.startedAt': null,
          'sync.lastError': text(err?.code) || 'medicalka_partner_error',
        },
      });
      throw err;
    }
  }

  return { pollOnce, respond };
}

module.exports = { createApprovalService, normalizeApproval };
