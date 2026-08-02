const mongoose = require('mongoose');

/**
 * Redacted trail of operator mutations. One row per money- or trust-sensitive
 * action: status transitions, price edits, product deletion, key issuance,
 * broadcast sends, Excel applies, customer blocks.
 *
 * `summary` is written exclusively through services/adminAudit.js, which strips
 * credential-shaped keys before the document is created — nothing here should
 * ever be able to reveal a secret, because none is stored.
 */
const auditLogSchema = new mongoose.Schema({
  admin: {
    telegramId: { type: Number, default: null },
    name: { type: String, default: '' },
  },
  action: { type: String, required: true, index: true },
  entityType: { type: String, default: '' },
  entityId: { type: String, default: '' },
  summary: { type: mongoose.Schema.Types.Mixed, default: null },
}, {
  timestamps: { createdAt: true, updatedAt: false },
});

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
