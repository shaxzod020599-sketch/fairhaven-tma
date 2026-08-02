const mongoose = require('mongoose');

const adminSessionSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true, index: true },
  adminTelegramId: { type: Number, required: true, index: true },
  host: { type: String, required: true },
  lastSeenAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  revokedAt: { type: Date, default: null, index: true },
  ip: { type: String, default: '' },
  userAgent: { type: String, default: '' },
}, {
  timestamps: { createdAt: true, updatedAt: false },
});

adminSessionSchema.index({ adminTelegramId: 1, revokedAt: 1, expiresAt: -1 });

module.exports = mongoose.model('AdminSession', adminSessionSchema);
