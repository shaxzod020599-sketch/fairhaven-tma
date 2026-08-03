/**
 * Local stand-in for channel-hub.
 *
 * The Billz and Sales screens read their numbers from channel-hub, which owns
 * the Billz credentials and therefore cannot run on a laptop. Without it those
 * pages render only their empty state, so they cannot be designed or reviewed
 * locally. This serves the same read-only analytics shapes the real hub serves,
 * with figures in the same order of magnitude as production.
 *
 * Development only — it is started by scripts/dev-local.js and never shipped.
 */
const http = require('node:http');

const PORT = Number(process.env.DEV_HUB_PORT || 3199);
const TOKEN = process.env.CHANNEL_INTERNAL_TOKEN || 'dev-internal-token';

const INVENTORY = {
  inventory: {
    physicalUnits: 1512,
    reservedUnits: 24,
    pendingUnits: 6,
    sellableUnits: 1482,
    estimatedRetailValue: 544311000,
    skuCount: 28,
    zeroStockSkuCount: 2,
    lowStockSkuCount: 7,
    freshness: 'fresh',
    lowStock: [
      { billzProductId: 'demo-1', name: 'Fairhaven FH PRO Fertility Multivitamin for Men, №180', sellableUnits: 0 },
      { billzProductId: 'demo-2', name: 'Fairhaven Myo + D-Chiro Inositol, №120', sellableUnits: 0 },
      { billzProductId: 'demo-3', name: 'Fairhaven FertileCM, №90', sellableUnits: 1 },
      { billzProductId: 'demo-4', name: 'Fairhaven Menopause Multivitamin Essentials, №30', sellableUnits: 2 },
      { billzProductId: 'demo-5', name: 'Fairhaven OvaBoost, №120', sellableUnits: 3 },
    ],
  },
  generatedAt: new Date().toISOString(),
};

// Mirrors production, where Billz has not granted report access yet: the panel
// must show that honestly instead of inventing revenue.
const CAPABILITY = {
  state: 'report_access_required',
  checkedAt: new Date().toISOString(),
  reason: 'billz_report_permission_denied',
};

const ROUTES = {
  '/health': { status: 'ok', service: 'channel-hub-dev-fixture' },
  '/internal/analytics/billz/inventory': INVENTORY,
  '/internal/analytics/billz/capability': CAPABILITY,
};

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  const body = ROUTES[path];

  if (path.startsWith('/internal') && req.headers['x-internal-token'] !== TOKEN) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'unauthorized' }));
  }
  if (!body) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'not_found' }));
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify(body));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`🧪 dev channel-hub fixture on http://127.0.0.1:${PORT}`);
});

module.exports = server;
