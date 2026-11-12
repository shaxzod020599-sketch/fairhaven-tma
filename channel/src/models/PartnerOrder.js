const mongoose = require('mongoose');
const { defineModel } = require('../db');

/**
 * An order as a Partner API partner sees it.
 *
 * Kept apart from ChannelOrder on purpose. ChannelOrder is the stock and Billz
 * ledger and has its own state machine (received → reserved → sold); this is
 * the conversation with the partner (new → accepted → completed, or rejected /
 * cancelled), with the reasons and history they are owed. A test-mode order
 * lives only here, so it can never leak into stock, Billz or sales reports.
 */
const STATUSES = ['new', 'accepted', 'rejected', 'cancelled', 'completed'];
const FINAL = new Set(['rejected', 'cancelled', 'completed']);

const itemSchema = new mongoose.Schema({
  productId: { type: Number, required: true },
  billzProductId: { type: String, default: '' },
  name: { type: String, default: '' },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, default: 0 },
  lineTotal: { type: Number, default: 0 },
}, { _id: false });

const historySchema = new mongoose.Schema({
  status: { type: String, enum: STATUSES },
  at: { type: Date, default: Date.now },
  reason: { type: String, default: '' },
  by: { type: String, default: '' },
}, { _id: false });

const messageSchema = new mongoose.Schema({
  recipientKey: String,
  chatId: String,
  messageId: Number,
  sentAt: Date,
  finalizedStatus: { type: String, default: '' },
}, { _id: false });

const partnerOrderSchema = new mongoose.Schema({
  number: { type: Number, required: true, unique: true },
  partnerCode: { type: String, required: true },
  externalId: { type: String, required: true },
  test: { type: Boolean, default: false },
  status: { type: String, enum: STATUSES, default: 'new', index: true },
  reason: { type: String, default: '' },
  items: { type: [itemSchema], default: [] },
  total: { type: Number, default: 0 },
  customer: {
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
  },
  delivery: {
    type: { type: String, enum: ['courier', 'pickup'], default: 'courier' },
    address: { type: String, default: '' },
    comment: { type: String, default: '' },
  },
  comment: { type: String, default: '' },
  // The stock/Billz ledger entry behind a live order.
  channelOrderId: { type: String, default: '' },
  deadlineAt: { type: Date, default: null, index: true },
  testOutcome: { type: String, enum: ['accept', 'reject'], default: 'accept' },
  decidedBy: { type: String, default: '' },
  history: { type: [historySchema], default: [] },
  // A transition in flight. Claimed atomically so a double-tapped Telegram
  // button and the timeout sweeper cannot both act on one order.
  lock: {
    op: { type: String, default: '' },
    at: { type: Date, default: null },
  },
  notification: {
    // Card still to be posted (live orders only).
    pending: { type: Boolean, default: false },
    // The card's text no longer matches the order's status.
    stale: { type: Boolean, default: false },
    messages: { type: [messageSchema], default: [] },
  },
}, { timestamps: true });

// Test and live orders are separate books: an order_id used while testing
// must not swallow the real order that later reuses it.
partnerOrderSchema.index({ partnerCode: 1, externalId: 1, test: 1 }, { unique: true });
partnerOrderSchema.index({ partnerCode: 1, createdAt: -1 });
partnerOrderSchema.index({ 'notification.pending': 1 });
partnerOrderSchema.index({ 'notification.stale': 1 });

let model = null;

function PartnerOrder() {
  if (!model) model = defineModel('PartnerOrder', partnerOrderSchema, 'partnerorders');
  return model;
}

module.exports = PartnerOrder;
module.exports.STATUSES = STATUSES;
module.exports.FINAL = FINAL;
