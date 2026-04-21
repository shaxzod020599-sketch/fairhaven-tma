const mongoose = require('mongoose');

function parseTelegramId(value) {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0 || !Number.isSafeInteger(num)) {
    return null;
  }
  return num;
}

function ensureObjectId(value) {
  return typeof value === 'string' && mongoose.Types.ObjectId.isValid(value);
}

function pick(obj, allowedFields) {
  return allowedFields.reduce((acc, field) => {
    if (Object.prototype.hasOwnProperty.call(obj, field)) {
      acc[field] = obj[field];
    }
    return acc;
  }, {});
}

function toSafeString(value, { max = 500, fallback = '' } = {}) {
  if (value === undefined || value === null) return fallback;
  return String(value).trim().slice(0, max);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  parseTelegramId,
  ensureObjectId,
  pick,
  toSafeString,
  escapeRegex,
};
