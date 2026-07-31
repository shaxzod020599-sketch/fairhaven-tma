const crypto = require('crypto');
const mongoose = require('mongoose');
const { defineModel } = require('../db');

/**
 * API credentials issued to a sales channel.
 *
 * Medicalka's contract uses two keys with different powers: a `token` that only
 * reads the catalogue and stock, and a `secret` that submits and updates
 * orders. They are separate records here so either can be rotated alone, and so
 * a leaked read token can never place an order.
 *
 * Only the SHA-256 of a key is stored. The keys are 256 bits of CSPRNG output
 * rather than anything a human chose, so a slow password KDF buys nothing —
 * there is no dictionary to run. Lookup is by hash, which also means the stored
 * value cannot be compared against character by character.
 */
const channelKeySchema = new mongoose.Schema({
  channel: { type: String, required: true, index: true },   // 'medicalka' | 'uzum'
  kind: { type: String, required: true },                   // 'token' | 'secret'
  hash: { type: String, required: true, unique: true },
  // Shown in the admin panel so an operator can tell two keys apart without
  // ever seeing the key itself again.
  label: { type: String, default: '' },
  prefix: { type: String, default: '' },
  last4: { type: String, default: '' },
  active: { type: Boolean, default: true, index: true },
  lastUsedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
}, { timestamps: true });

channelKeySchema.index({ channel: 1, kind: 1, active: 1 });

const KIND_TAG = { token: 't', secret: 's' };
const CHANNEL_TAG = { medicalka: 'fhm', uzum: 'fhu' };

/**
 * Key format: `<channelTag>_<kindTag>_<43 base64url chars>`, e.g. `fhm_t_...`.
 *
 * base64url because the key travels in a query string (`?token=`).
 * The tags are not decoration: Medicalka's own guide warns integrators against
 * swapping the two keys, and a visible tag lets us answer "you sent the read
 * token to an order endpoint" instead of a bare 401.
 */
function generateKey(channel, kind) {
  const channelTag = CHANNEL_TAG[channel];
  const kindTag = KIND_TAG[kind];
  if (!channelTag) throw new Error(`unknown channel "${channel}"`);
  if (!kindTag) throw new Error(`unknown key kind "${kind}"`);
  const body = crypto.randomBytes(32).toString('base64url');
  return `${channelTag}_${kindTag}_${body}`;
}

function hashKey(presented) {
  return crypto.createHash('sha256').update(String(presented)).digest('hex');
}

/** Reads the tags off a presented key without trusting them for authorisation. */
function describeKey(presented) {
  const match = /^(fh[a-z])_([ts])_([A-Za-z0-9_-]{43})$/.exec(String(presented || ''));
  if (!match) return null;
  const channel = Object.keys(CHANNEL_TAG).find((c) => CHANNEL_TAG[c] === match[1]);
  const kind = Object.keys(KIND_TAG).find((k) => KIND_TAG[k] === match[2]);
  return { channel, kind, prefix: `${match[1]}_${match[2]}`, last4: match[3].slice(-4) };
}

let model = null;

function ChannelKey() {
  if (!model) model = defineModel('ChannelKey', channelKeySchema, 'channelkeys');
  return model;
}

module.exports = ChannelKey;
module.exports.generateKey = generateKey;
module.exports.hashKey = hashKey;
module.exports.describeKey = describeKey;
module.exports.CHANNEL_TAG = CHANNEL_TAG;
module.exports.KIND_TAG = KIND_TAG;
