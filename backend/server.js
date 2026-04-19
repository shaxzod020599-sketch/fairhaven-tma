require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { createBot } = require('./bot/bot');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const userRoutes = require('./routes/userRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logger (dev)
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// API Routes
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/users', userRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Serve frontend static files (production)
const path = require('path');
const frontendDist = path.resolve(__dirname, '../frontend/dist');
app.use(express.static(frontendDist));

// SPA fallback — serve index.html for non-API routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, error: 'Route not found' });
  }
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Auto-seed products if empty
async function autoSeed() {
  const Product = require('./models/Product');
  const count = await Product.countDocuments();
  if (count === 0) {
    console.log('📦 Seeding products...');
    const products = [
      { name: 'Vitamin D3 2000 IU', price: 89000, category: 'vitamins', description: 'Витамин D3 для иммунитета и костей. 60 капсул.', brand: 'Solgar', isAvailable: true },
      { name: 'Vitamin C 1000mg', price: 65000, category: 'vitamins', description: 'Витамин С с шиповником. 100 таблеток.', brand: 'Now Foods', isAvailable: true },
      { name: 'B-Complex 50', price: 120000, category: 'vitamins', description: 'Комплекс витаминов группы B. 100 капсул.', brand: "Nature's Way", isAvailable: true },
      { name: 'Vitamin E 400 IU', price: 95000, category: 'vitamins', description: 'Натуральный витамин Е. 100 капсул.', brand: 'Solgar', isAvailable: true },
      { name: 'Мультивитамины для женщин', price: 185000, category: 'vitamins', description: 'Комплекс для женщин. 90 таблеток.', brand: 'Garden of Life', isAvailable: true },
      { name: 'Omega-3 Fish Oil', price: 145000, category: 'supplements', description: 'Рыбий жир Омега-3. 120 капсул.', brand: 'Nordic Naturals', isAvailable: true },
      { name: 'Magnesium Glycinate 400mg', price: 110000, category: 'supplements', description: 'Магний для нервной системы. 120 капсул.', brand: "Doctor's Best", isAvailable: true },
      { name: 'Zinc 50mg', price: 45000, category: 'supplements', description: 'Цинк для иммунитета. 100 таблеток.', brand: 'Now Foods', isAvailable: true },
      { name: 'Коллаген Type I & III', price: 195000, category: 'supplements', description: 'Коллаген для кожи и суставов. 300г.', brand: 'Sports Research', isAvailable: true },
      { name: 'Пробиотик 50 млрд', price: 165000, category: 'supplements', description: '14 штаммов пробиотиков. 30 капсул.', brand: 'Garden of Life', isAvailable: false },
      { name: 'Гиалуроновая сыворотка', price: 230000, category: 'cosmetics', description: 'Увлажняющая сыворотка. 30мл.', brand: 'The Ordinary', isAvailable: true },
      { name: 'Крем SPF 50+', price: 175000, category: 'cosmetics', description: 'Солнцезащитный крем. 50мл.', brand: 'La Roche-Posay', isAvailable: true },
      { name: 'Ретинол 0.5%', price: 280000, category: 'cosmetics', description: 'Сыворотка с ретинолом. 30мл.', brand: 'SkinCeuticals', isAvailable: true },
      { name: 'Термометр цифровой', price: 55000, category: 'parapharmaceuticals', description: 'Электронный термометр. ±0.1°C.', brand: 'Omron', isAvailable: true },
      { name: 'Тонометр автоматический', price: 450000, category: 'parapharmaceuticals', description: 'Тонометр на плечо. 60 измерений.', brand: 'Omron', isAvailable: true },
      { name: 'Ингалятор компрессорный', price: 380000, category: 'parapharmaceuticals', description: 'Небулайзер для ингаляций.', brand: 'B.Well', isAvailable: false },
      { name: 'Зубная паста отбеливающая', price: 42000, category: 'hygiene', description: 'Отбеливающая паста. 100мл.', brand: 'Sensodyne', isAvailable: true },
      { name: 'Антисептик для рук', price: 25000, category: 'hygiene', description: 'Антисептический гель. 250мл.', brand: 'Sanitelle', isAvailable: true },
      { name: 'Мицеллярная вода', price: 135000, category: 'hygiene', description: 'Для чувствительной кожи. 400мл.', brand: 'Bioderma', isAvailable: true },
      { name: 'Протеиновый коктейль', price: 295000, category: 'drinks', description: 'Протеин шоколадный. 900г.', brand: 'Optimum Nutrition', isAvailable: true },
      { name: 'Коллагеновый напиток', price: 155000, category: 'drinks', description: 'Жидкий коллаген. 500мл.', brand: 'Applied Nutrition', isAvailable: true },
      { name: 'Электролиты без сахара', price: 75000, category: 'drinks', description: 'Порошок электролитов. 30 порций.', brand: 'LMNT', isAvailable: true },
    ];
    await Product.insertMany(products);
    console.log(`✅ Seeded ${products.length} products`);
  }
}

// Start server
async function start() {
  try {
    let mongoUri = process.env.MONGO_URI;

    // Try real MongoDB first, fall back to in-memory
    try {
      await mongoose.connect(mongoUri, { dbName: 'fairhaven', serverSelectionTimeoutMS: 3000 });
      console.log('✅ MongoDB connected (external)');
    } catch (_connErr) {
      console.log('⚠️  External MongoDB unavailable, starting in-memory server...');
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongod = await MongoMemoryServer.create();
      mongoUri = mongod.getUri();
      await mongoose.connect(mongoUri, { dbName: 'fairhaven' });
      console.log('✅ MongoDB connected (in-memory)');

      // Store for shutdown
      process._mongod = mongod;
    }

    // Auto-seed
    await autoSeed();

    // Start Express
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });

    // Start Telegram Bot
    let bot = null;
    try {
      bot = createBot(process.env.TELEGRAM_BOT_TOKEN, process.env.FRONTEND_URL);
      bot.launch();
      console.log('🤖 Telegram bot launched');
    } catch (botErr) {
      console.warn('⚠️  Bot launch failed (non-critical):', botErr.message);
    }

    // Graceful shutdown
    const shutdown = async (signal) => {
      console.log(`\n${signal} received. Shutting down gracefully...`);
      if (bot) bot.stop(signal);
      await mongoose.connection.close();
      if (process._mongod) await process._mongod.stop();
      process.exit(0);
    };

    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

start();
