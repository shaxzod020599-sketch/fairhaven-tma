const BillzProduct = require('../models/BillzProduct');
const MedicalkaSubOrder = require('../models/MedicalkaSubOrder');
const orders = require('../core/orders');

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
        itemId: text(item?.id || item?.item_id),
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

function pharmacyRows(payload) {
  return Array.isArray(payload) ? payload : (Array.isArray(payload?.items) ? payload.items : []);
}

function createSubOrderService({
  client,
  Model = MedicalkaSubOrder(),
  ProductModel = BillzProduct(),
  orderService = orders,
  now = () => new Date(),
} = {}) {
  let polling = false;

  async function storeSnapshot(raw) {
    const normalized = normalizeSubOrder(raw, now());
    const { firstSeenAt, ...snapshot } = normalized;
    return Model.findOneAndUpdate({ externalId: normalized.externalId }, {
      $set: snapshot,
      $setOnInsert: { firstSeenAt },
    }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
  }

  async function fullPayload(raw) {
    const normalized = normalizeSubOrder(raw, now());
    if (normalized.items.length && normalized.items.every((item) => item.quantity > 0)) return raw;
    if (typeof client.getSubOrder !== 'function') return raw;
    return client.getSubOrder(normalized.externalId);
  }

  async function ingest(input) {
    const raw = await fullPayload(input);
    let stored = await storeSnapshot(raw);
    if (stored.sale?.state === 'sold') return stored;
    if (stored.sale?.reconciliationRequired) return stored;
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
      let page = 1;
      let received = 0;
      const pageSize = 100;
      while (true) {
        const response = await client.listSubOrders({
          pharmacyIds: ids, status: 'processing', page, page_size: pageSize,
        });
        const rows = Array.isArray(response?.items) ? response.items : [];
        for (const row of rows) await ingest(row);
        received += rows.length;
        if (!rows.length || rows.length < pageSize || received >= number(response?.total)) break;
        page += 1;
      }
      return { received };
    } finally {
      polling = false;
    }
  }

  async function transition(externalId, status, actor = {}) {
    const stored = await Model.findOne({ externalId }).lean();
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

    await client.updateSubOrderStatus(stored.externalId, status);
    const actedAt = now();
    await Model.updateOne({ _id: stored._id }, {
      $set: { status, lastSeenAt: actedAt, ...actionFields('status', status, actor, actedAt) },
    });
    return Model.findById(stored._id).lean();
  }

  async function addLabel(externalId, { itemId, label, actor = {} }) {
    const stored = await Model.findOne({ externalId }).lean();
    if (!stored) throw subOrderError('medicalka_suborder_not_found', 404);
    if (stored.deliveryType !== 'delivery') throw subOrderError('medicalka_labels_pickup_forbidden');
    const value = text(label);
    if (value.length < 21 || value.length > 500) throw subOrderError('medicalka_invalid_label');
    if (itemId && !stored.items.some((item) => item.itemId === itemId)) {
      throw subOrderError('medicalka_suborder_item_not_found', 404);
    }
    const result = await client.addFiscalLabel(stored.externalId, { itemId, label: value });
    const items = Array.isArray(result?.items)
      ? normalizeSubOrder({ ...stored.rawIn, items: result.items }, now()).items
      : stored.items;
    const actedAt = now();
    await Model.updateOne({ _id: stored._id }, {
      $set: {
        items,
        lastSeenAt: actedAt,
        ...actionFields('label', itemId, actor, actedAt),
      },
    });
    return Model.findById(stored._id).lean();
  }

  async function cancel(externalId, reason, actor = {}) {
    const stored = await Model.findOne({ externalId }).lean();
    if (!stored) throw subOrderError('medicalka_suborder_not_found', 404);
    const cleanReason = text(reason).trim();
    if (stored.status !== 'processing') throw subOrderError('medicalka_cancel_status_conflict', 409);
    if (!cleanReason || cleanReason.length > 500) throw subOrderError('medicalka_invalid_cancel_reason');
    await client.cancelSubOrder(stored.externalId, cleanReason);
    const sold = stored.sale?.state === 'sold';
    const actedAt = now();
    return Model.findOneAndUpdate({ _id: stored._id }, {
      $set: {
        status: 'cancelled',
        lastSeenAt: actedAt,
        ...actionFields('cancel', cleanReason, actor, actedAt),
        ...(sold ? {
          'sale.reconciliationRequired': true,
          'sale.lastError': 'medicalka_billz_refund_required',
        } : {}),
      },
    }, { new: true }).lean();
  }

  return { addLabel, cancel, ingest, pollOnce, transition };
}

module.exports = { createSubOrderService, normalizeSubOrder, sourceProductId };
