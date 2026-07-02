const mongoose = require('mongoose');

/**
 * One-time login handshake between the public web site and the Telegram bot.
 * The site stores only a SHA-256 hash of the token; the raw value lives in the
 * visitor's browser and inside the t.me deep-link payload.
 */
const webLoginTokenSchema = new mongoose.Schema({
  tokenHash: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['pending', 'ready'],
    default: 'pending',
    index: true,
  },
  telegramId: { type: Number, default: null },
  claimedAt: { type: Date, default: null },
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 },
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('WebLoginToken', webLoginTokenSchema);
