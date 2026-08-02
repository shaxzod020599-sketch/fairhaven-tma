const AuditLog = require('../models/AuditLog');

/**
 * Writes the operator audit trail, guaranteed credential-free.
 *
 * Redaction happens here, on the way in, rather than on the way out: a summary
 * that never reaches the database cannot leak through a future endpoint,
 * a backup, or a log shipper. Recording never throws — an audit failure must
 * not fail the operation it describes.
 */

const SECRET_KEY_PATTERN = /token|secret|password|cookie|authorization|initdata|credential|apikey|api_key/i;
const MAX_SUMMARY_JSON = 4000;

function redact(value, depth = 0) {
  if (value == null || depth > 4) return value == null ? value : '[…]';
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => redact(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, inner] of Object.entries(value)) {
      if (SECRET_KEY_PATTERN.test(key)) continue;
      out[key] = redact(inner, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 500) return `${value.slice(0, 500)}…`;
  return value;
}

function adminIdentity(admin) {
  return {
    telegramId: admin?.telegramId ?? null,
    name: [admin?.firstName, admin?.lastName].filter(Boolean).join(' ')
      || admin?.username || '',
  };
}

async function record({ admin, action, entityType = '', entityId = '', summary = null }) {
  try {
    let safeSummary = summary == null ? null : redact(summary);
    if (safeSummary != null && JSON.stringify(safeSummary).length > MAX_SUMMARY_JSON) {
      safeSummary = { truncated: true };
    }
    await AuditLog.create({
      admin: adminIdentity(admin),
      action,
      entityType,
      entityId: String(entityId || ''),
      summary: safeSummary,
    });
  } catch (err) {
    console.warn('[audit] record failed:', err.message);
  }
}

module.exports = { record, redact, adminIdentity };
