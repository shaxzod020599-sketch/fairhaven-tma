const express = require('express');
const config = require('../../config');
const logger = require('../../logger');
const { channelLimiter, authFailureLimiter } = require('../../middleware/rateLimit');
const { issueToken, requireBearer } = require('./oauth');
const publication = require('../../yandex/publication');
const receipt = require('../../yandex/receipt');
const lifecycle = require('../../yandex/lifecycle');
const contract = require('./contract');
const S = require('./serializers');

const router = express.Router();
router.use((_req, res, next) => { res.locals.channelErrorContract = 'yandex'; next(); });
router.use(express.json({ type: ['application/json', 'application/vnd.eats.order.v2+json', 'application/vnd.eats.order.status.v1+json'], limit: '256kb' }));
router.use(authFailureLimiter);
router.use(express.urlencoded({ extended: false, limit: '16kb' }));
router.post('/security/oauth/token', channelLimiter, issueToken);
router.use(requireBearer, channelLimiter);

function fail(res, status, description) {
  // HTTP codes are provisional numeric errors until partner onboarding agrees
  // business codes. Do not expose request values or upstream diagnostics.
  return res.status(status).json([{ code: status, description }]);
}
function checkPlace(req, res) {
  if (!config.yandex.placeId) { fail(res, 500, 'Integration is not configured'); return false; }
  if (req.params.placeId !== config.yandex.placeId) { fail(res, 404, 'Place not found'); return false; }
  return true;
}
function pagination(query) {
  const value = (raw, fallback) => raw === undefined ? fallback
    : typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN;
  const limit = value(query.limit, 5000); const offset = value(query.offset, 0);
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(offset) || offset < 0
    || !Number.isSafeInteger(limit + offset)) return null;
  return { limit, offset };
}

router.get('/nomenclature/:placeId/composition', async (req, res, next) => {
  try {
    if (!checkPlace(req, res)) return;
    const page = pagination(req.query);
    if (!page) return fail(res, 400, 'Invalid pagination');
    return res.json(await publication.composition(config.yandex.placeId, page));
  } catch (err) { return next(err); }
});
router.get('/nomenclature/:placeId/availability', async (req, res, next) => {
  try {
    if (!checkPlace(req, res)) return;
    return res.json(await publication.availability(config.yandex.placeId));
  } catch (err) { return next(err); }
});
router.post('/order', async (req, res, next) => {
  try {
    if (!config.yandex.placeId) return fail(res, 500, 'Integration is not configured');
    const invalid = contract.validate(req.body);
    if (invalid) return fail(res, 400, invalid);
    if (req.body.restaurantId !== undefined && req.body.restaurantId !== config.yandex.placeId) return fail(res, 400, 'restaurantId does not match this place');
    const result = await receipt.receive(req.body, config.yandex.placeId);
    if (result.conflict) return fail(res, 400, 'eatsId already exists with a different order');
    return res.json(result);
  } catch (err) { return next(err); }
});
router.get('/order/:orderId', async (req, res, next) => {
  try {
    const record = await receipt.find(req.params.orderId);
    if (!record) return fail(res, 404, 'Order not found');
    return res.json(S.order(record));
  } catch (err) { return next(err); }
});
router.get('/order/:orderId/status', async (req, res, next) => {
  try {
    const record = await receipt.find(req.params.orderId);
    if (!record) return fail(res, 404, 'Order not found');
    return res.json(S.orderStatus(record));
  } catch (err) { return next(err); }
});

router.put('/order/:orderId/status', async (req, res, next) => {
  try {
    const invalid = contract.validateStatus(req.body);
    if (invalid) return fail(res, 400, invalid);
    // Acknowledgement means durable receipt only; never await external cleanup.
    await lifecycle.callback(req.params.orderId, req.body);
    return res.status(204).end();
  } catch (err) {
    if (err.code === 'yandex_not_found') return fail(res, 404, 'Order not found');
    return next(err);
  }
});

router.use((_req, res) => fail(res, 404, 'Unknown endpoint'));
router.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return fail(res, 400, 'Malformed JSON');
  if (err.type === 'entity.too.large') return fail(res, 413, 'Request body is too large');
  logger.error('yandex request failed');
  return fail(res, 500, 'Internal error');
});

module.exports = router;
