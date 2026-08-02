const mongoose = require('mongoose');

const adminLoginAttemptSchema = new mongoose.Schema({
  pollTokenHash: { type: String, required: true, unique: true, index: true },
  userCode: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'approved', 'denied', 'consumed'],
    default: 'pending',
    index: true,
  },
  adminTelegramId: { type: Number, default: null },
  presentedToTelegramId: { type: Number, default: null },
  ip: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  decidedAt: { type: Date, default: null },
  consumedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
}, {
  timestamps: true,
});

module.exports = mongoose.model('AdminLoginAttempt', adminLoginAttemptSchema);
