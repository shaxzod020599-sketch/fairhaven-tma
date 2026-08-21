const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

/**
 * Configuration is read once at startup and validated eagerly, so a missing
 * secret fails the process instead of surfacing as a confusing 401 hours later.
 */

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required in channel/.env`);
  return value;
}

function number(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got "${raw}"`);
  return n;
}

function bool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true';
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: number('PORT', 3100),
  host: process.env.HOST || '127.0.0.1',

  mongoUri: required('MONGO_URI'),
  // Same database as the bot backend so the admin panel can read and write
  // channel settings directly. This service only ever touches its own
  // collections — see db.js for the guard that enforces it.
  dbName: process.env.MONGO_DB_NAME || 'fairhaven',

  billz: {
    baseUrl: process.env.BILLZ_BASE_URL || 'https://api-admin.billz.ai',
    secretToken: required('BILLZ_SECRET_TOKEN'),
    shopId: required('BILLZ_SHOP_ID'),
    cashboxId: process.env.BILLZ_CASHBOX_ID || '',
    // Channel sales settle by transfer, not cash. Recording them under the
    // wrong type corrupts till reconciliation rather than just mislabelling a
    // row, so there is no default — GET /v1/company-payment-type lists the real
    // ids for this company.
    paymentTypeId: process.env.BILLZ_PAYMENT_TYPE_ID || '',
    // Redundant with the id, and present in every documented example of the
    // payment call. Sent when set, because that call cannot be rehearsed: a
    // refused payment leaves an order reserved but unsold.
    paymentTypeName: process.env.BILLZ_PAYMENT_TYPE_NAME || '',
    // Shown to channels as the pharmacy/branch name. Overwritten at boot with
    // the name Billz reports for BILLZ_SHOP_ID.
    shopName: process.env.BILLZ_SHOP_NAME || 'Fairhaven Health',
    // Reported to channels as the branch creation date. Must be stable across
    // requests; server.js pins it to the first sync at boot.
    shopCreatedAt: null,
    // Billz allows 2 requests/second per IP and blocks bursty traffic
    // heuristically. Staying under the documented ceiling is deliberate.
    requestsPerSecond: number('BILLZ_RPS', 1.5),
    pageSize: number('BILLZ_PAGE_SIZE', 100),
    timeoutMs: number('BILLZ_TIMEOUT_MS', 20000),
  },

  // Fairhaven's own bot and mini app are a sales channel like any other: the
  // same reservation, the same counters, the same order record. What differs is
  // when Billz is told — an operator confirms in the Telegram channel first.
  bot: {
    channel: 'fairhaven-bot',
    // How long an unconfirmed order keeps stock out of the marketplaces.
    holdTtlMs: number('BOT_HOLD_TTL_MS', 2 * 60 * 60 * 1000),
    holdSweepMs: number('BOT_HOLD_SWEEP_MS', 60 * 1000),
  },

  // Order cards posted to the Telegram channel. Read-only announcements from
  // this service: it never accepts commands from Telegram, so a compromised
  // channel cannot move stock.
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    ordersChannelId: process.env.ORDERS_CHANNEL_ID || '',
    enabled: bool('CHANNEL_TELEGRAM_ENABLED', true),
  },

  medicalkaPartner: {
    enabled: bool('MEDICALKA_INBOUND_ENABLED', false),
    baseUrl: process.env.MEDICALKA_PARTNER_BASE_URL || 'https://api.medicalka.com/api/v1',
    username: process.env.MEDICALKA_PARTNER_USERNAME || '',
    password: process.env.MEDICALKA_PARTNER_PASSWORD || '',
    pollMs: number('MEDICALKA_APPROVAL_POLL_MS', 5000),
    historyPollMs: number('MEDICALKA_HISTORY_POLL_MS', 60000),
    timeoutMs: number('MEDICALKA_PARTNER_TIMEOUT_MS', 8000),
    maxResponseBytes: number('MEDICALKA_PARTNER_MAX_RESPONSE_BYTES', 1024 * 1024),
  },

  // Uzum Tezkor (Yandex Eats family). We are the provider: they authenticate
  // against us, poll our catalogue and post orders to us.
  uzum: {
    enabled: bool('UZUM_ENABLED', false),
    // Their identifier for our branch. Sent as a path segment on every
    // nomenclature call and checked, so a misconfigured integration fails
    // loudly instead of serving another shop's catalogue.
    storeId: process.env.UZUM_STORE_ID || '',
    // Signs the bearer tokens we issue. No default on purpose — a shared
    // default would mean a token minted against any deployment is accepted here.
    tokenSigningKey: process.env.UZUM_TOKEN_SIGNING_KEY || '',
  },

  // Marketplaces need two tax codes per product for the fiscal receipt: the
  // MXIK (what the product is) and the package code (the unit it is sold in).
  // Billz carries neither, so they live with us. A product without its own
  // falls back to these, and an operator overrides both from the panel.
  defaultMxikCode: process.env.DEFAULT_MXIK_CODE || '02106999028000000',
  defaultPackageCode: process.env.DEFAULT_PACKAGE_CODE || '1490779',

  // Where the bot backend writes uploaded product images. Read-only here, and
  // only to hash them: Uzum wants a hash per image, and a hash that does not
  // describe the bytes is worse than none.
  // Public base for product images. Billz forbids serving media from their CDN,
  // so every channel that shows a picture is handed one of ours. Shop-wide, not
  // per-channel: the same file backs the same product on every marketplace.
  publicImageBaseUrl: process.env.PUBLIC_IMAGE_BASE_URL || '',

  uploadsDir: process.env.UPLOADS_DIR
    || path.resolve(__dirname, '../../backend/uploads'),

  // Shared with the bot backend for loopback service-to-service calls.
  internalToken: process.env.CHANNEL_INTERNAL_TOKEN || '',

  sync: {
    intervalMs: number('SYNC_INTERVAL_MS', 5 * 60 * 1000),
    // Guard rail: a sync that suddenly sees far fewer products than last time
    // usually means a partial Billz response, not a real catalogue change.
    // Below this ratio the run is rejected instead of marking stock as gone.
    minCatalogRatio: number('SYNC_MIN_CATALOG_RATIO', 0.5),
    runOnBoot: bool('SYNC_ON_BOOT', true),
  },

  // Writing sales back into Billz stays off until the integration key has the
  // order methods enabled and the flow has been exercised against test data.
  billzWriteEnabled: bool('BILLZ_WRITE_ENABLED', false),
};

module.exports = config;
