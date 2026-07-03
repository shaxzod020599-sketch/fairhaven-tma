const express = require('express');
const router = express.Router();
const webAuthCtrl = require('../controllers/webAuthController');
const webOrderCtrl = require('../controllers/webOrderController');
const siteContentCtrl = require('../controllers/siteContentController');
const uploadCtrl = require('../controllers/uploadController');
const webAuth = require('../middleware/webAuth');
const { webAuthOptional } = require('../middleware/webAuth');
const webAdminAuth = require('../middleware/webAdminAuth');

// Telegram-bot login handshake
router.post('/auth/start', webAuthCtrl.start);
router.get('/auth/status', webAuthCtrl.status);
router.get('/auth/me', webAuth, webAuthCtrl.me);
router.post('/auth/logout', webAuthCtrl.logout);

// Site checkout + order lookup
router.post('/orders', webAuthOptional, webOrderCtrl.create);
router.get('/orders/:id', webAuthOptional, webOrderCtrl.getById);
router.get('/my/orders', webAuth, webOrderCtrl.myOrders);
router.post('/promo/validate', webAuthOptional, webOrderCtrl.validatePromo);

// Site admin (Telegram admins signed in through the bot handshake)
router.put('/admin/site-content', webAdminAuth, siteContentCtrl.update);
router.post('/admin/upload', webAdminAuth, uploadCtrl.uploadImage);

module.exports = router;
