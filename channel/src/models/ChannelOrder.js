const mongoose = require('mongoose');
const { defineModel } = require('../db');

/**
 * An order received from a sales channel.
 *
 * The record exists before anything is written to Billz, and it is what makes
 * the integration safe to retry. Marketplaces resend an order when our reply is
 * slow or lost — Uzum's contract requires that a resend return the same order
 * id with a 200 — so the unique index on (channel, externalId) is the thing
 * that stops one customer order becoming two sales.
 */
const channelOrderItemSchema = new mongoose.Schema({
  billzProductId: { type: String, required: true },
  // Denormalised on purpose: the order must still read correctly years later,
  // after the product has been renamed, repriced or delisted.
  name: { type: String, default: '' },
  quantity: { type: Number, required: true, min: 0 },
  unitPrice: { type: Number, required: true, min: 0 },
}, { _id: false });

const channelOrderSchema = new mongoose.Schema({
  channel: { type: String, required: true, index: true },
  // Their id: Medicalka's order_id, Uzum's eatsId.
  externalId: { type: String, required: true },
  // Ours, handed back to them and used for every later reference.
  internalOrderId: { type: String, required: true, unique: true },

  /**
   * The integer Medicalka's contract expects back as `wc_order_id`.
   *
   * Their own example answers `{"wc_order_id": 25545}` — unquoted — and their
   * type note says ids are integers while prices are strings. A UUID in that
   * field is a type error their client would hit on the very first order, so
   * the number is allocated once per order and never changes.
   */
  publicOrderId: { type: Number, default: null, index: true, sparse: true },

  items: { type: [channelOrderItemSchema], default: [] },
  totalAmount: { type: Number, default: 0 },
  customer: {
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
  },

  /**
   * received  — stored, nothing written to Billz yet
   * reserved  — stock held in Billz by a postponed draft
   * sold      — payment posted; Billz has decremented stock
   * cancelled — reservation released, or cancelled before one existed
   * failed    — a Billz step failed; only explicitly retry-safe failures may retry
   *             while uncertain failures require reconciliation
   */
  status: {
    type: String,
    enum: ['received', 'reserved', 'sold', 'cancelled', 'failed'],
    default: 'received',
    index: true,
  },

  // Immutable business event used by analytics. `updatedAt` changes on retries,
  // reconciliation and operator edits, so it cannot safely date a completed sale.
  soldAt: { type: Date, default: null },
  // True only when migration had to approximate a legacy sale using updatedAt.
  soldAtEstimated: { type: Boolean, default: false },

  billz: {
    draftOrderId: { type: String, default: '' },
    orderNumber: { type: String, default: '' },
    // Whether reservedQty on the mirror currently counts this order. Guards the
    // counter against double application: a retry that re-runs a step must not
    // reserve the same units twice, and a release must not subtract twice.
    reservationApplied: { type: Boolean, default: false },
    // The same guard for pendingQty — the local hold a bot order takes while it
    // waits for an operator in the Telegram channel. Separate from the flag
    // above because the two are held at different times and released by
    // different events.
    pendingApplied: { type: Boolean, default: false },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: '' },
    lastTriedAt: { type: Date, default: null },
    operationAction: { type: String, default: '' },
    operationToken: { type: String, default: '' },
    operationStartedAt: { type: Date, default: null },
    reconciliationRequired: { type: Boolean, default: false },
    // A failed record may be claimed again only when the code that observed
    // the failure durably proved it was rejected before any Billz effect.
    // Missing values on legacy failed records are deliberately not retry-safe.
    failureDisposition: {
      type: String,
      enum: ['', 'retry_safe', 'reconciliation_required'],
      default: '',
    },
  },

  // When an unconfirmed local hold stops protecting stock. An order nobody ever
  // acts on must not keep units out of every marketplace forever, so the sweeper
  // releases the hold at this point — the order itself stays open, and
  // confirming it later still reserves normally.
  holdExpiresAt: { type: Date, default: null },

  // Card in the Telegram orders channel, so status changes edit it in place
  // instead of posting again.
  telegramMessageId: { type: Number, default: null },

  // Uzum operator decisions are independent of Medicalka approvals and of the
  // core Billz lease. A durable pending cancellation survives either surface.
  uzum: {
    version: Number,
    acceptedAt: Date,
    readyAt: Date,
    revision: { type: Number, default: 0 },
    reconciliationRequired: { type: Boolean, default: false },
    operation: { type: mongoose.Schema.Types.Mixed, default: null },
    cancelRequested: { type: mongoose.Schema.Types.Mixed, default: null },
    audit: { type: [mongoose.Schema.Types.Mixed], default: [] },
    notification: {
      pending: { type: Boolean, default: true },
      token: { type: String, default: '' },
      leaseUntil: Date,
      retryAt: Date,
      deliveredKey: { type: String, default: '' },
      messages: { type: [mongoose.Schema.Types.Mixed], default: [] },
    },
  },

  // The payload exactly as it arrived. Reconstructing what a marketplace sent
  // from our normalised copy is guesswork when something goes wrong.
  rawIn: {
    type: mongoose.Schema.Types.Mixed, default: null,
    immutable: function () { return this.channel === 'yandex'; },
  },

  // Receipt identity stays separate from the actual picked items. Absent on
  // other channels so their stored records and projections stay unchanged.
  yandex: {
    type: new mongoose.Schema({
      requestSnapshot: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
      version: { type: Number, default: 1 },
      fulfillmentStatus: { type: String, enum: ['NEW', 'ACCEPTED_BY_RESTAURANT', 'COOKING', 'READY', 'TAKEN_BY_COURIER', 'DELIVERED', 'CANCELLED'], default: 'NEW' },
      revision: { type: Number, default: 1 },
      itemsRevision: { type: Number, default: 1 },
      itemsFrozen: { type: Boolean, default: false },
      acceptedAt: Date,
      readyAt: Date,
      operation: { type: mongoose.Schema.Types.Mixed, default: null },
      cancelRequested: { type: mongoose.Schema.Types.Mixed, default: null },
      cancellationPending: { type: Boolean, default: false },
      reconciliationRequired: { type: Boolean, default: false },
      // Checkpoints distinguish a known draft from an uncertain reservation or payment.
      accountingStage: { type: String, default: '' },
      paymentConfirmedAt: Date,
      decisions: { type: mongoose.Schema.Types.Mixed, default: {} },
      audit: { type: [mongoose.Schema.Types.Mixed], default: [] },
      notification: {
        pending: { type: Boolean, default: true },
        token: { type: String, default: '' },
        leaseUntil: Date,
        retryAt: Date,
        cooldownUntil: Date,
        deliveredKey: { type: String, default: '' },
        messages: { type: [mongoose.Schema.Types.Mixed], default: [] },
      },
    }, { _id: false }),
    default: undefined,
  },
}, { timestamps: true });

channelOrderSchema.index({ channel: 1, externalId: 1 }, { unique: true });
channelOrderSchema.index({ status: 1, createdAt: -1 });
channelOrderSchema.index({ channel: 1, soldAt: -1 });
// Drives the hold sweeper. Partial so it only spans orders actually holding
// stock, which is a small slice of the collection.
channelOrderSchema.index(
  { holdExpiresAt: 1 },
  { name: 'expiring_holds', partialFilterExpression: { 'billz.pendingApplied': true } }
);

let model = null;

module.exports = function ChannelOrder() {
  if (!model) model = defineModel('ChannelOrder', channelOrderSchema, 'channelorders');
  return model;
};
