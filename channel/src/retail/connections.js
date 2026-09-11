const router = require('express').Router();
const mongoose = require('mongoose');
const { defineModel } = require('../db');
const config = require('../config');
const Keys = require('../models/ChannelKey');
const cipher = require('./credentials');
let settings;
function Settings() {
  if (!settings) settings = defineModel('RetailConnection', new mongoose.Schema({
    _id: String, place: String,
  }), 'retailconnections');
  return settings;
}
const channels = ['uzum', 'yandex'];
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.get('/', async (_req, res) => {
  try {
    const setting = await Settings().findById('common').lean();
    const keys = await Keys().find({ channel: { $in: channels }, kind: 'oauth', active: true })
      .select('+encryptedSecret').sort({ createdAt: -1 }).limit(200).lean();
    res.json({ place: setting?.place || '', channels: channels.map(channel => ({
      channel, host: `https://api.fairhaven.uz/${channel}`, enabled: config[channel].enabled,
      runtimePlace: config[channel].storeId || config[channel].placeId || '',
      placeConfigured: Boolean(config[channel].storeId || config[channel].placeId),
      keys: keys.filter(k => k.channel === channel).map(k => ({
        id: String(k._id), clientId: k.clientId, label: k.label,
        secretAvailable: Boolean(k.encryptedSecret),
      })),
    })) });
  } catch (_) { res.status(503).json({ error: 'connections_unavailable' }); }
});
router.put('/place', async (req, res) => {
  const place = req.body?.place;
  if (typeof place !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(place)) return res.status(422).json({ error: 'invalid_place' });
  // Handoff metadata only. Never silently repoint either live integration.
  if (channels.some(c => config[c].enabled && (config[c].storeId || config[c].placeId) !== place)) {
    return res.status(409).json({ error: 'active_place_mismatch' });
  }
  try {
    await Settings().updateOne({ _id: 'common' }, { $set: { place } }, { upsert: true });
    res.json({ place });
  } catch (_) { res.status(503).json({ error: 'connections_unavailable' }); }
});
router.param('id', (req, res, next, id) => {
  if (!/^[a-f0-9]{24}$/i.test(id)) return res.status(422).json({ error: 'invalid_id' });
  next();
});
const selector = id => ({ _id: id, kind: 'oauth', channel: { $in: channels }, active: true });
router.put('/:id/secret', async (req, res) => {
  const value = req.body?.clientSecret;
  if (typeof value !== 'string' || value.length < 8 || value.length > 4096) return res.status(422).json({ error: 'invalid_secret' });
  try {
    const key = await Keys().findOne(selector(req.params.id)).lean();
    if (!key) return res.status(404).json({ error: 'key_unavailable' });
    if (Keys.hashKey(value) !== key.hash) return res.status(422).json({ error: 'secret_mismatch' });
    const encryptedSecret = cipher.encrypt(value, key.channel, key.clientId);
    const updated = await Keys().updateOne({ ...selector(req.params.id), channel: key.channel, clientId: key.clientId, hash: key.hash }, { $set: { encryptedSecret } });
    if (!updated.matchedCount) return res.status(409).json({ error: 'key_changed' });
    res.json({ saved: true });
  } catch (_) { res.status(503).json({ error: 'secret_storage_unavailable' }); }
});
router.post('/:id/reveal', async (req, res) => {
  try {
    const key = await Keys().findOne(selector(req.params.id)).select('+encryptedSecret').lean();
    if (!key) return res.status(404).json({ error: 'key_unavailable' });
    if (!key.encryptedSecret) return res.status(409).json({ error: 'secret_copy_missing' });
    const clientSecret = cipher.decrypt(key.encryptedSecret, key.channel, key.clientId);
    if (Keys.hashKey(clientSecret) !== key.hash) return res.status(503).json({ error: 'secret_storage_unavailable' });
    res.json({ id: String(key._id), channel: key.channel, clientId: key.clientId, clientSecret });
  } catch (_) { res.status(503).json({ error: 'secret_storage_unavailable' }); }
});
module.exports = router;
