const mongoose = require('mongoose');

/**
 * Guarded broadcast lifecycle: draft → tested → sending → completed|failed.
 *
 * The state machine is the guard. A draft cannot be sent until a test copy has
 * landed in the composing admin's own chat (`testedAt`), and the send endpoint
 * moves draft→sending atomically so two admins cannot double-send one draft.
 */
const broadcastSchema = new mongoose.Schema({
  text: { type: String, required: true, maxlength: 3500 },
  segment: {
    type: String,
    enum: ['all', 'recent30', 'inactive90'],
    required: true,
  },
  status: {
    type: String,
    enum: ['draft', 'tested', 'sending', 'completed', 'failed'],
    default: 'draft',
    index: true,
  },
  counts: {
    targets: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
  },
  createdBy: {
    telegramId: { type: Number, default: null },
    name: { type: String, default: '' },
  },
  testedAt: { type: Date, default: null },
  startedAt: { type: Date, default: null },
  finishedAt: { type: Date, default: null },
  lastError: { type: String, default: '' },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Broadcast', broadcastSchema);
