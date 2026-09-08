const literal = (value) => ({ $literal: value });
const holds = { $ifNull: ['$yandexSoldHolds', []] };
const watermark = { $ifNull: ['$snapshotStartedAt', new Date(0)] };
function soldHoldQuantity(mirror) {
  return (mirror.yandexSoldHolds || []).reduce((sum, hold) => sum + (Number(hold.quantity) || 0), 0);
}
async function transferSoldHold(order, soldAt, Model = require('../models/BillzProduct')(), Orders = require('../models/ChannelOrder')()) {
  const owner = { internalOrderId: order.internalOrderId, channel: 'yandex', status: 'reserved',
    'billz.reservationApplied': true, 'billz.operationToken': order.billz?.operationToken,
    'billz.reconciliationRequired': { $ne: true } };
  const lost = () => Object.assign(new Error('yandex_stock_operation_ownership_lost'), { code: 'BILLZ_OPERATION_OWNERSHIP_LOST' });
  if (!owner['billz.operationToken']) throw lost();
  // Cancellation cannot undo confirmed payment. Transfer still protects its units.
  const current = await Orders.findOneAndUpdate({ ...owner, 'billz.operationAction': 'complete' }, {
    $set: { 'billz.operationAction': 'settle_stock', 'billz.operationStartedAt': new Date() },
  }, { new: true });
  if (!current) throw lost();
  const quantities = new Map();
  for (const item of current.items) quantities.set(item.billzProductId, (quantities.get(item.billzProductId) || 0) + item.quantity);
  for (const [billzProductId, quantity] of quantities) {
    const refreshed = await Orders.findOneAndUpdate({ ...owner, 'billz.operationAction': 'settle_stock' }, {
      $set: { 'billz.operationStartedAt': new Date() },
    });
    if (!refreshed) throw lost();
    const transfer = { $not: [{ $in: [literal(current.internalOrderId), { $map: { input: holds, as: 'hold', in: '$$hold.orderId' } }] }] };
    const marker = { orderId: literal(current.internalOrderId), soldAt: literal(soldAt),
      quantity: { $cond: [{ $lte: [watermark, literal(soldAt)] }, quantity, 0] } };
    const result = await Model.updateOne({ billzProductId }, [{ $set: {
      reservedQty: { $cond: [transfer, { $max: [0, { $subtract: [{ $ifNull: ['$reservedQty', 0] }, quantity] }] }, '$reservedQty'] },
      yandexSoldHolds: { $cond: [transfer, { $concatArrays: [holds, [marker]] }, holds] },
    } }]);
    if (result.matchedCount !== 1) throw new Error('yandex_stock_mirror_missing');
  }
}
function snapshotHolds(startedAt) {
  const newer = { $lt: [watermark, literal(startedAt)] };
  return { $cond: [newer, { $map: { input: holds, as: 'hold', in: {
    orderId: '$$hold.orderId', soldAt: '$$hold.soldAt',
    quantity: { $cond: [{ $gte: ['$$hold.soldAt', literal(startedAt)] }, '$$hold.quantity', 0] },
  } } }, holds] };
}
async function cleanupSoldHolds(Model = require('../models/BillzProduct')(), Orders) {
  for await (const product of Model.find({ 'yandexSoldHolds.quantity': 0 }).select('yandexSoldHolds').lean().cursor()) {
    Orders ||= require('../models/ChannelOrder')();
    const ids = product.yandexSoldHolds.filter((hold) => hold.quantity === 0).map((hold) => hold.orderId);
    const finalized = await Orders.find({ internalOrderId: { $in: ids }, channel: 'yandex', status: 'sold',
      'billz.reservationApplied': false, 'billz.operationToken': { $in: ['', null] }, 'billz.reconciliationRequired': { $ne: true },
      'yandex.operation.token': { $in: ['', null] }, 'yandex.reconciliationRequired': { $ne: true }, 'yandex.cancelRequested': null,
    }).select('internalOrderId').lean();
    if (finalized.length) await Model.updateOne({ _id: product._id }, { $pull: {
      yandexSoldHolds: { orderId: { $in: finalized.map((order) => order.internalOrderId) }, quantity: 0 },
    } });
  }
}
module.exports = { soldHoldQuantity, transferSoldHold, snapshotHolds, cleanupSoldHolds };
