const Order = require('../models/Order');
const { escapeRegex } = require('../utils/analyticsQuery');

function maskPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 12 && digits.startsWith('998')) {
    return `+998 ** *** ** ${digits.slice(-2)}`;
  }
  return `••••${digits.slice(-2)}`;
}

function eventExists(status, from, to) {
  return {
    $gt: [{
      $size: {
        $filter: {
          input: { $ifNull: ['$statusHistory', []] },
          as: 'event',
          cond: {
            $and: [
              { $eq: ['$$event.status', status] },
              { $gte: ['$$event.at', from] },
              { $lt: ['$$event.at', to] },
            ],
          },
        },
      },
    }, 0],
  };
}

async function summarizeFairhavenSales({ from, to, Model = Order }) {
  const [result] = await Model.aggregate([
    {
      $project: {
        totalAmount: { $ifNull: ['$totalAmount', 0] },
        units: { $sum: { $map: { input: { $ifNull: ['$items', []] }, as: 'item', in: '$$item.quantity' } } },
        status: 1,
        historySize: { $size: { $ifNull: ['$statusHistory', []] } },
        createdInRange: { $and: [{ $gte: ['$createdAt', from] }, { $lt: ['$createdAt', to] }] },
        deliveredInRange: eventExists('delivered', from, to),
        returnedInRange: eventExists('returned', from, to),
        cancelledInRange: eventExists('cancelled', from, to),
      },
    },
    {
      $addFields: {
        legacyFallback: { $and: [{ $eq: ['$historySize', 0] }, '$createdInRange'] },
      },
    },
    {
      $addFields: {
        completedInRange: {
          $or: [
            '$deliveredInRange',
            { $and: ['$legacyFallback', { $in: ['$status', ['delivered', 'returned']] }] },
          ],
        },
        returnInRange: {
          $or: [
            '$returnedInRange',
            { $and: ['$legacyFallback', { $eq: ['$status', 'returned'] }] },
          ],
        },
        cancelInRange: {
          $or: [
            '$cancelledInRange',
            { $and: ['$legacyFallback', { $eq: ['$status', 'cancelled'] }] },
          ],
        },
      },
    },
    { $match: { $or: [{ completedInRange: true }, { returnInRange: true }, { cancelInRange: true }] } },
    {
      $group: {
        _id: null,
        grossRevenue: { $sum: { $cond: ['$completedInRange', '$totalAmount', 0] } },
        returnedAmount: { $sum: { $cond: ['$returnInRange', '$totalAmount', 0] } },
        completedCount: { $sum: { $cond: ['$completedInRange', 1, 0] } },
        unitsSold: { $sum: { $cond: ['$completedInRange', '$units', 0] } },
        cancelledCount: { $sum: { $cond: ['$cancelInRange', 1, 0] } },
        legacyFallbackCount: { $sum: { $cond: ['$legacyFallback', 1, 0] } },
      },
    },
  ]);

  const grossRevenue = Number(result?.grossRevenue || 0);
  const returnedAmount = Number(result?.returnedAmount || 0);
  const completedCount = Number(result?.completedCount || 0);
  return {
    grossRevenue,
    returnedAmount,
    netRevenue: grossRevenue - returnedAmount,
    completedCount,
    averageCheck: completedCount ? grossRevenue / completedCount : 0,
    unitsSold: Number(result?.unitsSold || 0),
    cancelledCount: Number(result?.cancelledCount || 0),
    failedCount: 0,
    legacyFallbackCount: Number(result?.legacyFallbackCount || 0),
  };
}

function billzState(order) {
  if (order.billzSync?.conflict) return 'conflict';
  if (order.billzSync?.lastError) return 'error';
  if (order.billzSync?.dispatched === 'sell') return 'posted';
  if (order.billzSync?.dispatched === 'reserve') return 'reserved';
  if (order.billzSync?.dispatched === 'cancel') return 'released';
  return 'pending';
}

function normalizeRow(order) {
  const items = (order.items || []).map((item) => ({
    name: item.name || '',
    quantity: Number(item.quantity || 0),
    unitPrice: Number(item.price || 0),
    amount: Number(item.quantity || 0) * Number(item.price || 0),
  }));
  const id = String(order._id);
  return {
    id,
    source: 'fairhaven.uz',
    externalId: id,
    internalOrderId: id,
    billzOrderNumber: '',
    status: order.status,
    occurredAt: order.occurredAt,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    totalAmount: Number(order.totalAmount || 0),
    items,
    customer: {
      name: order.customerName || '',
      phoneMasked: maskPhone(order.customerPhone),
    },
    billzState: billzState(order),
    legacyTimeFallback: Boolean(order.legacyTimeFallback),
  };
}

async function listFairhavenSales({
  from, to, status = '', search = '', page = 1, limit = 25, Model = Order,
}) {
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 25));
  const initialMatch = {};
  if (status) initialMatch.status = status;

  const pipeline = [{ $match: initialMatch }, { $addFields: { sid: { $toString: '$_id' } } }];
  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    pipeline.push({
      $match: {
        $or: [
          { sid: regex },
          { customerName: regex },
          { customerPhone: regex },
          { 'items.name': regex },
        ],
      },
    });
  }
  pipeline.push(
    {
      $addFields: {
        historySize: { $size: { $ifNull: ['$statusHistory', []] } },
        currentEvents: {
          $filter: {
            input: { $ifNull: ['$statusHistory', []] },
            as: 'event',
            cond: { $eq: ['$$event.status', '$status'] },
          },
        },
      },
    },
    {
      $addFields: {
        legacyTimeFallback: { $eq: ['$historySize', 0] },
        occurredAt: {
          $cond: [
            { $eq: ['$historySize', 0] },
            '$createdAt',
            {
              $ifNull: [
                { $arrayElemAt: ['$currentEvents.at', -1] },
                { $arrayElemAt: ['$statusHistory.at', -1] },
              ],
            },
          ],
        },
      },
    },
    { $match: { occurredAt: { $gte: from, $lt: to } } },
    { $sort: { occurredAt: -1, _id: -1 } },
    {
      $facet: {
        rows: [{ $skip: (safePage - 1) * safeLimit }, { $limit: safeLimit }],
        count: [{ $count: 'total' }],
      },
    }
  );

  const [result] = await Model.aggregate(pipeline);
  return {
    rows: (result?.rows || []).map(normalizeRow),
    total: result?.count?.[0]?.total || 0,
    page: safePage,
    limit: safeLimit,
  };
}

module.exports = {
  billzState,
  listFairhavenSales,
  maskPhone,
  normalizeRow,
  summarizeFairhavenSales,
};
