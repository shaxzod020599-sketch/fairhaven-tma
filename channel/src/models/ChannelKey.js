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
 * Authentication uses only the SHA-256 of a key. OAuth credentials may also
 * have an encrypted admin-only handoff copy; Medicalka never does.
 * The keys are 256 bits of CSPRNG output
 * rather than anything a human chose, so a slow password KDF buys nothing —
 * there is no dictionary to run. Lookup is by hash, which also means the stored
 * value cannot be compared against character by character.
 */
const channelKeySchema = new mongoose.Schema({
  channel: { type: String, required: true, index: true },   // 'medicalka' | 'uzum' | 'yandex'
  kind: { type: String, required: true },                   // 'token' | 'secret' | 'oauth'
  hash: { type: String, required: true, unique: true },
  encryptedSecret: { type: String, select: false },
  /**
   * The public half of an OAuth client credential.
   *
   * Uzum authenticates with a client id and a client secret. Only the secret is
   * a secret — the id is an identifier they send in the clear on every token
   * request, and we have to look the record up by it, which a hash of the
   * secret cannot do. Stored in plaintext for exactly that reason.
   */
  clientId: { type: String, default: '', index: true, sparse: true },
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

const KIND_TAG = { token: 't', secret: 's', oauth: 'o' };
const CHANNEL_TAG = { medicalka: 'fhm', uzum: 'fhu', yandex: 'fhy' };

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

/**
 * The public identifier of an OAuth client.
 *
 * Deliberately shorter and visually distinct from a secret, so an integrator
 * reading both out of an email cannot confuse them, and so a client id that
 * turns up in a log is recognisable as harmless.
 */
function generateClientId(channel) {
  const channelTag = CHANNEL_TAG[channel];
  if (!channelTag) throw new Error(`unknown channel "${channel}"`);
  return `${channelTag}_id_${crypto.randomBytes(12).toString('base64url')}`;
}

/** Reads the tags off a presented key without trusting them for authorisation. */
function describeKey(presented) {
  const match = /^(fh[a-z])_([tso])_([A-Za-z0-9_-]{43})$/.exec(String(presented || ''));
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
module.exports.generateClientId = generateClientId;
module.exports.hashKey = hashKey;
module.exports.describeKey = describeKey;
module.exports.CHANNEL_TAG = CHANNEL_TAG;
module.exports.KIND_TAG = KIND_TAG;
