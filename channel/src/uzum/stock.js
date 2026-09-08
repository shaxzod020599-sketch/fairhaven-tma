const literal = (value) => ({ $literal: value });
const holds = { $ifNull: ['$uzumSoldHolds', []] };
const watermark = { $ifNull: ['$snapshotStartedAt', new Date(0)] };
function soldHoldQuantity(mirror) {
  return (mirror.uzumSoldHolds || []).reduce((sum, hold) => sum + (Number(hold.quantity) || 0), 0);
}
async function transferSoldHold(order, soldAt, Model = require('../models/BillzProduct')(), Orders = require('../models/ChannelOrder')()) {
  const owner = {
    internalOrderId: order.internalOrderId,
    channel: 'uzum', status: 'reserved',
    'billz.reservationApplied': true,
    'billz.operationToken': order.billz?.operationToken,
    'billz.reconciliationRequired': { $ne: true },
  };
  const lost = () => Object.assign(new Error('uzum_stock_operation_ownership_lost'), { code: 'BILLZ_OPERATION_OWNERSHIP_LOST' });
  if (!owner['billz.operationToken']) throw lost();
  // Claim this phase once, after confirmed payment. A read-only owner check
  // would admit a duplicate that could resume after finalization and cleanup.
  const current = await Orders.findOneAndUpdate(
    { ...owner, 'billz.operationAction': 'complete' },
    { $set: { 'billz.operationAction': 'settle_stock', 'billz.operationStartedAt': new Date() } },
    { new: true }
  );
  if (!current) throw lost();
  const quantities = new Map();
  for (const item of current.items) quantities.set(item.billzProductId, (quantities.get(item.billzProductId) || 0) + item.quantity);
  for (const [billzProductId, quantity] of quantities) {
    const refreshed = await Orders.findOneAndUpdate(
      { ...owner, 'billz.operationAction': 'settle_stock' },
      { $set: { 'billz.operationStartedAt': new Date() } }
    );
    if (!refreshed) throw lost();
    const transfer = { $not: [{ $in: [literal(current.internalOrderId), { $map: { input: holds, as: 'hold', in: '$$hold.orderId' } }] }] };
    const marker = { orderId: literal(current.internalOrderId), soldAt: literal(soldAt),
      quantity: { $cond: [{ $lte: [watermark, literal(soldAt)] }, quantity, 0] } };
    // One atomic product update: no moment exposes the released reservation
    // without sold-stock protection. Even a covering snapshot needs a marker
    // until the order is durably sold and no longer reserved.
    const result = await Model.updateOne({ billzProductId }, [{ $set: {
      reservedQty: { $cond: [transfer, { $max: [0, { $subtract: [{ $ifNull: ['$reservedQty', 0] }, quantity] }] }, '$reservedQty'] },
      uzumSoldHolds: { $cond: [transfer, { $concatArrays: [holds, [marker]] }, holds] },
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
    yandexSoldHolds: require('../yandex/stock').snapshotHolds(startedAt),
    uzumSoldHolds: { $cond: [newer, { $map: { input: holds, as: 'hold', in: {
      orderId: '$$hold.orderId', soldAt: '$$hold.soldAt',
      quantity: { $cond: [{ $gte: ['$$hold.soldAt', literal(startedAt)] }, '$$hold.quantity', 0] },
    } } }, holds] },
    reservedQty: { $ifNull: ['$reservedQty', 0] },
    pendingQty: { $ifNull: ['$pendingQty', 0] },
  } }];
}
async function cleanupSoldHolds(Model = require('../models/BillzProduct')(), Orders) {
  // Streaming bounds memory; each successful catalogue retries interrupted
  // cleanup. Unfinished or uncertain orders retain their replay evidence.
  for await (const product of Model.find({ 'uzumSoldHolds.quantity': 0 }).select('uzumSoldHolds').lean().cursor()) {
    Orders ||= require('../models/ChannelOrder')();
    const orderIds = product.uzumSoldHolds.filter((hold) => hold.quantity === 0).map((hold) => hold.orderId);
    const finalized = await Orders.find({
      internalOrderId: { $in: orderIds }, channel: 'uzum', status: 'sold',
      'billz.reservationApplied': false,
      'billz.operationToken': { $in: ['', null] },
      'billz.reconciliationRequired': { $ne: true },
    }).select('internalOrderId').lean();
    if (finalized.length) await Model.updateOne({ _id: product._id }, { $pull: {
      uzumSoldHolds: { orderId: { $in: finalized.map((order) => order.internalOrderId) }, quantity: 0 },
    } });
  }
}
module.exports = { snapshotUpdate, soldHoldQuantity, transferSoldHold, cleanupSoldHolds };
