const express = require('express');
const config = require('./config');
const { checkMedicalkaPartnerConfig } = require('./medicalka/configGuard');
const logger = require('./logger');
const db = require('./db');
const billz = require('./billz/client');
const botOrders = require('./core/botOrders');
const notify = require('./notify/telegram');
const BillzProduct = require('./models/BillzProduct');
const SyncLog = require('./models/SyncLog');
const { runCatalogSync, startScheduler } = require('./sync/catalog');
const medicalka = require('./medicalka/runtime');

/**
 * Channel hub.
 *
 * Runs beside the bot backend rather than inside it: Billz sync traffic and
 * marketplace requests must not be able to slow down or take out the bot, and
 * the Billz key stays scoped to this process.
 *
 * Channel adapters (Medicalka, Uzum Tezkor) mount here in later steps. For now
 * the service mirrors the Billz catalogue and exposes its own health.
 */
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback');
const jsonParser = express.json({ limit: '256kb' });
// Enabled adapters own parsing and error context. Disabled prefixes retain
// the global parser's existing behavior, including prefix lookalikes.
const uzumEnabled = config.uzum.enabled;
const yandexEnabled = config.yandex.enabled;
app.use((req, res, next) => (
  (uzumEnabled && /^\/uzum(?:\/|$)/i.test(req.path))
  || (yandexEnabled && /^\/yandex(?:\/|$)/i.test(req.path))
) ? next() : jsonParser(req, res, next));

app.use((req, _res, next) => {
  logger.debug('request', { method: req.method, path: req.path });
  next();
});

// Channel adapters. Each marketplace gets its own prefix and its own keys, so
// revoking one never affects another.
app.use('/medicalka/v1', require('./adapters/medicalka/routes'));

// Uzum's contract requires every route to answer both with and without the
// `/v1` prefix, so the same router is mounted twice rather than each route
// being declared twice. Off until UZUM_ENABLED — an unfinished integration
// should not be reachable, even behind a token.
if (config.uzum.enabled) {
  const uzum = require('./adapters/uzum/routes');
  app.use('/uzum/v1', uzum);
  app.use('/uzum', uzum);
}

if (config.yandex.enabled) {
  app.use('/yandex', require('./adapters/yandex/routes'));
}

// Service-to-service surface: catalogue sync from the panel, and bot order
// goals from the backend. Token-guarded and never proxied by nginx.
app.use('/internal', require('./routes/internal'));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'channel-hub', writeEnabled: config.billzWriteEnabled });
});

/** Deeper check: database reachable, mirror populated, last sync outcome. */
app.get('/health/detail', async (_req, res) => {
  try {
    const [mirrored, inStock, lastSync] = await Promise.all([
      BillzProduct().countDocuments({ deletedInBillz: false }),
      BillzProduct().countDocuments({ deletedInBillz: false, stock: { $gt: 0 } }),
      SyncLog().findOne({ kind: 'catalog' }).sort({ createdAt: -1 }).lean(),
    ]);
    res.json({
      status: 'ok',
      mirror: { products: mirrored, inStock },
      lastSync: lastSync && {
        at: lastSync.finishedAt,
        ok: lastSync.ok,
        seen: lastSync.seen,
        rejectedReason: lastSync.rejectedReason || undefined,
        durationMs: lastSync.durationMs,
      },
      billz: { writeEnabled: config.billzWriteEnabled, pendingRequests: billz.limiter.pending },
    });
  } catch (err) {
    logger.error('health detail failed', { err });
    res.status(500).json({ status: 'error' });
  }
});

app.use((_req, res) => res.status(404).json({ error: 'not_found' }));

app.use((err, _req, res, _next) => {
  logger.error('unhandled', { err });
  res.status(500).json({ error: 'internal_error' });
});

/**
 * Refuses to start a half-configured Uzum integration.
 *
 * Each of these surfaces as something misleading at runtime otherwise: an
 * unsigned token endpoint that answers 500 on every call, a catalogue served
 * for the wrong store, or image URLs that resolve to nothing on their side.
 */
function checkUzumConfig() {
  if (!config.uzum.enabled) return;
  const missing = [];
  if (!config.uzum.storeId) missing.push('UZUM_STORE_ID');
  if (!config.uzum.tokenSigningKey || config.uzum.tokenSigningKey.length < 32) {
    missing.push('UZUM_TOKEN_SIGNING_KEY (32+ characters)');
  }
  if (!config.publicImageBaseUrl) missing.push('PUBLIC_IMAGE_BASE_URL');
  if (missing.length) {
    throw new Error(`UZUM_ENABLED is on but ${missing.join(', ')} is not set`);
  }
}

function checkYandexConfig() {
  if (!config.yandex.enabled) return;
  const missing = [];
  if (!config.yandex.placeId.trim()) missing.push('YANDEX_PLACE_ID');
  if (config.yandex.tokenSigningKey.length < 32) missing.push('YANDEX_TOKEN_SIGNING_KEY (32+ characters)');
  if (!config.publicImageBaseUrl) missing.push('PUBLIC_IMAGE_BASE_URL');
  if (missing.length) throw new Error(`YANDEX_ENABLED is on but ${missing.join(', ')} is not set`);
}

/**
 * The /internal surface moves stock, and it is protected by three things: the
 * service binds to loopback, nginx never proxies /internal, and every request
 * carries a shared token. Binding to a public interface removes the first, so
 * the remaining two have to be worth relying on.
 */
function checkInternalExposure() {
  const loopback = ['127.0.0.1', '::1', 'localhost'].includes(config.host);
  if (loopback) return;

  if (!config.internalToken || config.internalToken.length < 32) {
    throw new Error(
      `HOST is ${config.host}, so /internal is reachable off this machine. `
      + 'CHANNEL_INTERNAL_TOKEN must be at least 32 characters before that is allowed.'
    );
  }
  logger.warn('bound to a non-loopback address — make sure nginx does not proxy /internal', {
    host: config.host,
  });
}

async function start() {
  checkUzumConfig();
  checkYandexConfig();
  checkMedicalkaPartnerConfig(config);
  // Medicalka reads pictures too, and it is on by default. Without a base URL
  // every product ships `images: []` — a partner-visible gap with no error
  // anywhere, so it is said once at boot rather than never.
  if (!config.publicImageBaseUrl) {
    logger.warn('PUBLIC_IMAGE_BASE_URL is not set — channel feeds will publish no images');
  }
  checkInternalExposure();
  await db.connect();

  // Fail fast on a bad key or a wrong shop id rather than discovering it on
  // the first sync tick.
  const shops = await billz.listShops();
  const shop = shops.find((s) => s.id === config.billz.shopId);
  if (!shop) {
    throw new Error(
      `BILLZ_SHOP_ID ${config.billz.shopId} not found among ${shops.length} shop(s) on this key`
    );
  }
  config.billz.shopName = shop.name || config.billz.shopName;

  // Channels see this as the pharmacy's `created_at`. It has to be the same
  // value on every request — leaving it undefined made the serialiser fall back
  // to "now", so a polling integrator saw the branch recreate itself each time.
  // The first sync is the oldest durable timestamp available.
  const firstSync = await SyncLog().findOne({}).sort({ createdAt: 1 }).lean();
  config.billz.shopCreatedAt = firstSync?.createdAt || new Date();

  logger.info('billz key verified', { shop: shop.name, shopId: shop.id });

  const server = app.listen(config.port, config.host, () => {
    logger.info('channel-hub listening', { host: config.host, port: config.port });
  });

  if (config.sync.runOnBoot) {
    runCatalogSync().catch((err) => logger.error('boot sync failed', { err }));
  }
  const timer = startScheduler();
  // Releases local holds on bot orders nobody acted on, so a forgotten order
  // stops keeping stock out of the marketplaces.
  const holdTimer = botOrders.startHoldSweeper();
  await medicalka.start();
  const uzumTimer = require('./uzum/notifications').start();
  const yandexCancellationTimer = require('./yandex/lifecycle').start();

  if (!notify.isConfigured()) {
    logger.warn('telegram announcements are off — marketplace orders will not appear in the channel');
  }

  const shutdown = async (signal) => {
    logger.info('shutting down', { signal });
    clearInterval(timer);
    clearInterval(holdTimer);
    if (uzumTimer) clearInterval(uzumTimer);
    if (yandexCancellationTimer) clearInterval(yandexCancellationTimer);
    medicalka.stop();
    server.close();
    await db.disconnect();
    process.exit(0);
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) {
  start().catch((err) => {
    logger.error('failed to start', { err });
    process.exit(1);
  });
}

module.exports = {
  app,
  checkInternalExposure,
  checkMedicalkaPartnerConfig: () => checkMedicalkaPartnerConfig(config),
  checkUzumConfig,
  checkYandexConfig,
  start,
};
