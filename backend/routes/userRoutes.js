const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/userController');
const { createRateLimiter } = require('../utils/rateLimit');

const userReadLimiter = createRateLimiter({ windowMs: 60_000, max: 120 });
const userWriteLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });

router.post('/', userWriteLimiter, ctrl.getOrCreate);
router.get('/:telegramId', userReadLimiter, ctrl.getByTelegramId);
router.put('/:telegramId', userWriteLimiter, ctrl.update);
router.post('/:telegramId/addresses', userWriteLimiter, ctrl.addAddress);
router.delete('/:telegramId/addresses/:addressId', userWriteLimiter, ctrl.removeAddress);

module.exports = router;
