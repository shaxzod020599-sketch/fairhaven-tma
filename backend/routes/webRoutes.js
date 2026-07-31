const express = require('express');
const router = express.Router();
const webAuthCtrl = require('../controllers/webAuthController');
const webOrderCtrl = require('../controllers/webOrderController');
const siteContentCtrl = require('../controllers/siteContentController');
const uploadCtrl = require('../controllers/uploadController');
const webAuth = require('../middleware/webAuth');
const { webAuthOptional } = require('../middleware/webAuth');
const webAdminAuth = require('../middleware/webAdminAuth');
const { authLimiter, uploadLimiter } = require('../middleware/rateLimit');

// Telegram-bot login handshake.
// `status` is deliberately not throttled here — the site polls it while the
// user is switching to Telegram; the global /api limiter still covers it.
router.post('/auth/start', authLimiter, webAuthCtrl.start);
router.get('/auth/status', webAuthCtrl.status);
router.get('/auth/me', webAuth, webAuthCtrl.me);
router.post('/auth/logout', webAuthCtrl.logout);

// Site checkout + order lookup
router.post('/orders', authLimiter, webAuthOptional, webOrderCtrl.create);
router.get('/orders/:id', webAuthOptional, webOrderCtrl.getById);
router.get('/my/orders', webAuth, webOrderCtrl.myOrders);
// Promo codes are short and guessable — this is the one endpoint where an
// attacker gains something by trying thousands of values.
router.post('/promo/validate', authLimiter, webAuthOptional, webOrderCtrl.validatePromo);

// Site admin (Telegram admins signed in through the bot handshake)
router.put('/admin/site-content', webAdminAuth, siteContentCtrl.update);
router.post('/admin/upload', webAdminAuth, uploadLimiter, uploadCtrl.uploadImage);
router.post('/admin/upload-video', webAdminAuth, uploadLimiter, uploadCtrl.uploadVideo);

module.exports = router;
