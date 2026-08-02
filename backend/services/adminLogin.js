const crypto = require('crypto');
const AdminLoginAttempt = require('../models/AdminLoginAttempt');
const ConsumedTelegramInitData = require('../models/ConsumedTelegramInitData');
const User = require('../models/User');
const { validateTelegramInitData } = require('../middleware/telegramAuth');
const { hashToken, issueSession } = require('./adminSession');

const ATTEMPT_TTL_MS = 3 * 60 * 1000;
const REPLAY_TTL_MS = 10 * 60 * 1000;
const POLL_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

function authError(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

function bounded(value, max) {
  return String(value || '').slice(0, max);
}

async function createAttempt({ ip = '', userAgent = '' } = {}) {
  const pollToken = crypto.randomBytes(32).toString('base64url');
  const userCode = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = new Date(Date.now() + ATTEMPT_TTL_MS);
  await AdminLoginAttempt.create({
    pollTokenHash: hashToken(pollToken),
    userCode,
    status: 'pending',
    ip: bounded(ip, 64),
    userAgent: bounded(userAgent, 240),
    expiresAt,
  });
  return { pollToken, userCode, expiresAt };
}

async function findPending(rawToken) {
  if (!POLL_TOKEN_RE.test(String(rawToken || ''))) return null;
  return AdminLoginAttempt.findOne({
    pollTokenHash: hashToken(rawToken),
    status: 'pending',
    expiresAt: { $gt: new Date() },
  });
}

async function presentAttempt(rawToken, adminTelegramId) {
  if (!POLL_TOKEN_RE.test(String(rawToken || ''))) return null;
  const telegramId = Number(adminTelegramId);
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) return null;
  return AdminLoginAttempt.findOneAndUpdate(
    {
      pollTokenHash: hashToken(rawToken),
      status: 'pending',
      expiresAt: { $gt: new Date() },
      presentedToTelegramId: { $in: [null, telegramId] },
    },
    { $set: { presentedToTelegramId: telegramId } },
    { new: true }
  );
}

async function decideAttempt({ attemptId, adminTelegramId, decision }) {
  if (!['approved', 'denied'].includes(decision)) throw authError('invalid_decision');
  return AdminLoginAttempt.findOneAndUpdate(
    {
      _id: attemptId,
      status: 'pending',
      expiresAt: { $gt: new Date() },
      presentedToTelegramId: Number(adminTelegramId),
    },
    {
      $set: {
        status: decision,
        adminTelegramId: Number(adminTelegramId),
        decidedAt: new Date(),
      },
    },
    { new: true }
  );
}

async function consumeApproved(rawToken) {
  if (!POLL_TOKEN_RE.test(String(rawToken || ''))) return null;
  return AdminLoginAttempt.findOneAndUpdate(
    {
      pollTokenHash: hashToken(rawToken),
      status: 'approved',
      expiresAt: { $gt: new Date() },
    },
    { $set: { status: 'consumed', consumedAt: new Date() } },
    { new: true }
  );
}

async function loginState(rawToken) {
  if (!POLL_TOKEN_RE.test(String(rawToken || ''))) return 'expired';
  const attempt = await AdminLoginAttempt.findOne({
    pollTokenHash: hashToken(rawToken),
    expiresAt: { $gt: new Date() },
  }).select('status').lean();
  return attempt?.status || 'expired';
}

async function exchangeTelegram({ initData, req, res }) {
  const telegramUser = validateTelegramInitData(initData, process.env.TELEGRAM_BOT_TOKEN, {
    maxAgeSeconds: 300,
  });
  const admin = await User.findOne({ telegramId: telegramUser.id, role: 'admin' });
  if (!admin) throw authError('admin_required');

  try {
    await ConsumedTelegramInitData.create({
      initDataHash: hashToken(initData),
      expiresAt: new Date(Date.now() + REPLAY_TTL_MS),
    });
  } catch (err) {
    if (err?.code === 11000) throw authError('telegram_init_data_replayed');
    throw err;
  }

  const issued = await issueSession({ admin, req, res });
  return { ...issued, admin };
}

module.exports = {
  ATTEMPT_TTL_MS,
  POLL_TOKEN_RE,
  consumeApproved,
  createAttempt,
  decideAttempt,
  exchangeTelegram,
  findPending,
  loginState,
  presentAttempt,
};
