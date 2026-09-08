const express = require('express');
const lifecycle = require('./lifecycle');
const AdminView = require('../models/AdminView');
const router = express.Router();
function error(res, err) {
  const code = /^uzum_[a-z_]+$/.test(err?.code || '') ? err.code : 'uzum_service_unavailable';
  return res.status([403, 404, 409, 422, 503].includes(err?.status) ? err.status : 503).json({ error: code });
}
router.get('/orders', async (req, res) => {
  try { res.json(await lifecycle.list({ bucket: req.query.bucket || 'active', page: Number(req.query.page || 1), limit: Number(req.query.limit || 30) })); }
  catch (err) { error(res, err); }
});
router.get('/orders/:id', async (req, res) => {
  if (!lifecycle.ID.test(req.params.id)) return res.status(422).json({ error: 'uzum_invalid_id' });
  try { res.json({ data: await lifecycle.get(req.params.id) }); } catch (err) { error(res, err); }
});
router.post('/orders/:id/decision', async (req, res) => {
  const actor = lifecycle.readActor(req.body?.actor);
  if (!lifecycle.ID.test(req.params.id) || !actor) return res.status(422).json({ error: 'uzum_invalid_decision' });
  try {
    // The internal token identifies our backend, and the current user record
    // still authorizes the specific actor. A stale admin session is insufficient.
    const admin = await AdminView().findOne({ telegramId: actor.telegramId, role: 'admin' }).lean();
    if (!admin) return res.status(403).json({ error: 'uzum_forbidden' });
    return res.json(await lifecycle.decide(req.params.id, { action: req.body?.action, reason: req.body?.reason, actor }));
  } catch (err) { return error(res, err); }
});
module.exports = router;
