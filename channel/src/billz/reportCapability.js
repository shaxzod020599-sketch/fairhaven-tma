const CACHE_TTL_MS = 15 * 60 * 1000;

let cached = null;

function resetReportCapabilityCache() {
  cached = null;
}

async function checkReportCapability({ client, force = false, now = new Date() }) {
  const checkedAt = new Date(now);
  if (!force && cached && checkedAt.getTime() < cached.expiresAt) return cached.result;

  let result;
  try {
    await client.get('/v2/order', { limit: 1, page: 1 });
    result = { state: 'available', checkedAt, reason: '' };
  } catch (err) {
    result = err?.status === 403
      ? { state: 'report_access_required', checkedAt, reason: 'billz_report_permission_denied' }
      : { state: 'unavailable', checkedAt, reason: 'billz_temporarily_unavailable' };
  }

  cached = { result, expiresAt: checkedAt.getTime() + CACHE_TTL_MS };
  return result;
}

module.exports = {
  CACHE_TTL_MS,
  checkReportCapability,
  resetReportCapabilityCache,
};
