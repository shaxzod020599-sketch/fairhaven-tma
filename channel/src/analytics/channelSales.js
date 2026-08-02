function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function maskPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 12 && digits.startsWith('998')) {
    return `+998 ** *** ** ${digits.slice(-2)}`;
  }
  return `••••${digits.slice(-2)}`;
}

function asNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function eventRange(from, to) {
  return {
    $or: [
      { status: 'sold', soldAt: { $gte: from, $lt: to } },
      { status: { $in: ['received', 'reserved', 'cancelled', 'failed'] }, updatedAt: { $gte: from, $lt: to } },
    ],
  };
}

async function summarizeChannelSales({ channel, from, to, Model }) {
  const [result] = await Model.aggregate([
    { $match: { channel, ...eventRange(from, to) } },
    {
      $group: {
        _id: null,
        grossRevenue: { $sum: { $cond: [{ $eq: ['$status', 'sold'] }, '$totalAmount', 0] } },
        completedCount: { $sum: { $cond: [{ $eq: ['$status', 'sold'] }, 1, 0] } },
        unitsSold: {
          $sum: {
            $cond: [
              { $eq: ['$status', 'sold'] },
              { $sum: { $map: { input: '$items', as: 'item', in: '$$item.quantity' } } },
              0,
            ],
          },
        },
        cancelledCount: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        failedCount: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        legacyFallbackCount: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$status', 'sold'] }, { $eq: ['$soldAtEstimated', true] }] },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  const grossRevenue = asNumber(result?.grossRevenue);
  const completedCount = asNumber(result?.completedCount);
  return {
    grossRevenue,
    completedCount,
    averageCheck: completedCount ? grossRevenue / completedCount : 0,
    unitsSold: asNumber(result?.unitsSold),
    returnedAmount: 0,
    cancelledCount: asNumber(result?.cancelledCount),
    failedCount: asNumber(result?.failedCount),
    legacyFallbackCount: asNumber(result?.legacyFallbackCount),
  };
}

function billzState(order) {
  if (order.status === 'sold') return 'posted';
  if (order.billz?.lastError) return 'error';
  if (order.status === 'reserved') return 'reserved';
  if (order.status === 'cancelled') return 'released';
  return 'pending';
}

function normalizeRow(order) {
  const items = (order.items || []).map((item) => ({
    name: item.name || '',
    quantity: asNumber(item.quantity),
    unitPrice: asNumber(item.unitPrice),
    amount: asNumber(item.quantity) * asNumber(item.unitPrice),
  }));
  return {
    id: String(order._id),
    source: order.channel,
    externalId: order.externalId,
    internalOrderId: order.internalOrderId,
    billzOrderNumber: order.billz?.orderNumber || '',
    status: order.status,
    occurredAt: order.occurredAt,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    totalAmount: asNumber(order.totalAmount),
    items,
    customer: {
      name: order.customer?.name || '',
      phoneMasked: maskPhone(order.customer?.phone),
    },
    billzState: billzState(order),
    legacyTimeFallback: order.status === 'sold' && order.soldAtEstimated === true,
  };
}

async function listChannelSales({
  channel, from, to, status = '', search = '', page = 1, limit = 25, Model,
}) {
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 25));
  const match = { channel, ...eventRange(from, to) };
  if (status) match.status = status;
  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    match.$and = [{
      $or: [
        { externalId: regex },
        { internalOrderId: regex },
        { 'billz.orderNumber': regex },
        { 'customer.name': regex },
        { 'items.name': regex },
      ],
    }];
  }

  const [result] = await Model.aggregate([
    { $match: match },
    { $addFields: { occurredAt: { $cond: [{ $eq: ['$status', 'sold'] }, '$soldAt', '$updatedAt'] } } },
    { $sort: { occurredAt: -1, _id: -1 } },
    {
      $facet: {
        rows: [{ $skip: (safePage - 1) * safeLimit }, { $limit: safeLimit }],
        count: [{ $count: 'total' }],
      },
    },
  ]);

  return {
    rows: (result?.rows || []).map(normalizeRow),
    total: result?.count?.[0]?.total || 0,
    page: safePage,
    limit: safeLimit,
  };
}

module.exports = {
  escapeRegex,
  listChannelSales,
  maskPhone,
  normalizeRow,
  summarizeChannelSales,
};
