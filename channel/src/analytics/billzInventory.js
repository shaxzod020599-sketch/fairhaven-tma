const config = require('../config');

function zeroSummary() {
  return {
    physicalUnits: 0,
    reservedUnits: 0,
    pendingUnits: 0,
    sellableUnits: 0,
    estimatedRetailValue: 0,
    skuCount: 0,
    zeroStockSkuCount: 0,
    lowStockSkuCount: 0,
  };
}

async function summarizeInventory({
  ProductModel,
  SyncLogModel,
  lowStockThreshold = 5,
  now = new Date(),
  expectedIntervalMs = config.sync.intervalMs,
}) {
  const threshold = Math.max(0, Number(lowStockThreshold) || 0);
  const [inventoryRows, latestSync, lastSuccessfulSync] = await Promise.all([
    ProductModel.aggregate([
      { $match: { deletedInBillz: { $ne: true } } },
      {
        $project: {
          billzProductId: 1,
          name: 1,
          retailPrice: { $max: [0, { $ifNull: ['$retailPrice', 0] }] },
          physical: { $max: [0, { $ifNull: ['$stock', 0] }] },
          reserved: { $max: [0, { $ifNull: ['$reservedQty', 0] }] },
          pending: { $max: [0, { $ifNull: ['$pendingQty', 0] }] },
          sellable: {
            $max: [0, {
              $subtract: [
                { $ifNull: ['$stock', 0] },
                { $add: [
                  { $ifNull: ['$reservedQty', 0] },
                  { $ifNull: ['$pendingQty', 0] },
                  { $sum: { $map: {
                    input: { $ifNull: ['$uzumSoldHolds', []] },
                    as: 'hold',
                    in: { $ifNull: ['$$hold.quantity', 0] },
                  } } },
                ] },
              ],
            }],
          },
        },
      },
      {
        $facet: {
          totals: [{
            $group: {
              _id: null,
              physicalUnits: { $sum: '$physical' },
              reservedUnits: { $sum: '$reserved' },
              pendingUnits: { $sum: '$pending' },
              sellableUnits: { $sum: '$sellable' },
              estimatedRetailValue: { $sum: { $multiply: ['$sellable', '$retailPrice'] } },
              skuCount: { $sum: 1 },
              zeroStockSkuCount: { $sum: { $cond: [{ $eq: ['$sellable', 0] }, 1, 0] } },
              lowStockSkuCount: { $sum: { $cond: [{ $lte: ['$sellable', threshold] }, 1, 0] } },
            },
          }],
          lowStock: [
            { $match: { sellable: { $lte: threshold } } },
            { $sort: { sellable: 1, name: 1, billzProductId: 1 } },
            { $limit: 100 },
            { $project: { _id: 0, billzProductId: 1, name: 1, sellableUnits: '$sellable' } },
          ],
        },
      },
    ]),
    SyncLogModel.findOne({ kind: 'catalog' }).sort({ startedAt: -1 }).lean(),
    SyncLogModel.findOne({ kind: 'catalog', ok: true }).sort({ finishedAt: -1 }).lean(),
  ]);

  const totals = inventoryRows?.[0]?.totals?.[0] || zeroSummary();
  const syncedAt = lastSuccessfulSync?.finishedAt || null;
  let freshness = 'unavailable';
  if (syncedAt) {
    const age = new Date(now).getTime() - new Date(syncedAt).getTime();
    freshness = latestSync?.ok && age >= 0 && age <= expectedIntervalMs ? 'fresh' : 'stale';
  }

  return {
    physicalUnits: Number(totals.physicalUnits || 0),
    reservedUnits: Number(totals.reservedUnits || 0),
    pendingUnits: Number(totals.pendingUnits || 0),
    sellableUnits: Number(totals.sellableUnits || 0),
    estimatedRetailValue: Number(totals.estimatedRetailValue || 0),
    skuCount: Number(totals.skuCount || 0),
    zeroStockSkuCount: Number(totals.zeroStockSkuCount || 0),
    lowStockSkuCount: Number(totals.lowStockSkuCount || 0),
    lowStock: inventoryRows?.[0]?.lowStock || [],
    syncedAt,
    freshness,
  };
}

module.exports = { summarizeInventory };
