const mongoose = require('mongoose');

/**
 * Read-only view of the Billz mirror.
 *
 * `billzproducts` is written by the channel-hub service, which syncs it from
 * Billz every few minutes. The admin panel needs to show that data — stock, the
 * Billz retail price, whether a product still exists upstream — but must never
 * write it: anything written here would be silently overwritten on the next
 * sync, and a stale value shown as authoritative is worse than no value.
 *
 * The module therefore exports a facade carrying only read methods, mirroring
 * the boundary channel-hub enforces in the other direction.
 */
const billzProductViewSchema = new mongoose.Schema({
  billzProductId: String,
  medicalkaId: Number,
  name: String,
  sku: String,
  barcode: String,
  brandName: String,
  categoryName: String,
  measurementUnit: String,
  retailPrice: Number,
  promoPrice: Number,
  stock: Number,
  reservedQty: Number,
  pendingQty: Number,
  deletedInBillz: Boolean,
  syncedAt: Date,
}, { collection: 'billzproducts', strict: false });

const model = mongoose.models.BillzProductView
  || mongoose.model('BillzProductView', billzProductViewSchema, 'billzproducts');

const READ_METHODS = ['find', 'findOne', 'countDocuments', 'distinct', 'aggregate', 'exists'];

const view = { READ_METHODS };
for (const method of READ_METHODS) {
  view[method] = model[method].bind(model);
}

module.exports = Object.freeze(view);
