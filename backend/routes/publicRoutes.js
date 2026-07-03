const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/publicController');
const siteContentCtrl = require('../controllers/siteContentController');

router.get('/collections', ctrl.listCollections);
router.get('/collections/:id', ctrl.getCollection);
router.get('/settings', ctrl.getSettings);
router.get('/site-content', siteContentCtrl.getPublic);

module.exports = router;
