const mongoose = require('mongoose');
const { defineModel } = require('../db');

/**
 * A partner connected through the generic Partner API (`/partner/v1`).
 *
 * Uzum and Yandex dictate their own contracts, so each needed its own adapter.
 * Partners use ours instead, which makes a new partner a record rather than
 * code: an operator adds one in the admin panel and hands over keys and docs.
 *
 * The partner's orders are stored under the channel name `partner:<code>`, so
 * every existing piece that groups by channel (Billz comments, cards, reports)
 * tells partners apart without knowing about them.
 *
 * `mode` is what the partner's keys may do:
 *   test — the full API works, but orders never touch stock, Billz or Telegram;
 *          they are decided automatically so the partner can build against it
 *   live — real orders: local hold, operator decision, Billz hold and sale
 *   off  — every request is refused
 */
const CODE_PATTERN = /^[a-z][a-z0-9-]{2,23}$/;

// Codes that would read as one of the built-in channels in a report or a Billz
// comment. A partner called "uzum" would be indistinguishable from Uzum.
const RESERVED_CODES = new Set([
  'medicalka', 'uzum', 'yandex', 'bot', 'fairhaven', 'fairhaven-bot',
  'partner', 'partners', 'admin', 'internal', 'test', 'api',
]);

const partnerSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, match: CODE_PATTERN },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  mode: { type: String, enum: ['test', 'live', 'off'], default: 'test', index: true },
  // Minutes the operator has to accept a live order before it is rejected on
  // the partner's behalf. Short, because a customer is waiting on their side.
  decisionMinutes: { type: Number, default: 5, min: 1, max: 60 },
  note: { type: String, default: '', maxlength: 500 },
  webhook: {
    url: { type: String, default: '' },
    // HMAC signing secret, encrypted at rest. The partner verifies our calls
    // with it, so it has to be readable again — a hash would not do.
    secretEnc: { type: String, default: '', select: false },
  },
  billz: {
    // Optional own Billz integration key, encrypted. Billz shows the key that
    // wrote a sale as its author; without one, partner sales fall back to the
    // shared partners key, then to the shop-wide key.
    secretEnc: { type: String, default: '', select: false },
    hasSecret: { type: Boolean, default: false },
    paymentTypeId: { type: String, default: '' },
    paymentTypeName: { type: String, default: '' },
  },
  liveSince: { type: Date, default: null },
}, { timestamps: true });

let model = null;

function Partner() {
  if (!model) model = defineModel('Partner', partnerSchema, 'partners');
  return model;
}

function channelOf(code) {
  return `partner:${code}`;
}

function codeOf(channel) {
  const value = String(channel || '');
  return value.startsWith('partner:') ? value.slice('partner:'.length) : '';
}

function isPartnerChannel(channel) {
  return Boolean(codeOf(channel));
}

function validCode(code) {
  return CODE_PATTERN.test(String(code || '')) && !RESERVED_CODES.has(String(code));
}

module.exports = Partner;
module.exports.channelOf = channelOf;
module.exports.codeOf = codeOf;
module.exports.isPartnerChannel = isPartnerChannel;
module.exports.validCode = validCode;
module.exports.CODE_PATTERN = CODE_PATTERN;
module.exports.RESERVED_CODES = RESERVED_CODES;
