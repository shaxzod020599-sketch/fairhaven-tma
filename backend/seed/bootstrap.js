const User = require('../models/User');
const Setting = require('../models/Setting');

const DEFAULT_SETTINGS = [
  {
    key: 'support_phone',
    value: '+998 78 150 04 40',
    label: 'Телефон контакт-центра',
  },
  {
    key: 'support_phone_tel',
    value: '+998781500440',
    label: 'Телефон контакт-центра (tel:)',
  },
  {
    key: 'support_hours',
    value: 'Ежедневно · 9:00 – 21:00 (Asia/Tashkent)',
    label: 'Часы работы контакт-центра',
  },
  {
    key: 'free_delivery_threshold',
    value: 500000,
    label: 'Бесплатная доставка от (UZS)',
  },
  {
    key: 'delivery_city',
    value: 'Ташкент',
    label: 'Город доставки',
  },
  {
    key: 'brand_tagline',
    value: 'Официальный дилер FairHaven Health в Узбекистане',
    label: 'Брендовый слоган на главной',
  },
];

async function seedDefaultSettings() {
  for (const s of DEFAULT_SETTINGS) {
    await Setting.updateOne(
      { key: s.key },
      { $setOnInsert: { value: s.value, label: s.label } },
      { upsert: true }
    );
  }
}

// Owners that are always promoted to admin on every startup, regardless of
// whether an ADMIN_TELEGRAM_IDS env var is provided. Keep this list tiny —
// it is intentionally hard-coded so the deploy does not depend on the host
// remembering to set an env var.
const OWNER_TELEGRAM_IDS = [769874135];

async function promoteAdminsFromEnv() {
  const raw = process.env.ADMIN_TELEGRAM_IDS || '';
  const fromEnv = raw.split(/[,\s]+/).map((s) => Number(s)).filter((n) => Number.isFinite(n) && n > 0);
  const ids = Array.from(new Set([...OWNER_TELEGRAM_IDS, ...fromEnv]));
  if (!ids.length) return { promoted: 0 };
  let promoted = 0;
  for (const tgId of ids) {
    let user = await User.findOne({ telegramId: tgId });
    if (!user) {
      user = await User.create({
        telegramId: tgId,
        role: 'admin',
        registrationStep: 'done',
        consentAccepted: true,
        consentAcceptedAt: new Date(),
      });
      promoted += 1;
    } else if (user.role !== 'admin') {
      user.role = 'admin';
      await user.save();
      promoted += 1;
    }
  }
  if (promoted) console.log(`👑 Promoted ${promoted} admin(s) (owners + ADMIN_TELEGRAM_IDS)`);
  return { promoted };
}

async function ensureAtLeastOneAdmin() {
  const count = await User.countDocuments({ role: 'admin' });
  if (count > 0) return;
  // Nothing to do here but announce it — admin has to be promoted manually
  // (via env var or by calling the promote endpoint from within Mongo).
  console.warn(
    '⚠️  No admin exists. Set ADMIN_TELEGRAM_IDS=<tg-id> in .env and restart, ' +
    'or update one user\'s role to "admin" directly in MongoDB.'
  );
}

module.exports = {
  seedDefaultSettings,
  promoteAdminsFromEnv,
  ensureAtLeastOneAdmin,
};
