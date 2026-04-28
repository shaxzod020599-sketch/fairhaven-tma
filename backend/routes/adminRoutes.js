const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const admin = require('../controllers/adminController');
const upload = require('../controllers/uploadController');

router.get('/whoami', admin.whoami);

// Everything below requires an admin user.
router.use(adminAuth);

router.get('/stats', admin.stats);

// Orders
router.get('/orders', admin.listOrders);
router.patch('/orders/:id/status', admin.updateOrderStatus);
router.post('/orders/:id/revert', admin.revertOrder);

// Products
router.get('/products', admin.listProducts);
router.post('/products', admin.createProduct);
router.patch('/products/:id', admin.updateProduct);
router.delete('/products/:id', admin.deleteProduct);
router.patch('/products/:id/toggle', admin.toggleProductAvailability);

// Admins
router.get('/admins', admin.listAdmins);
router.post('/admins', admin.promoteAdmin);
router.delete('/admins/:telegramId', admin.demoteAdmin);

// Collections (podborka)
router.get('/collections', admin.listCollections);
router.post('/collections', admin.createCollection);
router.patch('/collections/:id', admin.updateCollection);
router.delete('/collections/:id', admin.deleteCollection);

// Settings
router.get('/settings', admin.listSettings);
router.put('/settings', admin.upsertSetting);
router.delete('/settings/:key', admin.deleteSetting);

// Promo codes
router.get('/promos', admin.listPromos);
router.post('/promos', admin.createPromo);
router.patch('/promos/:id', admin.updatePromo);
router.delete('/promos/:id', admin.deletePromo);
router.patch('/promos/:id/toggle', admin.togglePromo);

// Uploads
router.post('/uploads', upload.uploadImage);
router.get('/uploads', upload.listUploads);
router.delete('/uploads/:filename', upload.deleteUpload);

module.exports = router;
