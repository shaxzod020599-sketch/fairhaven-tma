const crypto = require('node:crypto');
const config = require('../../config');
const ChannelKey = require('../../models/ChannelKey');

const CHANNEL = 'yandex';
const AUDIENCE = 'fairhaven-yandex';
const TTL = 3600;

function sign(payload) {
  const key = config.yandex.tokenSigningKey;
  if (typeof key !== 'string' || key.length < 32) throw new Error('Yandex signing is not configured');
  return crypto.createHmac('sha256', key).update(payload).digest('base64url');
}

function unauthorized(res) {
  res.set('WWW-Authenticate', 'Bearer realm="fairhaven-yandex"');
  return res.status(401).json({ reason: 'Invalid or missing credentials' });
}

async function issueToken(req, res, next) {
  const body = req.body;
  if (!body || typeof body.client_id !== 'string' || !body.client_id
    || typeof body.client_secret !== 'string' || !body.client_secret
    || body.grant_type !== 'client_credentials' || body.scope !== 'read write') {
    return res.status(400).json([{ code: 400, description: 'client_id, client_secret, client_credentials grant and read write scope are required' }]);
  }
  try {
    const record = await ChannelKey().findOne({ channel: CHANNEL, kind: 'oauth', clientId: body.client_id, active: true }).lean();
    const presented = Buffer.from(ChannelKey.hashKey(body.client_secret));
    const stored = Buffer.from(record?.hash || '');
    if (!record || stored.length !== presented.length || !crypto.timingSafeEqual(stored, presented)) return unauthorized(res);
    const payload = Buffer.from(JSON.stringify({ c: CHANNEL, a: AUDIENCE, k: String(record._id), e: Math.floor(Date.now() / 1000) + TTL })).toString('base64url');
    const accessToken = `${payload}.${sign(payload)}`;
    res.set('Cache-Control', 'no-store');
    return res.json({ access_token: accessToken, expires_in: TTL });
  } catch (err) { return next(err); }
}

async function requireBearer(req, res, next) {
  const match = /^Bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/i.exec(req.get('authorization') || '');
  if (!match || match[1].length > 1024) return unauthorized(res);
  try {
    const expected = Buffer.from(sign(match[1]));
    const signature = Buffer.from(match[2]);
    if (signature.length !== expected.length || !crypto.timingSafeEqual(signature, expected)) return unauthorized(res);
    let claims;
    try { claims = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8')); } catch { return unauthorized(res); }
    if (!claims || claims.c !== CHANNEL || claims.a !== AUDIENCE
      || !Number.isSafeInteger(claims.e) || claims.e <= Math.floor(Date.now() / 1000)
      || typeof claims.k !== 'string' || !/^[a-f0-9]{24}$/i.test(claims.k)) return unauthorized(res);
    // Every request re-reads active ownership; revocation has no token-cache lag.
    const record = await ChannelKey().findOne({ _id: claims.k, channel: CHANNEL, kind: 'oauth', active: true }).lean();
    if (!record) return unauthorized(res);
    req.channelKey = { id: record._id, kind: record.kind, label: record.label };
    return next();
  } catch (err) { return next(err); }
}

module.exports = { issueToken, requireBearer };
