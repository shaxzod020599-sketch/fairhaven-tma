const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/orderController');
const adminAuth = require('../middleware/adminAuth');
const telegramAuth = require('../middleware/telegramAuth');
const { requireSelf } = require('../middleware/telegramAuth');

router.post('/validate-promo', telegramAuth, ctrl.validatePromo);
router.get('/', adminAuth, ctrl.getAll);
router.get('/user/:telegramId', telegramAuth, requireSelf('telegramId'), ctrl.getByUser);
router.get('/:id', telegramAuth, ctrl.getById);
router.post('/', telegramAuth, ctrl.create);
router.post('/:id/cancel', telegramAuth, ctrl.cancelByCustomer);
router.patch('/:id/status', adminAuth, ctrl.updateStatus);

module.exports = router;
