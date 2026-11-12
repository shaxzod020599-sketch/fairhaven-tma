const mongoose = require('mongoose');
const { defineModel } = require('../db');

/**
 * One webhook call owed to a partner.
 *
 * Written in the same step that changes an order, then delivered by a worker
 * with retries, so a partner whose server is down for an hour still learns
 * every status change in order once it is back.
 */
const partnerEventSchema = new mongoose.Schema({
  partnerCode: { type: String, required: true, index: true },
  orderNumber: { type: Number, default: null },
  type: { type: String, required: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  state: { type: String, enum: ['pending', 'delivered', 'failed', 'skipped'], default: 'pending' },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  lastError: { type: String, default: '' },
  lastStatusCode: { type: Number, default: null },
  deliveredAt: { type: Date, default: null },
}, { timestamps: true });

partnerEventSchema.index({ state: 1, nextAttemptAt: 1 });

let model = null;

function PartnerEvent() {
  if (!model) model = defineModel('PartnerEvent', partnerEventSchema, 'partnerevents');
  return model;
}

module.exports = PartnerEvent;
