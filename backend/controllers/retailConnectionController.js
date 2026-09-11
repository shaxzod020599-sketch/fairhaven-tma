const hub = require('../utils/channelHub');
const audit = require('../services/adminAudit');
const validId = id => typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id);
const fail = (res, status = 503) => res.status(status).json({ success: false, error: 'connection_data_unavailable' });
async function run(req, res, method, path, body, select) {
  res.set('Cache-Control', 'no-store');
  try {
    const result = await hub.requestInternal(method, ['internal', 'connections', ...path], body === undefined ? undefined : { body });
    if (!result.ok) return fail(res, [404, 409, 422, 503].includes(result.status) ? result.status : 502);
    const data = select(result.body);
    if (method !== 'GET') await audit.record({ admin: req.admin, action: `retail.connection.${path.at(-1)}`,
      entityType: 'channel-key', entityId: req.params.id || 'common-place' });
    return res.json({ success: true, data });
  } catch (_) { return fail(res); }
}
exports.list = (req, res) => run(req, res, 'GET', [], undefined, value => ({
  place: value.place,
  channels: value.channels.map(c => ({ channel: c.channel, host: c.host, enabled: c.enabled,
    runtimePlace: c.runtimePlace, placeConfigured: c.placeConfigured,
    keys: c.keys.map(k => ({ id: k.id, clientId: k.clientId, label: k.label, secretAvailable: k.secretAvailable })),
  })),
}));
exports.savePlace = (req, res) => {
  if (typeof req.body?.place !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(req.body.place)) return fail(res, 422);
  return run(req, res, 'PUT', ['place'], { place: req.body.place }, v => ({ place: v.place }));
};
exports.restore = (req, res) => {
  if (!validId(req.params.id) || typeof req.body?.clientSecret !== 'string'
    || req.body.clientSecret.length < 8 || req.body.clientSecret.length > 4096) return fail(res, 422);
  return run(req, res, 'PUT', [req.params.id, 'secret'], { clientSecret: req.body.clientSecret }, v => ({ saved: v.saved === true }));
};
exports.reveal = (req, res) => {
  if (!validId(req.params.id)) return fail(res, 422);
  return run(req, res, 'POST', [req.params.id, 'reveal'], {}, v => {
    if (v.id !== req.params.id || !['uzum', 'yandex'].includes(v.channel)
      || typeof v.clientId !== 'string' || !v.clientId || typeof v.clientSecret !== 'string' || !v.clientSecret) throw new Error();
    return { id: v.id, channel: v.channel, clientId: v.clientId, clientSecret: v.clientSecret };
  });
};
