const { createCipheriv, createDecipheriv, createHash, randomBytes } = require('node:crypto');

const VERSION = 'v1';
const IV_BYTES = 12;

function credentialError() {
  const err = new Error('medicalka_credentials_invalid');
  err.code = 'medicalka_credentials_invalid';
  return err;
}

function createCredentialCipher(secret) {
  const input = String(secret || '');
  if (Buffer.byteLength(input, 'utf8') < 32) throw credentialError();
  const key = createHash('sha256').update(input, 'utf8').digest();

  function encrypt(value, context = '') {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(String(context), 'utf8'));
    const encrypted = Buffer.concat([
      cipher.update(String(value), 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv, tag, encrypted]
      .map((part) => Buffer.isBuffer(part) ? part.toString('base64url') : part)
      .join('.');
  }

  function decrypt(envelope, context = '') {
    try {
      const [version, encodedIv, encodedTag, encodedValue, extra] = String(envelope || '').split('.');
      if (version !== VERSION || extra !== undefined) throw credentialError();
      const iv = Buffer.from(encodedIv, 'base64url');
      const tag = Buffer.from(encodedTag, 'base64url');
      const encrypted = Buffer.from(encodedValue, 'base64url');
      if (
        iv.toString('base64url') !== encodedIv
        || tag.toString('base64url') !== encodedTag
        || encrypted.toString('base64url') !== encodedValue
      ) throw credentialError();
      if (iv.length !== IV_BYTES || tag.length !== 16 || !encrypted.length) throw credentialError();
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAAD(Buffer.from(String(context), 'utf8'));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch (err) {
      if (err?.code === 'medicalka_credentials_invalid') throw err;
      throw credentialError();
    }
  }

  return Object.freeze({ encrypt, decrypt });
}

module.exports = { createCredentialCipher };
