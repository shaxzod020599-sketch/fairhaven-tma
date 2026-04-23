require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { createBot } = require('./bot/bot');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const userRoutes = require('./routes/userRoutes');
const oferta = require('./legal/oferta');
const { FAIRHAVEN_PRODUCTS } = require('./seed/products');

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

// Legal (public oferta)
app.get('/legal/oferta-ru', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.type('html').send(oferta.render('ru'));
});
app.get('/legal/oferta-uz', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.type('html').send(oferta.render('uz'));
});
app.get('/legal/oferta', (_req, res) => {
  res.redirect('/legal/oferta-ru');
});

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

// Hashed assets (Vite generates /assets/*.{hash}.{ext}) — cache forever
app.use(
  '/assets',
  express.static(path.join(frontendDist, 'assets'), {
    maxAge: '1y',
    immutable: true,
  })
);

// Everything else (index.html, icons, manifest, etc.) — never cache HTML
app.use(
  express.static(frontendDist, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
      }
    },
  })
);

// SPA fallback — serve index.html for non-API routes with no-cache
app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/legal')) {
    return res.status(404).json({ success: false, error: 'Route not found' });
  }
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Auto-seed products if empty — also overwrites if SEED_REFRESH=true
async function autoSeed() {
  const Product = require('./models/Product');
  const count = await Product.countDocuments();
  if (count === 0 || process.env.SEED_REFRESH === 'true') {
    if (count > 0) {
      console.log('🗑  Clearing existing products for refresh...');
      await Product.deleteMany({});
    }
    console.log('📦 Seeding FairHaven products...');
    await Product.insertMany(FAIRHAVEN_PRODUCTS);
    console.log(`✅ Seeded ${FAIRHAVEN_PRODUCTS.length} products`);
  }
}

// Start server
async function start() {
  try {
    let mongoUri = process.env.MONGO_URI;

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
      process._mongod = mongod;
    }

    await autoSeed();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });

    // Start Telegram Bot & expose to controllers via app.locals.
    let bot = null;
    try {
      if (!process.env.TELEGRAM_BOT_TOKEN) {
        console.warn('⚠️  TELEGRAM_BOT_TOKEN missing — bot disabled.');
      } else {
        bot = createBot(process.env.TELEGRAM_BOT_TOKEN, process.env.FRONTEND_URL);
        app.locals.bot = bot;
        bot.launch();
        console.log('🤖 Telegram bot launched');
      }
    } catch (botErr) {
      console.warn('⚠️  Bot launch failed (non-critical):', botErr.message);
    }

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
