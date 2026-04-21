const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/orderController');
const { createRateLimiter } = require('../utils/rateLimit');

const orderReadLimiter = createRateLimiter({ windowMs: 60_000, max: 120 });
const orderWriteLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });

router.get('/', orderReadLimiter, ctrl.getAll);
router.get('/user/:telegramId', orderReadLimiter, ctrl.getByUser);
router.get('/:id', orderReadLimiter, ctrl.getById);
router.post('/', orderWriteLimiter, ctrl.create);
router.patch('/:id/status', orderWriteLimiter, ctrl.updateStatus);

module.exports = router;
