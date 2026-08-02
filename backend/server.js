require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

// Some VPS hosts (e.g. this one) advertise IPv6 for api.telegram.org but
// have no working IPv6 egress, which makes node-fetch hang until ETIMEDOUT.
// Force IPv4 first for all outbound DNS lookups in this process.
require('dns').setDefaultResultOrder('ipv4first');

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { createBot } = require('./bot/bot');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const publicRoutes = require('./routes/publicRoutes');
const webRoutes = require('./routes/webRoutes');
const oferta = require('./legal/oferta');
const { FAIRHAVEN_PRODUCTS } = require('./seed/products');
const {
  seedDefaultSettings,
  promoteAdminsFromEnv,
  ensureAtLeastOneAdmin,
} = require('./seed/bootstrap');
const { UPLOAD_DIR } = require('./controllers/uploadController');
const { launchBotWithRetry, withTelegramRetry } = require('./utils/telegramRetry');
const { errorLabel, redactPath, securityHeaders } = require('./utils/http');
const { apiLimiter } = require('./middleware/rateLimit');
const stockReconciler = require('./services/stockReconciler');
const billzBridge = require('./services/billzBridge');
const webhook = require('./bot/webhook');
const {
  SURFACES,
  allowedOrigins,
  publicAdminRedirect,
  surfaceForHost,
} = require('./utils/surfaces');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const CORS_ORIGINS = allowedOrigins();

// Middleware
app.disable('x-powered-by');
app.set('query parser', 'simple');
// nginx runs on this host and forwards over loopback. Without this, every
// request looks like it comes from 127.0.0.1 and the rate limiters below would
// throttle all clients as one.
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback');
app.use(cors({
  origin(origin, callback) {
    // Non-browser/server-to-server requests carry no Origin. Browsers receive
    // CORS headers only for the three exact FairHaven surfaces.
    callback(null, !origin || CORS_ORIGINS.has(origin));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true,
}));
app.use(securityHeaders);
app.use(cookieParser());

// Reject Host-header confusion in application code, not only nginx. Direct
// loopback access remains available for local development and health probes.
app.use((req, res, next) => {
  if (surfaceForHost(req.hostname)) return next();
  if (
    process.env.NODE_ENV !== 'production'
    && ['127.0.0.1', 'localhost'].includes(String(req.hostname || '').toLowerCase())
  ) return next();
  return res.status(421).json({ success: false, error: 'host_not_allowed' });
});

// Only the two image-upload endpoints receive a base64 dataUrl body; everything
// else is small JSON. A single global 6mb limit let any unauthenticated POST
// force a 6mb parse.
const LARGE_BODY_ROUTES = new Set(['/api/admin/uploads', '/api/web/admin/upload']);
const parseSmallJson = express.json({ limit: '100kb' });
const parseLargeJson = express.json({ limit: '6mb' });
app.use((req, res, next) => {
  const parse = req.method === 'POST' && LARGE_BODY_ROUTES.has(req.path)
    ? parseLargeJson
    : parseSmallJson;
  return parse(req, res, next);
});

// Request logger (dev)
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${redactPath(req.path)}`);
  next();
});

// API Routes
// Telegram webhook. Registered ahead of the API and the SPA catch-all so an
// update never falls through to index.html, and deliberately outside the rate
// limiter: Telegram sets the delivery rate, not us, and it authenticates with
// its own secret-token header.
app.use(webhook.webhookRoute);

// Broad ceiling for every API caller. Tighter per-endpoint limits (auth,
// promo guessing, uploads) live next to the routes they protect.
app.use('/api', apiLimiter);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/web', webRoutes);

// Uploaded images (admin-added product photos) — served publicly.
app.use(
  '/uploads',
  express.static(UPLOAD_DIR, {
    maxAge: '7d',
    setHeaders: (res) => {
      res.set('Cache-Control', 'public, max-age=604800');
    },
  })
);

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
  res.json({ status: 'ok' });
});

// Public `/admin` is only a safe convenience URL. Actual admin cookies never
// exist on the public host because the browser is redirected first.
app.get(['/admin', '/admin/*'], (req, res, next) => {
  const destination = publicAdminRedirect(req.hostname, req.path);
  if (!destination) return next();
  return res.redirect(302, destination);
});

// Three standalone builds, selected by exact host. One surface can never fall
// through into another surface's assets or index.html.
const staticBySurface = new Map(SURFACES.map((surface) => [
  surface.key,
  express.static(surface.dist, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
      } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }),
]));

app.use((req, res, next) => {
  const surface = surfaceForHost(req.hostname);
  if (!surface) return next();
  return staticBySurface.get(surface.key)(req, res, next);
});

// SPA fallback — serve the selected surface index.html with no-cache.
app.get('*', (req, res) => {
  if (
    req.path.startsWith('/api') ||
    req.path.startsWith('/legal') ||
    req.path.startsWith('/uploads') ||
    req.path.startsWith(webhook.WEBHOOK_PREFIX)
  ) {
    return res.status(404).json({ success: false, error: 'Route not found' });
  }
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  const surface = surfaceForHost(req.hostname);
  if (!surface) return res.status(421).json({ success: false, error: 'host_not_allowed' });
  return res.sendFile(path.join(surface.dist, 'index.html'));
});

// Global error handler
app.use((err, _req, res, _next) => {
  // Body-parser rejections are client errors; reporting them as 500 hides a
  // misconfigured client behind a server fault.
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: 'payload_too_large' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'invalid_json' });
  }
  console.error('Unhandled error:', err?.name || 'Error', err?.code || '');
  res.status(500).json({ success: false, error: 'internal_error' });
});

// Seed an empty catalog only when explicitly asked. Never deletes anything.
//
// Opt-in rather than keyed off NODE_ENV: if the process manager does not export
// NODE_ENV=production, an environment-based check silently re-enables seeding in
// production. An empty catalog there means the connection landed somewhere
// unexpected (wrong dbName, restored volume, in-memory fallback) — writing seed
// rows on top hides the real fault and creates products with no Billz link.
async function autoSeed() {
  const Product = require('./models/Product');
  const count = await Product.countDocuments();
  if (count > 0) return;

  if (process.env.SEED_ON_EMPTY !== 'true') {
    console.warn(
      '⚠️  Catalog is empty and auto-seed is off. Verify MONGO_URI / dbName, ' +
      'or set SEED_ON_EMPTY=true to populate a fresh development database.'
    );
    return;
  }
  console.log('📦 Seeding Fairhaven products...');
  await Product.insertMany(FAIRHAVEN_PRODUCTS);
  console.log(`✅ Seeded ${FAIRHAVEN_PRODUCTS.length} products`);
}

// Start server
async function start() {
  try {
    let mongoUri = process.env.MONGO_URI;

    try {
      await mongoose.connect(mongoUri, { dbName: 'fairhaven', serverSelectionTimeoutMS: 3000 });
      console.log('✅ MongoDB connected (external)');
    } catch (_connErr) {
      if (process.env.ALLOW_IN_MEMORY_DB !== 'true') throw _connErr;
      if (process.env.NODE_ENV === 'production') {
        console.error('❌ ALLOW_IN_MEMORY_DB is set in production — refusing to start on a throwaway database.');
        throw _connErr;
      }
      console.log('⚠️  External MongoDB unavailable, starting in-memory server...');
      // devDependency: only reachable in dev/test installs.
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongod = await MongoMemoryServer.create();
      mongoUri = mongod.getUri();
      await mongoose.connect(mongoUri, { dbName: 'fairhaven' });
      console.log('✅ MongoDB connected (in-memory)');
      process._mongod = mongod;
    }

    await autoSeed();
    await seedDefaultSettings();
    await promoteAdminsFromEnv();
    await ensureAtLeastOneAdmin();

    app.listen(PORT, HOST, () => {
      console.log(`🚀 Server running on http://${HOST}:${PORT}`);
    });

    // Keeps isAvailable in step with Billz stock, approval and images. Off by
    // default until the shop has been linked — run scripts/reconcile-stock.js
    // first to see what it would change, then set STOCK_RECONCILE_ENABLED=true.
    if (process.env.STOCK_RECONCILE_ENABLED === 'true') {
      stockReconciler.startScheduler();
    }

    // Carries confirmed orders into Billz through the channel hub. Off until
    // BILLZ_BRIDGE_ENABLED and BILLZ_BRIDGE_SINCE are both set, so switching it
    // on cannot replay old orders.
    billzBridge.start();

    // Start Telegram Bot & expose to controllers via app.locals.
    let bot = null;
    let shuttingDown = false;
    try {
      if (!process.env.TELEGRAM_BOT_TOKEN) {
        console.warn('⚠️  TELEGRAM_BOT_TOKEN missing — bot disabled.');
      } else {
        bot = createBot(process.env.TELEGRAM_BOT_TOKEN, process.env.FRONTEND_URL);
        app.locals.bot = bot;

        // Telegraf fetches botInfo lazily on the first update it handles.
        // Given how unreliable egress to api.telegram.org is from this host,
        // that would put a failure-prone round-trip in front of the very first
        // message after a restart. Fetch it up front instead; the web login
        // deep-link needs the @username anyway.
        try {
          const me = await withTelegramRetry(() => bot.telegram.getMe(), { tier: 'normal' });
          bot.botInfo = me;
          app.locals.botUsername = me.username;
          console.log(`🤖 Bot username: @${me.username}`);
        } catch (err) {
          // Not fatal: Telegraf will fetch it on demand, and the deep-link can
          // fall back to the configured username.
          app.locals.botUsername = process.env.WEB_BOT_USERNAME || '';
          console.warn('[bot] could not fetch bot info at startup:', errorLabel(err));
        }

        // Prefer the webhook: this host's outbound path to api.telegram.org is
        // unreliable, and polling depends on it continuously. Falls back to
        // polling on its own if the webhook cannot be established.
        const onWebhook = await webhook.useWebhook(bot, process.env.TELEGRAM_BOT_TOKEN);
        if (!onWebhook) {
          // Telegram refuses getUpdates while a webhook is registered, so a
          // previously-set one has to go before polling can work.
          await webhook.clearWebhook(bot);
          launchBotWithRetry(bot, {
            isStopping: () => shuttingDown,
            onRetry: (err, delay) => {
              const reason = err.response?.description || err.code || err.cause?.code || 'unknown';
              console.warn(`[bot] polling retry in ${delay}ms: ${reason}`);
            },
          }).catch((err) => {
            const reason = err.response?.description || err.code || err.cause?.code || 'unknown';
            console.error(`[bot] polling stopped permanently: ${reason}`);
          });
          console.log('🤖 Telegram bot launched (long polling)');
        }
      }
    } catch (botErr) {
      console.warn('⚠️  Bot launch failed (non-critical):', botErr.message);
    }

    const shutdown = async (signal) => {
      console.log(`\n${signal} received. Shutting down gracefully...`);
      shuttingDown = true;
      try { if (bot) bot.stop(signal); } catch (_) { /* bot not started yet */ }
      await mongoose.connection.close();
      if (process._mongod) await process._mongod.stop();
      process.exit(0);
    };

    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    console.error('❌ Failed to start server:', err?.name || 'Error', err?.code || '');
    process.exit(1);
  }
}

start();
