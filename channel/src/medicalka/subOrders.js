const { createHash, randomUUID } = require('node:crypto');
const BillzProduct = require('../models/BillzProduct');
const ChannelOrder = require('../models/ChannelOrder');
const MedicalkaSubOrder = require('../models/MedicalkaSubOrder');
const orders = require('../core/orders');

const OPERATION_LEASE_MS = 60 * 1000;
const REFUND_STATUSES = new Set(['cancelled', 'rejected', 'refunded', 'failed', 'returned']);
const ACTIVE_STATUSES = ['processing', 'shipped'];
const OPEN_STATUSES = ['pending', 'waiting_payment', ...ACTIVE_STATUSES];
const TERMINAL_STATUSES = ['delivered', ...REFUND_STATUSES, 'completed'];
const POLL_STATUSES = [
  ...OPEN_STATUSES, ...TERMINAL_STATUSES,
];

function text(value) {
  return value === null || value === undefined ? '' : String(value);
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sourceProductId(item) {
  const candidates = [
    item?.product_external_id,
    item?.external_product_id,
    item?.product?.external_id,
    item?.product?.external_product_id,
    item?.stock?.product_external_id,
    item?.product_id,
  ];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isSafeInteger(value) && value > 0) return value;
  }
  return null;
}

function normalizeSubOrder(raw, seenAt = new Date()) {
  const created = new Date(raw?.created_at);
  return {
    externalId: text(raw?.id),
    orderId: text(raw?.order_id),
    orderNumber: text(raw?.order_number),
    subOrderNumber: text(raw?.sub_order_number),
    pharmacyId: text(raw?.pharmacy_id),
    pharmacyName: text(raw?.pharmacy_name),
    paymentStatus: text(raw?.payment_status),
    paymentMethod: text(raw?.payment_method),
    status: text(raw?.status),
    deliveryType: text(raw?.delivery_type),
    subtotal: number(raw?.subtotal),
    sourceCreatedAt: Number.isNaN(created.getTime()) ? seenAt : created,
    customer: {
      firstName: text(raw?.customer_first_name),
      lastName: text(raw?.customer_last_name),
      phone: text(raw?.customer_phone),
    },
    items: (Array.isArray(raw?.items) ? raw.items : [])
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        itemId: text(item?.id || item?.item_id || item?.product?.id),
        productExternalId: sourceProductId(item),
        productId: text(item?.product_id),
        name: text(item?.product_name || item?.name || item?.product?.name),
        quantity: number(item?.quantity),
        unitPrice: number(item?.unit_price || item?.price),
        lineTotal: number(item?.line_total),
        markingRequired: Boolean(item?.is_marking_required),
        labels: Array.isArray(item?.labels) ? item.labels : [],
      })),
    rawIn: raw ?? null,
    firstSeenAt: seenAt,
    lastSeenAt: seenAt,
  };
}

function subOrderError(code, status = 422) {
  const err = new Error(code);
  err.code = code;
  err.status = status;
  return err;
}

function actionFields(kind, value, actor, at) {
  return {
    'lastAction.kind': kind,
    'lastAction.value': text(value),
    'lastAction.actorType': text(actor?.type),
    'lastAction.actorTelegramId': actor?.telegramId ?? null,
    'lastAction.actorName': text(actor?.name),
    'lastAction.at': at,
  };
}

function clearOperationFields() {
  return {
    'operation.token': '',
    'operation.kind': '',
    'operation.value': '',
    'operation.itemId': '',
    'operation.valueHash': '',
    'operation.startedAt': null,
    'operation.actorType': '',
    'operation.actorTelegramId': null,
    'operation.actorName': '',
    'operation.reconciliationRequired': false,
    'operation.lastError': '',
  };
}

function pharmacyRows(payload) {
  return Array.isArray(payload) ? payload : (Array.isArray(payload?.items) ? payload.items : []);
}

function labelValue(label) {
  if (typeof label === 'string') return label;
  if (!label || typeof label !== 'object') return '';
  return text(label.label ?? label.value ?? label.code ?? label.raw);
}

function labelHash(value) {
  return createHash('sha256').update(text(value)).digest('hex');
}

function operationApplied(row, operation) {
  if (!row || !operation?.kind) return false;
  if (operation.kind === 'status') return row.status === operation.value;
  if (operation.kind === 'cancel') return REFUND_STATUSES.has(row.status);
  if (operation.kind !== 'label' || !operation.valueHash) return false;
  return (row.items || []).some((item) => (
    (!operation.itemId || item.itemId === operation.itemId)
    && (item.labels || []).some((label) => labelHash(labelValue(label)) === operation.valueHash)
  ));
}

function operationActor(operation) {
  return {
    type: operation?.actorType,
    telegramId: operation?.actorTelegramId,
    name: operation?.actorName,
  };
}

function createSubOrderService({
  client,
  Model = MedicalkaSubOrder(),
  ProductModel = BillzProduct(),
  ChannelOrderModel = ChannelOrder(),
  orderService = orders,
  now = () => new Date(),
  historyPollMs = 5 * 60 * 1000,
  historyWindowDays = 180,
} = {}) {
  let polling = false;
  let nextHistoryPollAt = 0;
  const historyInterval = Math.max(60000, Number(historyPollMs) || 300000);
  const historyDays = Math.max(1, Number(historyWindowDays) || 180);

  async function settleAppliedOperation(row, operation) {
    const actedAt = now();
    const auditValue = operation.kind === 'label' ? operation.itemId : operation.value;
    const filter = { _id: row._id };
    if (operation.token) filter['operation.token'] = operation.token;
    const updated = await Model.findOneAndUpdate(filter, {
      $set: {
        ...clearOperationFields(),
        ...actionFields(operation.kind, auditValue, operationActor(operation), actedAt),
      },
    }, { new: true }).lean();
    return updated || Model.findById(row._id).lean();
  }

  async function markOperationUncertain(row, operation, code) {
    const filter = { _id: row._id };
    const token = row.operation?.token || operation.token;
    if (token) filter['operation.token'] = token;
    const updated = await Model.findOneAndUpdate(filter, {
      $set: {
        'operation.token': '',
        'operation.reconciliationRequired': true,
        'operation.lastError': code,
        'operation.kind': operation.kind,
        'operation.value': operation.value || '',
        'operation.itemId': operation.itemId || '',
        'operation.valueHash': operation.valueHash || '',
      },
    }, { new: true }).lean();
    return updated || Model.findById(row._id).lean();
  }

  async function storeSnapshot(raw) {
    const normalized = normalizeSubOrder(raw, now());
    if (!normalized.externalId) throw subOrderError('medicalka_invalid_suborder', 502);
    const { firstSeenAt, ...snapshot } = normalized;
    let stored = await Model.findOneAndUpdate({ externalId: normalized.externalId }, {
      $set: snapshot,
      $setOnInsert: { firstSeenAt },
    }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();

    if (stored.sale?.state === 'sold' && REFUND_STATUSES.has(stored.status)) {
      stored = await Model.findOneAndUpdate({ _id: stored._id }, {
        $set: {
          'sale.reconciliationRequired': true,
          'sale.lastError': 'medicalka_billz_refund_required',
        },
      }, { new: true }).lean();
    }

    const operation = stored.operation || {};
    if (operation.kind && operationApplied(stored, operation)) {
      return settleAppliedOperation(stored, operation);
    }
    const started = new Date(operation.startedAt).getTime();
    if (
      operation.token
      && Number.isFinite(started)
      && started <= now().getTime() - OPERATION_LEASE_MS
    ) {
      return markOperationUncertain(
        stored, operation, 'medicalka_suborder_action_uncertain'
      );
    }
    return stored;
  }

  async function fullPayload(raw) {
    const normalized = normalizeSubOrder(raw, now());
    if (typeof client.getSubOrder !== 'function' || !normalized.externalId) return raw;
    return client.getSubOrder(normalized.externalId);
  }

  async function refreshStored(externalId) {
    if (typeof client.getSubOrder !== 'function') {
      return Model.findOne({ externalId }).lean();
    }
    return storeSnapshot(await client.getSubOrder(externalId));
  }

  async function reconcileSaleProjection(stored) {
    if (stored.paymentStatus !== 'paid') return stored;
    const channelOrder = await ChannelOrderModel.findOne(
      stored.sale?.channelOrderId
        ? { internalOrderId: stored.sale.channelOrderId, channel: 'medicalka' }
        : { channel: 'medicalka', externalId: stored.externalId }
    ).lean();
    if (!channelOrder) return stored;

    const billzUncertain = Boolean(channelOrder.billz?.reconciliationRequired);
    const sold = channelOrder.status === 'sold';
    const refundRequired = sold && REFUND_STATUSES.has(stored.status);
    const fields = {
      'sale.channelOrderId': channelOrder.internalOrderId,
      ...(sold ? {
        'sale.state': 'sold',
        'sale.reconciliationRequired': refundRequired,
        'sale.lastError': refundRequired ? 'medicalka_billz_refund_required' : '',
      } : {}),
      ...(billzUncertain ? {
        'sale.state': 'failed',
        'sale.reconciliationRequired': true,
        'sale.lastError': 'medicalka_billz_reconciliation_required',
      } : {}),
    };
    return Model.findOneAndUpdate({ _id: stored._id }, {
      $set: fields,
    }, { new: true }).lean();
  }

  async function ingest(input) {
    const raw = await fullPayload(input);
    let stored = await storeSnapshot(raw);
    stored = await reconcileSaleProjection(stored);
    if (stored.sale?.state === 'sold') return stored;
    if (stored.sale?.reconciliationRequired || stored.operation?.reconciliationRequired) return stored;
    if (!ACTIVE_STATUSES.includes(stored.status)) {
      if (stored.paymentStatus !== 'paid') {
        return Model.findOneAndUpdate({ _id: stored._id }, {
          $set: { 'sale.state': 'waiting_payment', 'sale.lastError': '' },
        }, { new: true }).lean();
      }
      return stored;
    }
    if (stored.paymentStatus !== 'paid') {
      return Model.findOneAndUpdate({ _id: stored._id }, {
        $set: { 'sale.state': 'waiting_payment', 'sale.lastError': '' },
      }, { new: true }).lean();
    }

    const wanted = [...new Set(stored.items.map((item) => item.productExternalId).filter(Boolean))];
    const mirrors = wanted.length
      ? await ProductModel.find({ medicalkaId: { $in: wanted } }).lean()
      : [];
    const byId = new Map(mirrors.map((row) => [Number(row.medicalkaId), row]));
    const missing = [...new Set(stored.items
      .filter((item) => !item.productExternalId || !byId.has(Number(item.productExternalId)))
      .map((item) => text(item.productExternalId || item.productId || 'unknown')))];
    if (missing.length) {
      return Model.findOneAndUpdate({ _id: stored._id }, {
        $set: {
          'mapping.state': 'reconciliation_required',
          'mapping.missingProductIds': missing,
          'sale.state': 'blocked',
          'sale.reconciliationRequired': false,
          'sale.lastError': 'medicalka_product_mapping_missing',
        },
      }, { new: true }).lean();
    }

    const mappedItems = stored.items.map((item) => {
      const mirror = byId.get(Number(item.productExternalId));
      return {
        billzProductId: mirror.billzProductId,
        name: item.name || mirror.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      };
    });
    stored = await Model.findOneAndUpdate({ _id: stored._id }, {
      $set: {
        'mapping.state': 'ready',
        'mapping.missingProductIds': [],
        'sale.reconciliationRequired': false,
      },
    }, { new: true }).lean();

    try {
      const accepted = await orderService.acceptOrder('medicalka', {
        externalId: stored.externalId,
        items: mappedItems,
        totalAmount: stored.subtotal,
        customer: {
          name: [stored.customer?.firstName, stored.customer?.lastName].filter(Boolean).join(' '),
          phone: stored.customer?.phone || '',
          address: '',
        },
        raw,
      });
      stored = await Model.findOneAndUpdate({ _id: stored._id }, {
        $set: {
          'sale.state': 'processing',
          'sale.channelOrderId': accepted.order.internalOrderId,
          'sale.lastError': '',
          'sale.reconciliationRequired': false,
        },
      }, { new: true }).lean();
      const outcome = await orderService.completeIncomingSale(accepted.order.internalOrderId);
      const state = outcome?.kind === 'sold' ? 'sold' : text(outcome?.kind) || 'failed';
      return Model.findOneAndUpdate({ _id: stored._id }, {
        $set: {
          'sale.state': state,
          'sale.channelOrderId': accepted.order.internalOrderId,
          'sale.lastError': state === 'sold' ? '' : `medicalka_sale_${state}`,
          'sale.reconciliationRequired': state === 'temporary_failure',
        },
      }, { new: true }).lean();
    } catch (err) {
      return Model.findOneAndUpdate({ _id: stored._id }, {
        $set: {
          'sale.state': 'failed',
          'sale.lastError': text(err?.code) || 'medicalka_sale_failed',
          'sale.reconciliationRequired': true,
        },
      }, { new: true }).lean();
    }
  }

  async function pollOnce() {
    if (polling) return { skipped: true };
    polling = true;
    try {
      const ids = pharmacyRows(await client.getPharmacies())
        .map((row) => text(row?.id)).filter(Boolean);
      if (!ids.length) return { received: 0 };
      let received = 0;
      const pageSize = 100;
      const seen = new Set();
      const polledAt = now();
      const includeHistory = polledAt.getTime() >= nextHistoryPollAt;
      const historyDate = new Date(
        polledAt.getTime() - (historyDays * 24 * 60 * 60 * 1000)
      )
        .toISOString().slice(0, 10);
      const statuses = includeHistory ? POLL_STATUSES : OPEN_STATUSES;
      for (const status of statuses) {
        let page = 1;
        let statusReceived = 0;
        while (true) {
          const response = await client.listSubOrders({
            pharmacyIds: ids, status, page, page_size: pageSize,
            ...(TERMINAL_STATUSES.includes(status) ? { date_from: historyDate } : {}),
          });
          const rows = Array.isArray(response?.items) ? response.items : [];
          const rowIds = rows.map((row) => text(row?.id)).filter(Boolean);
          const existingRows = rowIds.length
            ? await Model.find({ externalId: { $in: rowIds } })
              .select({ externalId: 1, paymentStatus: 1, status: 1, sale: 1 }).lean()
            : [];
          const existingById = new Map(existingRows.map((row) => [row.externalId, row]));
          for (const row of rows) {
            const externalId = text(row?.id);
            if (externalId) seen.add(externalId);
            const existing = existingById.get(externalId);
            if (
              existing?.status === status
              && !OPEN_STATUSES.includes(status)
            ) {
              let current = existing;
              const projectionNeedsRepair = existing.paymentStatus === 'paid' && (
                existing.sale?.state !== 'sold'
                || (
                  REFUND_STATUSES.has(status)
                  && !existing.sale?.reconciliationRequired
                )
              );
              if (projectionNeedsRepair) {
                current = await reconcileSaleProjection(existing);
              }
              if (
                REFUND_STATUSES.has(status)
                && current?.sale?.state === 'sold'
                && !current.sale.reconciliationRequired
              ) {
                await Model.updateOne({ _id: current._id }, {
                  $set: {
                    'sale.reconciliationRequired': true,
                    'sale.lastError': 'medicalka_billz_refund_required',
                  },
                });
              }
              continue;
            }
            await ingest(row);
          }
          received += rows.length;
          statusReceived += rows.length;
          const total = number(response?.total);
          if (
            !rows.length
            || rows.length < pageSize
            || (total && statusReceived >= total)
          ) break;
          page += 1;
        }
      }

      const missingActive = await Model.find({
        status: { $in: ACTIVE_STATUSES },
        externalId: { $nin: [...seen] },
      }).select({ externalId: 1 }).lean();
      for (const row of missingActive) {
        await ingest({ id: row.externalId });
      }
      if (includeHistory) nextHistoryPollAt = polledAt.getTime() + historyInterval;
      return { received };
    } finally {
      polling = false;
    }
  }

  async function claimAction(stored, operation, actor) {
    if (stored.operation?.reconciliationRequired) {
      throw subOrderError('medicalka_suborder_reconciliation_required', 409);
    }
    if (stored.operation?.token) {
      throw subOrderError('medicalka_suborder_action_in_progress', 409);
    }
    const token = randomUUID();
    const claimed = await Model.findOneAndUpdate({
      _id: stored._id,
      status: stored.status,
      'operation.token': { $in: ['', null] },
      'operation.reconciliationRequired': { $ne: true },
    }, {
      $set: {
        'operation.token': token,
        'operation.kind': operation.kind,
        'operation.value': operation.value || '',
        'operation.itemId': operation.itemId || '',
        'operation.valueHash': operation.valueHash || '',
        'operation.startedAt': now(),
        'operation.actorType': text(actor?.type),
        'operation.actorTelegramId': actor?.telegramId ?? null,
        'operation.actorName': text(actor?.name),
        'operation.reconciliationRequired': false,
        'operation.lastError': '',
      },
    }, { new: true }).lean();
    if (!claimed) throw subOrderError('medicalka_suborder_action_in_progress', 409);
    return { claimed, token };
  }

  async function completeAction(claimed, token, operation, actor, fields = {}) {
    const actedAt = now();
    const auditValue = operation.kind === 'label' ? operation.itemId : operation.value;
    const updated = await Model.findOneAndUpdate({
      _id: claimed._id,
      'operation.token': token,
    }, {
      $set: {
        ...fields,
        ...clearOperationFields(),
        ...actionFields(operation.kind, auditValue, actor, actedAt),
        lastSeenAt: actedAt,
      },
    }, { new: true }).lean();
    if (!updated) throw subOrderError('medicalka_suborder_action_conflict', 409);
    return updated;
  }

  async function reconcileActionOutcome(claimed, operation) {
    try {
      const refreshed = await refreshStored(claimed.externalId);
      if (operationApplied(refreshed, operation)) {
        if (!refreshed.operation?.token) return refreshed;
        return settleAppliedOperation(refreshed, refreshed.operation);
      }
    } catch (_) { /* unknown write outcome stays fenced */ }
    await markOperationUncertain(
      claimed, operation, 'medicalka_suborder_action_uncertain'
    );
    throw subOrderError('medicalka_suborder_reconciliation_required', 409);
  }

  async function handleRemoteActionFailure(claimed, token, operation, err) {
    if (err?.retrySafe === true) {
      await Model.updateOne({ _id: claimed._id, 'operation.token': token }, {
        $set: {
          ...clearOperationFields(),
          'operation.lastError': text(err?.code) || 'medicalka_suborder_action_failed',
        },
      });
      throw err;
    }
    return reconcileActionOutcome(claimed, operation);
  }

  async function transition(externalId, status, actor = {}) {
    const stored = await refreshStored(externalId);
    if (!stored) throw subOrderError('medicalka_suborder_not_found', 404);
    if (stored.status === status) return stored;
    if (stored.deliveryType === 'delivery' && status === 'delivered') {
      throw subOrderError('medicalka_delivery_delivered_forbidden');
    }
    const allowed = stored.deliveryType === 'pickup'
      ? {
        processing: ['shipped', 'delivered', 'completed'],
        shipped: ['delivered', 'completed'],
        delivered: ['completed'],
      }
      : { processing: ['shipped'] };
    if (!(allowed[stored.status] || []).includes(status)) {
      throw subOrderError('medicalka_invalid_suborder_transition');
    }
    if (
      stored.deliveryType === 'delivery' && status === 'shipped'
      && stored.items.some((item) => (
        item.markingRequired && (item.labels?.length || 0) < Number(item.quantity)
      ))
    ) throw subOrderError('medicalka_labels_incomplete', 409);

    const operation = { kind: 'status', value: status };
    const { claimed, token } = await claimAction(stored, operation, actor);
    try {
      await client.updateSubOrderStatus(stored.externalId, status);
    } catch (err) {
      return handleRemoteActionFailure(claimed, token, operation, err);
    }
    try {
      return await completeAction(claimed, token, operation, actor, { status });
    } catch (_) {
      return reconcileActionOutcome(claimed, operation);
    }
  }

  async function addLabel(externalId, { itemId, label, actor = {} }) {
    const stored = await refreshStored(externalId);
    if (!stored) throw subOrderError('medicalka_suborder_not_found', 404);
    if (stored.deliveryType !== 'delivery') throw subOrderError('medicalka_labels_pickup_forbidden');
    const value = text(label);
    if (value.length < 21 || value.length > 500) throw subOrderError('medicalka_invalid_label');
    if (itemId && !stored.items.some((item) => item.itemId === itemId)) {
      throw subOrderError('medicalka_suborder_item_not_found', 404);
    }
    const valueHash = labelHash(value);
    const operation = { kind: 'label', itemId: text(itemId), valueHash };
    if (operationApplied(stored, operation)) return stored;

    const { claimed, token } = await claimAction(stored, operation, actor);
    let result;
    try {
      result = await client.addFiscalLabel(stored.externalId, { itemId, label: value });
    } catch (err) {
      return handleRemoteActionFailure(claimed, token, operation, err);
    }
    const items = Array.isArray(result?.items)
      ? normalizeSubOrder({ ...stored.rawIn, items: result.items }, now()).items
      : stored.items;
    try {
      return await completeAction(claimed, token, operation, actor, { items });
    } catch (_) {
      return reconcileActionOutcome(claimed, operation);
    }
  }

  async function cancel(externalId, reason, actor = {}) {
    const stored = await refreshStored(externalId);
    if (!stored) throw subOrderError('medicalka_suborder_not_found', 404);
    const cleanReason = text(reason).trim();
    if (REFUND_STATUSES.has(stored.status)) return stored;
    if (stored.status !== 'processing') throw subOrderError('medicalka_cancel_status_conflict', 409);
    if (!cleanReason || cleanReason.length > 500) throw subOrderError('medicalka_invalid_cancel_reason');

    const operation = { kind: 'cancel', value: cleanReason };
    const { claimed, token } = await claimAction(stored, operation, actor);
    try {
      await client.cancelSubOrder(stored.externalId, cleanReason);
    } catch (err) {
      return handleRemoteActionFailure(claimed, token, operation, err);
    }
    const sold = claimed.sale?.state === 'sold';
    try {
      return await completeAction(claimed, token, operation, actor, {
        status: 'cancelled',
        ...(sold ? {
          'sale.reconciliationRequired': true,
          'sale.lastError': 'medicalka_billz_refund_required',
        } : {}),
      });
    } catch (_) {
      return reconcileActionOutcome(claimed, operation);
    }
  }

  return { addLabel, cancel, ingest, pollOnce, transition };
}

module.exports = { createSubOrderService, normalizeSubOrder, sourceProductId };
