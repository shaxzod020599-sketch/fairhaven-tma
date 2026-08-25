const config = require('../config');
const MedicalkaPartnerProfile = require('../models/MedicalkaPartnerProfile');
const { MedicalkaPartnerClient } = require('./partnerClient');
const { createCredentialCipher } = require('./credentialCipher');

const ENVIRONMENTS = Object.freeze({
  staging: Object.freeze({
    baseUrl: 'https://api.staging.medicalka.com/api/v1',
  }),
  production: Object.freeze({
    baseUrl: 'https://api.medicalka.com/api/v1',
  }),
});

function profileError(code, status = 422) {
  const err = new Error(code);
  err.code = code;
  err.status = status;
  return err;
}

function environmentConfig(environment) {
  const name = String(environment || '');
  const value = ENVIRONMENTS[name];
  if (!value) throw profileError('medicalka_invalid_environment');
  return { name, ...value };
}

function maskUsername(value) {
  const text = String(value || '');
  if (text.length <= 4) return '•'.repeat(text.length);
  return `${text.slice(0, 2)}${'•'.repeat(text.length - 4)}${text.slice(-2)}`;
}

function pharmaciesFrom(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.items;
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    id: String(row?.id || ''),
    name: String(row?.name || row?.title || ''),
  })).filter((row) => row.id);
}

function createPartnerProfileService({
  Model = MedicalkaPartnerProfile(),
  cipher = createCredentialCipher(config.medicalkaPartner.credentialsEncryptionKey),
  clientFactory = (input) => new MedicalkaPartnerClient(input),
  now = () => new Date(),
} = {}) {
  function credentials(row) {
    if (!row?.usernameCipher || !row?.passwordCipher) return null;
    try {
      return {
        username: cipher.decrypt(row.usernameCipher, `${row.environment}:username`),
        password: cipher.decrypt(row.passwordCipher, `${row.environment}:password`),
      };
    } catch {
      throw profileError('medicalka_credentials_invalid', 503);
    }
  }

  function summarize(row) {
    if (!row) return null;
    const decrypted = credentials(row);
    return {
      environment: row.environment,
      baseUrl: row.baseUrl,
      username: maskUsername(decrypted?.username),
      passwordConfigured: Boolean(row.passwordCipher),
      processingMode: row.environment === 'staging' ? 'observe' : row.processingMode,
      active: Boolean(row.active),
      pharmacyCount: Array.isArray(row.pharmacies) ? row.pharmacies.length : 0,
      pharmacies: Array.isArray(row.pharmacies) ? row.pharmacies : [],
      lastValidatedAt: row.lastValidatedAt || null,
      health: {
        lastSuccessAt: row.health?.lastSuccessAt || null,
        lastErrorCode: row.health?.lastErrorCode || '',
      },
    };
  }

  async function validateAndSave(input = {}) {
    const environment = environmentConfig(input.environment);
    const previous = await Model.findOne({ environment: environment.name }).lean();
    const priorCredentials = previous ? credentials(previous) : null;
    const username = String(input.username || priorCredentials?.username || '').trim();
    const password = String(input.password || priorCredentials?.password || '');
    if (!username || username.length > 200 || !password || password.length > 500) {
      throw profileError('medicalka_invalid_credentials');
    }

    const processingMode = environment.name === 'staging'
      ? 'observe'
      : (input.processingMode === 'live' ? 'live' : 'observe');
    const client = clientFactory({
      baseUrl: environment.baseUrl,
      username,
      password,
      timeoutMs: config.medicalkaPartner.timeoutMs,
      maxResponseBytes: config.medicalkaPartner.maxResponseBytes,
    });

    let pharmacies;
    try {
      pharmacies = pharmaciesFrom(await client.getPharmacies());
    } catch {
      throw profileError('medicalka_profile_validation_failed', 422);
    }

    const validatedAt = now();
    const saved = await Model.findOneAndUpdate({ environment: environment.name }, {
      $set: {
        environment: environment.name,
        baseUrl: environment.baseUrl,
        usernameCipher: cipher.encrypt(username, `${environment.name}:username`),
        passwordCipher: cipher.encrypt(password, `${environment.name}:password`),
        processingMode,
        active: Boolean(previous?.active),
        pharmacies,
        lastValidatedAt: validatedAt,
        health: { lastSuccessAt: validatedAt, lastErrorCode: '' },
      },
    }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
    return summarize(saved);
  }

  async function get(environment) {
    const selected = environmentConfig(environment);
    return Model.findOne({ environment: selected.name }).lean();
  }

  async function listSummaries() {
    const rows = await Model.find({}).sort({ environment: 1 }).lean();
    return rows.map(summarize);
  }

  return Object.freeze({ credentials, get, listSummaries, summarize, validateAndSave });
}

module.exports = {
  ENVIRONMENTS,
  createPartnerProfileService,
  environmentConfig,
  maskUsername,
};
