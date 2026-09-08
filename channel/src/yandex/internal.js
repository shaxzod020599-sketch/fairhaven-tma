const express = require('express');
const lifecycle = require('./lifecycle');
const picking = require('./picking');
const AdminView = require('../models/AdminView');
const router = express.Router();
function error(res, err) {
  const code = /^yandex_[a-z_]+$/.test(err?.code || '') ? err.code : 'yandex_service_unavailable';
  return res.status([403, 404, 409, 422, 503].includes(err?.status) ? err.status : 503).json({ error: code });
}
function query(req, keys) {
  if (Object.keys(req.query).some((key) => !keys.includes(key) || typeof req.query[key] !== 'string' || req.query[key].length > 120)) {
    throw Object.assign(new Error('yandex_invalid_query'), { code: 'yandex_invalid_query', status: 422 });
  }
  const number = (key, fallback) => req.query[key] === undefined ? fallback : /^\d+$/.test(req.query[key]) ? Number(req.query[key]) : NaN;
  return { ...(req.query.bucket === undefined ? {} : { bucket: req.query.bucket }),
    search: req.query.search || '', page: number('page', 1), limit: number('limit', 30) };
}
router.get('/orders', async (req, res) => {
  try { res.json(await lifecycle.list(query(req, ['bucket', 'page', 'limit']))); } catch (err) { error(res, err); }
});
router.get('/products', async (req, res) => {
  try { res.json(await picking.products(query(req, ['search', 'limit']))); } catch (err) { error(res, err); }
});
router.get('/orders/:id', async (req, res) => {
  if (!lifecycle.ID.test(req.params.id)) return res.status(422).json({ error: 'yandex_invalid_id' });
  try { return res.json({ data: await lifecycle.get(req.params.id) }); } catch (err) { return error(res, err); }
});
async function mutate(req, res, kind) {
  const body = req.body;
  const keys = kind === 'decision' ? ['action', 'reason', 'expectedRevision', 'expectedItemsRevision', 'actor']
    : ['items', 'expectedItemsRevision', 'reason', 'actor'];
  const actor = lifecycle.readActor(body?.actor);
  if (!lifecycle.ID.test(req.params.id) || !actor || !body || Array.isArray(body)
    || Object.keys(body).some((key) => !keys.includes(key)) || Buffer.byteLength(JSON.stringify(body)) > 32768) {
    return res.status(422).json({ error: 'yandex_invalid_request' });
  }
  try {
    // Internal token authenticates the backend; current persisted role authorizes its actor.
    const admin = await AdminView().findOne({ telegramId: actor.telegramId, role: 'admin' }).lean();
    if (!admin) return res.status(403).json({ error: 'yandex_forbidden' });
    return res.json(await (kind === 'decision' ? lifecycle.decide : lifecycle.updateItems)(req.params.id, { ...body, actor }));
  } catch (err) { return error(res, err); }
}
router.post('/orders/:id/decision', (req, res) => mutate(req, res, 'decision'));
router.put('/orders/:id/items', (req, res) => mutate(req, res, 'items'));
module.exports = router;
