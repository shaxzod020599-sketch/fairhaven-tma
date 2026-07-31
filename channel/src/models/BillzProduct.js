const mongoose = require('mongoose');
const { defineModel } = require('../db');

/**
 * Mirror of the Billz catalogue.
 *
 * This is a cache, not a source of truth: Billz owns every field prefixed with
 * the data it sends. The only locally-owned fields are the reservation
 * counters, which is why a sync must never overwrite them.
 *
 * Fairhaven's own product card lives in the bot backend's `products`
 * collection and links here by `billzProductId`.
 */
const billzProductSchema = new mongoose.Schema({
  billzProductId: { type: String, required: true, unique: true, index: true },

  // ── From Billz ────────────────────────────────────────────────────────────
  name: { type: String, default: '' },
  sku: { type: String, default: '', index: true },
  barcode: { type: String, default: '', index: true },
  brandName: { type: String, default: '' },
  billzCategoryId: { type: String, default: '' },
  categoryName: { type: String, default: '' },
  measurementUnit: { type: String, default: '' },
  retailPrice: { type: Number, default: 0 },
  promoPrice: { type: Number, default: 0 },
  stock: { type: Number, default: 0 },
  // Kept for change detection only. Billz forbids serving media from their CDN,
  // so this URL is never handed to a channel or a browser.
  sourceImageUrl: { type: String, default: '' },

  // ── Owned by this service ─────────────────────────────────────────────────
  // Units held by a confirmed reservation in Billz.
  reservedQty: { type: Number, default: 0, min: 0 },
  // Units held by a bot order that is still awaiting Telegram approval. Local
  // only — nothing is written to Billz until an operator confirms.
  pendingQty: { type: Number, default: 0, min: 0 },

  deletedInBillz: { type: Boolean, default: false, index: true },
  syncedAt: { type: Date, default: null },
}, { timestamps: true });

billzProductSchema.methods.availableStock = function availableStock() {
  return Math.max(0, this.stock - this.reservedQty - this.pendingQty);
};

let model = null;

module.exports = function BillzProduct() {
  if (!model) model = defineModel('BillzProduct', billzProductSchema, 'billzproducts');
  return model;
};

module.exports.schema = billzProductSchema;
