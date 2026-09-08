const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuthUnified');
const admin = require('../controllers/adminController');
const adminAuthController = require('../controllers/adminAuthController');
const ops = require('../controllers/adminOperationsController');
const excel = require('../controllers/excelController');
const upload = require('../controllers/uploadController');
const channels = require('../controllers/channelController');
const sales = require('../controllers/salesAnalyticsController');
const salesExport = require('../controllers/salesExportController');
const medicalka = require('../controllers/medicalkaController');
const uzum = require('../controllers/uzumController');
const {
  adminLoginLimiter,
  adminPollLimiter,
  adminExportLimiter,
  uploadLimiter,
} = require('../middleware/rateLimit');
const adminHostGate = require('../middleware/adminHostGate');
const { requireAdminHost } = require('../middleware/adminHostGate');
const adminCsrf = require('../middleware/adminCsrf');
const { requireAdminOrigin, requireSurfaceOrigin } = require('../middleware/adminCsrf');

// Defense in depth: nginx routes by hostname, but application authorization
// must not depend on proxy configuration staying perfect.
router.use(adminHostGate);

// Authentication surface. These routes still require an exact Origin for
// mutations, but cannot require a session or CSRF before a session exists.
//
// The browser handshake signs you in by showing a code to compare in the bot,
// which only the panel's own origin can drive — a Telegram web view cannot
// follow the t.me link it hands out. The Mini App uses the initData exchange
// instead, so that one route accepts either surface's own Origin.
router.post('/auth/login/start', adminLoginLimiter, requireAdminHost, requireAdminOrigin, adminAuthController.startLogin);
router.post('/auth/login/poll', adminPollLimiter, requireAdminHost, requireAdminOrigin, adminAuthController.pollLogin);
router.post('/auth/telegram', adminLoginLimiter, requireSurfaceOrigin, adminAuthController.telegramLogin);
router.post('/auth/dev', adminLoginLimiter, requireAdminHost, requireAdminOrigin, adminAuthController.devLogin);
router.get('/auth/whoami', adminAuthController.whoami);
// Compatibility alias for an already-open panel during rollout.
router.get('/whoami', adminAuthController.whoami);

// Marketplace channels configure the Billz, Uzum and Medicalka integrations and
// issue their credentials — desk work, not phone work. Refused on the Mini App
// host before a session is even looked at, so the wrong surface is turned away
// on its own merits rather than incidentally failing to authenticate.
router.use('/channels', requireAdminHost);

// Everything below requires an admin user.
router.use(adminAuth, adminCsrf);

router.post('/auth/logout', adminAuthController.logout);
router.post('/auth/sessions/revoke-all', adminAuthController.revokeAll);

router.get('/stats', admin.stats);
router.get('/dashboard', ops.dashboard);
router.get('/search', ops.search);
router.get('/activity', ops.listActivity);

// Source-led sales analytics. Exact source names are part of contract:
// fairhaven.uz, Medicalka and Uzum stay distinct; Billz remains a separate total.
router.get('/sales/summary', sales.summary);
router.get('/sales/history', sales.history);
router.get('/sales/export', adminExportLimiter, salesExport.exportSales);
router.get('/billz/summary', sales.billzSummary);
router.get('/billz/history', sales.billzHistory);
router.get('/billz/export', adminExportLimiter, salesExport.exportBillz);

// Broadcasts: draft → mandatory self-test → confirmed send.
router.get('/broadcasts', ops.listBroadcasts);
router.post('/broadcasts/preview', ops.previewBroadcast);
router.post('/broadcasts', ops.createBroadcast);
router.post('/broadcasts/:id/test', ops.testBroadcast);
router.post('/broadcasts/:id/send', ops.sendBroadcast);

// Orders
router.get('/orders', admin.listOrders);
router.get('/orders/:id', ops.getOrderDetail);
router.post('/orders/:id/transition', ops.transitionOrder);
router.post('/orders/:id/notes', ops.addOrderNote);
router.post('/orders/:id/claim', ops.claimOrder);
router.patch('/orders/:id/status', admin.updateOrderStatus);
router.post('/orders/:id/revert', admin.revertOrder);
router.get('/medicalka/approvals', medicalka.list);
router.get('/medicalka/approvals/:id', medicalka.detail);
router.post('/medicalka/approvals/:id/respond', medicalka.respond);
router.get('/medicalka/sub-orders', medicalka.listSubOrders);
router.get('/medicalka/sub-orders/:id', medicalka.detailSubOrder);
router.post('/medicalka/sub-orders/:id/status', medicalka.transitionSubOrder);
router.post('/medicalka/sub-orders/:id/cancel', medicalka.cancelSubOrder);
router.post('/medicalka/sub-orders/:id/labels', medicalka.addSubOrderLabel);
router.get('/uzum/orders', uzum.list);
router.get('/uzum/orders/:id', uzum.detail);
router.post('/uzum/orders/:id/decision', uzum.decide);

// Products
router.get('/products', admin.listProducts);
router.post('/products', admin.createProduct);
// Excel export/import must sit above the `:id` patterns so "export"/"import"
// are not captured as an id.
router.get('/products/export', excel.exportProducts);
router.post('/products/import', excel.importProducts);
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
router.patch('/users/:telegramId', ops.updateCustomer);
router.patch('/users/:telegramId/block', ops.blockCustomer);

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

// Sales channels (Medicalka, Uzum Tezkor) — host-gated above.
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
router.get('/channels/medicalka/partner', medicalka.partnerSummary);
router.put('/channels/medicalka/partner/profiles/:environment', medicalka.updatePartnerProfile);
router.post('/channels/medicalka/partner/activate', medicalka.activatePartnerProfile);
router.post('/channels/medicalka/partner/mode', medicalka.setPartnerMode);
// Marketplace credentials. The secret is returned once, by the POST that
// creates it, and is not stored on this side at all.
router.get('/channels/keys', channels.listKeys);
router.post('/channels/keys', channels.issueKey);
router.post('/channels/keys/pair', channels.issueKeyPair);
// Uzum hands us its client_id/client_secret rather than the other way round;
// this registers the pair their system will present.
router.post('/channels/keys/import', channels.importKey);
router.post('/channels/keys/:id/revoke', channels.revokeKey);

// Uploads
router.post('/uploads', uploadLimiter, upload.uploadImage);
router.get('/uploads', upload.listUploads);
router.delete('/uploads/:filename', upload.deleteUpload);

module.exports = router;
