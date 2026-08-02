const mongoose = require('mongoose');

const consumedTelegramInitDataSchema = new mongoose.Schema({
  initDataHash: { type: String, required: true, unique: true, index: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
}, {
  timestamps: { createdAt: true, updatedAt: false },
});

module.exports = mongoose.model('ConsumedTelegramInitData', consumedTelegramInitDataSchema);
