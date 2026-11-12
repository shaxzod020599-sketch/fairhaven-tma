const crypto = require('crypto');
const config = require('../config');
const logger = require('../logger');
const billzAuth = require('../billz/auth');
const Partner = require('../models/Partner');
const ChannelKey = require('../models/ChannelKey');
const { generateKey, hashKey, describeKey } = require('../models/ChannelKey');
const { createCredentialCipher } = require('../medicalka/credentialCipher');

/**
 * Partners, their keys and their secrets.
 *
 * Partners are read on every API request and on every Billz write, so they are
 * kept in memory. Every change made through this module refreshes the cache at
 * once; a periodic reload covers anything written behind its back.
 */

const cache = new Map();
let cipher = null;

function getCipher() {
  if (!cipher) {
    try {
      cipher = createCredentialCipher(config.partners.credentialsEncryptionKey);
    } catch (_) {
      const err = new Error('partner credentials encryption key is not configured');
      err.code = 'partner_encryption_unavailable';
      throw err;
    }
  }
  return cipher;
}

const context = (code, what) => `partner:${code}:${what}`;

function decryptOrEmpty(envelope, code, what) {
  if (!envelope) return '';
  try {
    return getCipher().decrypt(envelope, context(code, what));
  } catch (err) {
    logger.warn('partner secret unreadable', { code, what, err });
    return '';
  }
}

function toEntry(doc) {
  return {
    code: doc.code,
    name: doc.name,
    channel: Partner.channelOf(doc.code),
    mode: doc.mode,
    decisionMinutes: doc.decisionMinutes || 5,
    webhookUrl: doc.webhook?.url || '',
    webhookSecret: decryptOrEmpty(doc.webhook?.secretEnc, doc.code, 'webhook'),
    billz: {
      secretToken: decryptOrEmpty(doc.billz?.secretEnc, doc.code, 'billz'),
      paymentTypeId: doc.billz?.paymentTypeId || '',
      paymentTypeName: doc.billz?.paymentTypeName || '',
    },
  };
}

async function load() {
  const docs = await Partner().find({})
    .select('+webhook.secretEnc +billz.secretEnc')
    .lean();
  cache.clear();
  for (const doc of docs) cache.set(doc.code, toEntry(doc));
  return cache.size;
}

async function refresh(code) {
  const doc = await Partner().findOne({ code })
    .select('+webhook.secretEnc +billz.secretEnc')
    .lean();
  if (doc) cache.set(code, toEntry(doc));
  else cache.delete(code);
  return doc ? cache.get(code) : null;
}

function get(code) {
  return cache.get(code) || null;
}

function byChannel(channel) {
  const code = Partner.codeOf(channel);
  return code ? get(code) : null;
}

// Billz looks a partner's own key up synchronously, by channel name.
billzAuth.setChannelSettingsProvider((channel) => {
  const entry = byChannel(channel);
  if (!entry) return null;
  const { secretToken, paymentTypeId, paymentTypeName } = entry.billz;
  return secretToken || paymentTypeId ? { secretToken, paymentTypeId, paymentTypeName } : null;
});

function newWebhookSecret() {
  return `whsec_${crypto.randomBytes(24).toString('base64url')}`;
}

function keyRecord(channel, kind, key, label) {
  const shape = describeKey(key);
  return {
    channel,
    kind,
    hash: hashKey(key),
    prefix: shape.prefix,
    last4: shape.last4,
    label,
    active: true,
  };
}

/**
 * Issues a fresh read token and order secret and revokes the previous pair.
 * The plaintext keys exist only in the return value — they are shown once.
 */
async function issueKeys(code) {
  const partner = get(code) || await refresh(code);
  if (!partner) throw Object.assign(new Error('unknown partner'), { code: 'partner_not_found' });
  const token = generateKey(partner.channel, 'token');
  const secret = generateKey(partner.channel, 'secret');
  const records = await ChannelKey().insertMany([
    keyRecord(partner.channel, 'token', token, `${partner.name} · TOKEN`),
    keyRecord(partner.channel, 'secret', secret, `${partner.name} · SECRET`),
  ]);
  await ChannelKey().updateMany(
    { channel: partner.channel, active: true, _id: { $nin: records.map((r) => r._id) } },
    { $set: { active: false, revokedAt: new Date() } }
  );
  logger.info('partner keys issued', { code });
  return { token, secret };
}

async function create({ code, name, decisionMinutes, note, webhookUrl }) {
  const value = String(code || '').trim().toLowerCase();
  if (!Partner.validCode(value)) {
    throw Object.assign(new Error('invalid partner code'), { code: 'partner_invalid_code' });
  }
  const webhookSecret = newWebhookSecret();
  const doc = {
    code: value,
    name: String(name || '').trim().slice(0, 80) || value,
    mode: 'test',
    decisionMinutes: decisionMinutes || 5,
    note: String(note || '').slice(0, 500),
    webhook: {
      url: webhookUrl || '',
      secretEnc: getCipher().encrypt(webhookSecret, context(value, 'webhook')),
    },
  };
  try {
    await Partner().create(doc);
  } catch (err) {
    if (err.code === 11000) {
      throw Object.assign(new Error('partner code already used'), { code: 'partner_code_taken' });
    }
    throw err;
  }
  await refresh(value);
  const keys = await issueKeys(value);
  logger.info('partner created', { code: value });
  return { partner: get(value), keys, webhookSecret };
}

/**
 * Applies an admin edit. `billzSecret: ''` removes the partner's own Billz key;
 * leaving it out keeps the current one.
 */
async function update(code, patch) {
  const $set = {};
  if (patch.name !== undefined) $set.name = String(patch.name).trim().slice(0, 80);
  if (patch.mode !== undefined) {
    $set.mode = patch.mode;
    if (patch.mode === 'live') $set.liveSince = new Date();
  }
  if (patch.decisionMinutes !== undefined) $set.decisionMinutes = patch.decisionMinutes;
  if (patch.note !== undefined) $set.note = String(patch.note).slice(0, 500);
  if (patch.webhookUrl !== undefined) $set['webhook.url'] = patch.webhookUrl;
  if (patch.billzPaymentTypeId !== undefined) $set['billz.paymentTypeId'] = patch.billzPaymentTypeId;
  if (patch.billzPaymentTypeName !== undefined) $set['billz.paymentTypeName'] = patch.billzPaymentTypeName;
  if (patch.billzSecret !== undefined) {
    $set['billz.secretEnc'] = patch.billzSecret
      ? getCipher().encrypt(patch.billzSecret, context(code, 'billz'))
      : '';
    $set['billz.hasSecret'] = Boolean(patch.billzSecret);
  }
  const doc = await Partner().findOneAndUpdate({ code }, { $set }, { new: true, runValidators: true }).lean();
  if (!doc) return null;
  await refresh(code);
  logger.info('partner updated', { code, fields: Object.keys($set).filter((k) => !k.includes('secretEnc')) });
  return doc;
}

async function rotateWebhookSecret(code) {
  const secret = newWebhookSecret();
  const doc = await Partner().findOneAndUpdate(
    { code },
    { $set: { 'webhook.secretEnc': getCipher().encrypt(secret, context(code, 'webhook')) } },
    { new: true }
  ).lean();
  if (!doc) return null;
  await refresh(code);
  return secret;
}

function startRefresh(intervalMs = 60 * 1000) {
  const timer = setInterval(() => {
    load().catch((err) => logger.warn('partner cache reload failed', { err }));
  }, intervalMs);
  timer.unref?.();
  return timer;
}

function _reset() {
  cache.clear();
  cipher = null;
}

module.exports = {
  load,
  refresh,
  get,
  byChannel,
  create,
  update,
  issueKeys,
  rotateWebhookSecret,
  startRefresh,
  _reset,
};
