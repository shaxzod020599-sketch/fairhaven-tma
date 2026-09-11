const crypto = require('node:crypto');
const config = require('../config');

// A separate HKDF domain prevents reuse of the transport credential as an AES key.
// Rotating CHANNEL_INTERNAL_TOKEN requires restoring the same partner secrets.
function encryptionKey() {
  if (Buffer.byteLength(config.internalToken) < 32) throw new Error('retail_cipher_unavailable');
  return Buffer.from(crypto.hkdfSync('sha256', config.internalToken, 'fairhaven', 'retail-credential-v1', 32));
}
const context = (channel, clientId) => Buffer.from(JSON.stringify([channel, clientId]));
function encrypt(secret, channel, clientId) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(context(channel, clientId));
  const body = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}
function decrypt(envelope, channel, clientId) {
  try {
    const [version, iv, tag, body, extra] = envelope.split('.');
    if (version !== 'v1' || extra !== undefined) throw new Error();
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
    decipher.setAAD(context(channel, clientId)); decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
  } catch (_) { throw new Error('retail_cipher_unavailable'); }
}
function encryptedFields(secret, channel, clientId) {
  // Preserve legacy issuance when no secure storage key is configured.
  if (!['uzum', 'yandex'].includes(channel) || Buffer.byteLength(config.internalToken) < 32) return {};
  return { encryptedSecret: encrypt(secret, channel, clientId) };
}
module.exports = { encrypt, decrypt, encryptedFields };
