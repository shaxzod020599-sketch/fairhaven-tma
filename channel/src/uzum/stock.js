const literal = (value) => ({ $literal: value });
const holds = { $ifNull: ['$uzumSoldHolds', []] };
const watermark = { $ifNull: ['$snapshotStartedAt', new Date(0)] };
function soldHoldQuantity(mirror) {
  return (mirror.uzumSoldHolds || []).reduce((sum, hold) => sum + (Number(hold.quantity) || 0), 0);
}
async function transferSoldHold(order, soldAt, Model = require('../models/BillzProduct')()) {
  const quantities = new Map();
  for (const item of order.items) quantities.set(item.billzProductId, (quantities.get(item.billzProductId) || 0) + item.quantity);
  for (const [billzProductId, quantity] of quantities) {
    const transfer = { $and: [
      { $lte: [watermark, literal(soldAt)] },
      { $not: [{ $in: [literal(order.internalOrderId), { $map: { input: holds, as: 'hold', in: '$$hold.orderId' } }] }] },
    ] };
    // One atomic product update: no moment exposes the released reservation
    // without its sold-stock protection. A fresh snapshot/pruned marker cannot
    // authorize replay, and missing products fail into core reconciliation.
    const result = await Model.updateOne({ billzProductId }, [{ $set: {
      reservedQty: { $cond: [transfer, { $max: [0, { $subtract: [{ $ifNull: ['$reservedQty', 0] }, quantity] }] }, '$reservedQty'] },
      uzumSoldHolds: { $cond: [transfer, { $concatArrays: [holds, literal([{ orderId: order.internalOrderId, quantity, soldAt }])] }, holds] },
    } }]);
    if (result.matchedCount !== 1) throw new Error('uzum_stock_mirror_missing');
  }
}
function snapshotUpdate(fields, startedAt, appliedAt) {
  const newer = { $lt: [watermark, literal(startedAt)] };
  return [{ $set: {
    ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, { $cond: [newer, literal(value), `$${key}`] }])),
    syncedAt: { $cond: [newer, literal(appliedAt), '$syncedAt'] },
    snapshotStartedAt: { $cond: [newer, literal(startedAt), '$snapshotStartedAt'] },
    uzumSoldHolds: { $cond: [newer, { $filter: { input: holds, as: 'hold', cond: { $gte: ['$$hold.soldAt', literal(startedAt)] } } }, holds] },
    reservedQty: { $ifNull: ['$reservedQty', 0] },
    pendingQty: { $ifNull: ['$pendingQty', 0] },
  } }];
}
module.exports = { snapshotUpdate, soldHoldQuantity, transferSoldHold };
