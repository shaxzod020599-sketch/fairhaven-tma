const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const ChannelOrder = require('../models/ChannelOrder');
const contract = require('../adapters/yandex/contract');

// Yandex may omit items[].name; staff then need our own product name on the
// Telegram card and in the panel, not a Billz id. Best effort: receipt never fails on it.
async function catalogNames(items) {
  const catalog = require('../core/catalog');
  const names = new Map();
  for (const { id, name } of items) {
    if (name || names.has(id)) continue;
    try {
      const entry = await catalog.findForChannel('yandex', id);
      names.set(id, String(entry?.card?.name || entry?.card?.nameUz || entry?.mirror?.name || '').trim().slice(0, 300));
    } catch (_) { names.set(id, ''); }
  }
  return names;
}

async function receive(body, placeId) {
  const Model = ChannelOrder();
  // Unique indexes must exist before concurrent first receipts can be accepted.
  await Model.init();
  const filter = { channel: 'yandex', externalId: body.eatsId };
  const snapshot = contract.snapshot(body, placeId);
  let record = await Model.findOne(filter).lean();
  if (!record) {
    const names = await catalogNames(body.items);
    try {
      const now = new Date();
      record = await Model.findOneAndUpdate(filter, { $setOnInsert: {
        ...filter, internalOrderId: randomUUID(), status: 'received',
        // Mixed values go directly through the update path: document.save()
        // minimizes empty optional objects and would change retry identity.
        rawIn: JSON.parse(JSON.stringify(body)), 'yandex.requestSnapshot': snapshot,
        'yandex.version': 1, 'yandex.fulfillmentStatus': 'NEW', 'yandex.revision': 1,
        'yandex.itemsRevision': 1, 'yandex.itemsFrozen': false, 'yandex.notification.pending': true,
        'yandex.cancelRequested': null, 'yandex.operation': null, 'yandex.cancellationPending': false,
        'yandex.reconciliationRequired': false, 'yandex.audit': [], 'yandex.decisions': {}, 'yandex.accountingStage': '',
        customer: { name: body.deliveryInfo.clientName || '', phone: body.deliveryInfo.phoneNumber || '' },
        items: body.items.map((item) => ({ billzProductId: item.id, name: item.name || names.get(item.id) || '', quantity: item.quantity, unitPrice: item.price })),
        totalAmount: body.paymentInfo.itemsCost, createdAt: now, updatedAt: now,
      } }, { upsert: true, new: true, runValidators: true, timestamps: false }).lean();
    } catch (err) {
      if (err.code !== 11000) throw err;
      record = await Model.findOne(filter).lean();
      if (!record) throw err;
    }
  }
  // GET projects mutable picked items. Only the original normalized request
  // establishes retry identity. No reservation, payment or notification here.
  if (!isDeepStrictEqual(record.yandex?.requestSnapshot, snapshot)) return { conflict: true };
  return { orderId: record.internalOrderId, result: 'OK' };
}

function find(orderId) {
  if (typeof orderId !== 'string' || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(orderId)) return null;
  return ChannelOrder().findOne({ channel: 'yandex', internalOrderId: orderId }).lean();
}

module.exports = { receive, find };
