const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/userController');
const telegramAuth = require('../middleware/telegramAuth');
const { requireSelf } = require('../middleware/telegramAuth');

router.post('/', telegramAuth, ctrl.getOrCreate);
router.get('/:telegramId', telegramAuth, requireSelf('telegramId'), ctrl.getByTelegramId);
router.put('/:telegramId', telegramAuth, requireSelf('telegramId'), ctrl.update);
router.post('/:telegramId/addresses', telegramAuth, requireSelf('telegramId'), ctrl.addAddress);
router.delete('/:telegramId/addresses/:addressId', telegramAuth, requireSelf('telegramId'), ctrl.removeAddress);

module.exports = router;
