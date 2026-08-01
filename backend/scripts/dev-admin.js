/**
 * Local harness for working on the admin panel in a normal browser.
 *
 *   npm --prefix ../frontend run build
 *   node scripts/dev-admin.js
 *   # then open the URL it prints
 *
 * The panel authenticates with Telegram's signed initData and nothing else —
 * that is deliberate, since accepting a typed Telegram id would be no proof of
 * identity. Outside Telegram there is no initData, so the panel cannot open.
 *
 * This script closes that gap honestly rather than by weakening the check: it
 * runs the backend with a throwaway bot token, signs a real initData string
 * with it, and serves the built frontend with a small Telegram stub injected.
 * The signature is verified by the same code as in production; only the token
 * doing the signing is fake.
 *
 * Everything runs against an in-memory database seeded with the sample
 * catalogue. It never touches a real one.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = 'devharness:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const ADMIN_ID = 777001;
const PORT = Number(process.env.DEV_ADMIN_PORT) || 3999;
const DIST = path.resolve(__dirname, '../../frontend/dist');

function signInitData(token, user) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AAH-dev-harness',
    user: JSON.stringify(user),
  });
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  params.append(
    'hash',
    crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex')
  );
  return params.toString();
}

/**
 * The stub is written as a file, not inlined: the production CSP forbids inline
 * scripts, and the harness should exercise the same policy the real app runs
 * under rather than a relaxed one.
 */
function injectStub(initData) {
  const indexPath = path.join(DIST, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error(`${indexPath} not found — run "npm --prefix ../frontend run build" first`);
  }

  const stub = `window.Telegram = { WebApp: {
    initData: ${JSON.stringify(initData)},
    initDataUnsafe: { user: { id: ${ADMIN_ID}, first_name: 'Dev', username: 'dev_admin' } },
    ready(){}, expand(){}, close(){},
    disableVerticalSwipes(){}, setHeaderColor(){}, setBackgroundColor(){},
    themeParams: {}, colorScheme: 'light',
    isVersionAtLeast(v){ return parseFloat(v) <= 8.0; },
    safeAreaInset: { top:0, bottom:0, left:0, right:0 },
    contentSafeAreaInset: { top:0, bottom:0, left:0, right:0 },
    onEvent(){}, offEvent(){},
    MainButton: { setText(){}, show(){}, hide(){}, onClick(){}, offClick(){},
      showProgress(){}, hideProgress(){}, enable(){}, disable(){} },
    BackButton: { show(){}, hide(){}, onClick(){}, offClick(){} },
    HapticFeedback: { impactOccurred(){}, notificationOccurred(){}, selectionChanged(){} },
    showAlert(m){ alert(m); }, showConfirm(m, cb){ cb(true); }, sendData(){},
  } };`;
  fs.writeFileSync(path.join(DIST, 'dev-telegram-stub.js'), stub);

  let html = fs.readFileSync(indexPath, 'utf8');
  if (!html.includes('dev-telegram-stub.js')) {
    // After the real telegram-web-app.js, which would otherwise overwrite it.
    html = html.replace(
      /(<script src="https:\/\/telegram\.org\/js\/telegram-web-app\.js[^"]*"><\/script>)/,
      '$1\n    <script src="/dev-telegram-stub.js"></script>'
    );
    fs.writeFileSync(indexPath, html);
  }
}

async function main() {
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const mongod = await MongoMemoryServer.create();

  process.env.MONGO_URI = mongod.getUri();
  process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
  process.env.ADMIN_TELEGRAM_IDS = String(ADMIN_ID);
  process.env.SEED_ON_EMPTY = 'true';
  process.env.NODE_ENV = 'development';
  process.env.TELEGRAM_USE_WEBHOOK = 'false';
  process.env.STOCK_RECONCILE_ENABLED = 'false';
  process.env.PORT = String(PORT);
  process.env.HOST = '127.0.0.1';
  process.env.FRONTEND_URL = `http://127.0.0.1:${PORT}`;

  const initData = signInitData(BOT_TOKEN, {
    id: ADMIN_ID, first_name: 'Dev', last_name: 'Admin', username: 'dev_admin', language_code: 'ru',
  });
  injectStub(initData);

  require('../server.js');

  await new Promise((resolve) => setTimeout(resolve, 3000));
  console.log('');
  console.log('  Admin harness ready.');
  console.log(`  Open  http://127.0.0.1:${PORT}/  →  Профиль  →  Панель управления`);
  console.log('');
  console.log('  Throwaway in-memory database, seeded sample catalogue.');
  console.log('  The Billz mirror is empty, so the Channels page will show every');
  console.log('  product as "Нет в Billz" until channel-hub has run a sync.');
  console.log('');
  console.log('  Warning: this rewrote frontend/dist/index.html to load a Telegram');
  console.log('  stub. Rebuild the frontend before deploying.');
  console.log('');
}

main().catch((err) => {
  console.error('dev-admin failed:', err.message);
  process.exit(1);
});
