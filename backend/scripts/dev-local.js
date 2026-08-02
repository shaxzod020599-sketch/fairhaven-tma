/**
 * Local development runner: in-memory MongoDB, seeded demo data, no bot.
 *
 * Env is pinned BEFORE server.js loads dotenv — dotenv never overwrites keys
 * that already exist, so the root .env (real bot token, real Mongo) stays
 * untouched and unused here. TELEGRAM_BOT_TOKEN is pinned empty on purpose:
 * a local server polling with the production token would steal updates from
 * the production bot.
 *
 *   node scripts/dev-local.js        # backend on http://localhost:3001
 */
process.env.NODE_ENV = 'development';
process.env.PORT = process.env.DEV_PORT || '3001';
process.env.HOST = '127.0.0.1';
process.env.MONGO_URI = 'mongodb://127.0.0.1:59999/force-fallback';
process.env.ALLOW_IN_MEMORY_DB = 'true';
process.env.SEED_ON_EMPTY = 'true';
process.env.ADMIN_DEV_BYPASS = '1';
process.env.ADMIN_TELEGRAM_IDS = '10001';
process.env.WEB_JWT_SECRET = 'dev-only-secret-not-for-prod';
process.env.ADMIN_ORIGIN = 'http://admin.localhost:5173';
process.env.ADMIN_CSRF_SECRET = 'dev-only-admin-csrf-secret-not-for-production';
process.env.TELEGRAM_BOT_TOKEN = '';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.TELEGRAM_USE_WEBHOOK = '';
process.env.STOCK_RECONCILE_ENABLED = '';
process.env.BILLZ_BRIDGE_ENABLED = '';
process.env.CHANNEL_HUB_URL = '';

const mongoose = require('mongoose');

async function seedDemo() {
  const Product = require('../models/Product');
  const Order = require('../models/Order');
  const User = require('../models/User');
  const PromoCode = require('../models/PromoCode');

  if (await Order.countDocuments()) return;

  const products = await Product.find().limit(6);
  if (!products.length) {
    console.warn('demo seed: no products yet, skipping');
    return;
  }

  const customers = await User.insertMany([
    { telegramId: 20001, firstName: 'Dilnoza', lastName: 'Karimova', username: 'dilnoza_k', phone: '+998901112233', registrationStep: 'done', consentAccepted: true },
    { telegramId: 20002, firstName: 'Bekzod', lastName: 'Tashkentov', username: 'bek_t', phone: '+998935556677', registrationStep: 'done', consentAccepted: true },
    { telegramId: 20003, firstName: 'Malika', lastName: 'Yusupova', username: '', phone: '+998977778899', registrationStep: 'done', consentAccepted: true },
  ]);

  const statuses = ['pending', 'pending', 'confirmed', 'preparing', 'delivering', 'delivered', 'delivered', 'cancelled'];
  const orders = statuses.map((status, i) => {
    const p = products[i % products.length];
    const qty = (i % 2) + 1;
    const c = customers[i % customers.length];
    return {
      userId: c._id,
      telegramId: c.telegramId,
      items: [{ productId: p._id, name: p.name, price: p.price, quantity: qty }],
      subtotal: p.price * qty,
      deliveryFee: 20000,
      totalAmount: p.price * qty + 20000,
      status,
      location: { lat: 41.31, lng: 69.28, addressString: `Ташкент, Чиланзар ${i + 1}-кв, дом ${i + 3}` },
      customerName: `${c.firstName} ${c.lastName}`.trim(),
      customerPhone: c.phone,
      paymentMethod: i % 3 === 0 ? 'card' : 'cash',
      notes: i === 1 ? 'Позвонить за час до доставки' : '',
      createdAt: new Date(Date.now() - i * 5 * 60 * 60 * 1000),
    };
  });
  await Order.insertMany(orders);

  await PromoCode.insertMany([
    { code: 'WELCOME15', discountType: 'percentage', discountValue: 15, isActive: true, maxUses: 200, usedCount: 12, firstOrderOnly: true },
    { code: 'SUMMER10', discountType: 'percentage', discountValue: 10, isActive: true, maxUses: 100, usedCount: 47 },
  ]).catch((e) => console.warn('demo seed promos:', e.message));

  const billzDocs = products.map((p, i) => ({
    billzProductId: `demo-billz-${i + 1}`,
    name: p.name,
    sku: `FH-${1000 + i}`,
    barcode: `48700000000${i}`,
    brandName: 'Fairhaven Health',
    categoryName: 'Vitamins',
    measurementUnit: 'pcs',
    retailPrice: p.price,
    promoPrice: 0,
    stock: 5 + i * 7,
    reservedQty: i % 3,
    pendingQty: 0,
    deletedInBillz: false,
    syncedAt: new Date(),
  }));
  billzDocs.push(
    { billzProductId: 'demo-billz-90', name: 'OvaBoost for Women', sku: 'FH-2090', barcode: '4870000000090', brandName: 'Fairhaven Health', categoryName: 'Fertility', measurementUnit: 'pcs', retailPrice: 450000, stock: 14, reservedQty: 0, pendingQty: 0, deletedInBillz: false, syncedAt: new Date() },
    { billzProductId: 'demo-billz-91', name: 'FertilAid for Men', sku: 'FH-2091', barcode: '4870000000091', brandName: 'Fairhaven Health', categoryName: 'Fertility', measurementUnit: 'pcs', retailPrice: 520000, stock: 3, reservedQty: 1, pendingQty: 0, deletedInBillz: false, syncedAt: new Date() },
  );
  await mongoose.connection.collection('billzproducts').insertMany(billzDocs);

  console.log(`🌱 Demo seed: ${orders.length} orders, ${customers.length} customers, ${billzDocs.length} billz mirror rows`);
}

mongoose.connection.on('connected', () => {
  // server.js runs its own seeding right after connect; give it a beat.
  setTimeout(() => {
    seedDemo().catch((e) => console.error('demo seed failed:', e.message));
  }, 1500);
});

require('../server');
