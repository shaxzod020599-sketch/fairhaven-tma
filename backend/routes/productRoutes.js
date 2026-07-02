const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/productController');
const adminAuth = require('../middleware/adminAuth');

router.get('/', ctrl.getAll);
router.get('/popular', ctrl.getPopular);
router.get('/categories', ctrl.getCategories);
router.get('/:id', ctrl.getById);
router.post('/', adminAuth, ctrl.create);
router.put('/:id', adminAuth, ctrl.update);
router.delete('/:id', adminAuth, ctrl.remove);
router.patch('/:id/toggle-availability', adminAuth, ctrl.toggleAvailability);

module.exports = router;
