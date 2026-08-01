const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const admin = require('../controllers/adminController');
const upload = require('../controllers/uploadController');
const channels = require('../controllers/channelController');
const { authLimiter, uploadLimiter } = require('../middleware/rateLimit');

// Unauthenticated probe used by the panel to decide whether to show itself.
router.get('/whoami', authLimiter, admin.whoami);

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

// Customers (end-users)
router.get('/users', admin.listUsers);
router.get('/users/:telegramId', admin.getUserDetail);

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

// Sales channels (Medicalka, Uzum Tezkor)
router.get('/channels/products', channels.listProducts);
router.get('/channels/summary', channels.summary);
router.patch('/channels/products/:id/meta', channels.updateProductMeta);
router.patch('/channels/products/:id/link', channels.linkBillz);
router.patch('/channels/products/:id/:channel', channels.updateProductChannel);
router.post('/channels/bulk/:channel', channels.bulkUpdate);
router.get('/channels/billz', channels.searchBillz);
router.get('/channels/sync', channels.syncStatus);
router.post('/channels/sync', channels.triggerSync);
router.get('/channels/settings', channels.getSettings);
router.put('/channels/settings', channels.updateSettings);
// Marketplace credentials. The secret is returned once, by the POST that
// creates it, and is not stored on this side at all.
router.get('/channels/keys', channels.listKeys);
router.post('/channels/keys', channels.issueKey);
router.post('/channels/keys/:id/revoke', channels.revokeKey);

// Uploads
router.post('/uploads', uploadLimiter, upload.uploadImage);
router.get('/uploads', upload.listUploads);
router.delete('/uploads/:filename', upload.deleteUpload);

module.exports = router;
