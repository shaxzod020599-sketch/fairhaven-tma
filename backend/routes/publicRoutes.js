const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/publicController');

router.get('/collections', ctrl.listCollections);
router.get('/collections/:id', ctrl.getCollection);
router.get('/settings', ctrl.getSettings);

module.exports = router;
