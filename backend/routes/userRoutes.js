const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/userController');

router.post('/', ctrl.getOrCreate);
router.get('/:telegramId', ctrl.getByTelegramId);
router.put('/:telegramId', ctrl.update);
router.post('/:telegramId/addresses', ctrl.addAddress);
router.delete('/:telegramId/addresses/:addressId', ctrl.removeAddress);

module.exports = router;
