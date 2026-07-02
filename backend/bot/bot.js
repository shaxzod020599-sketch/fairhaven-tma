const crypto = require('crypto');
const { Telegraf, Markup } = require('telegraf');
const User = require('../models/User');
const Order = require('../models/Order');
const WebLoginToken = require('../models/WebLoginToken');
const { formatOrderReceipt } = require('../utils/helpers');
const { errorLabel } = require('../utils/http');
const {
  acceptConsent,
  applyVerifiedContact,
  escapeRegistrationName,
  syncRegistrationUser,
} = require('../utils/registration');
const { withTelegramRetry } = require('../utils/telegramRetry');

// Fairhaven channel — orders are sent here for operator approval.
// Override via ORDERS_CHANNEL_ID env var if needed.
const ORDERS_CHANNEL_ID = process.env.ORDERS_CHANNEL_ID;

// -----------------------------------------------------------------------------
// Copy (bilingual: RU + UZ)
// -----------------------------------------------------------------------------
const T = {
  welcome: (name) =>
    `🌿 <b>Assalomu alaykum, ${name}!</b>\n` +
    `🌿 <b>Здравствуйте, ${name}!</b>\n\n` +
    `<b>Fairhaven Health</b> — O‘zbekistondagi rasmiy diler. Fertillik, homiladorlik va emizish uchun AQSh mahsulotlari.\n` +
    `<i>Официальный дилер Fairhaven Health в Узбекистане. Фертильность, беременность, лактация — оригинальная продукция из США.</i>\n\n` +
    `Do‘konga kirish uchun qisqa ro‘yxatdan o‘ting.\n` +
    `Чтобы открыть магазин — короткая регистрация.`,

  askName:
    `1️⃣ <b>Ismingizni kiriting / Введите имя</b>\n\n` +
    `<i>Masalan: Javlon / Например: Александр</i>`,

  askSurname:
    `2️⃣ <b>Familiyangizni kiriting / Введите фамилию</b>\n\n` +
    `<i>Masalan: Karimov / Например: Петров</i>`,

  askYear:
    `3️⃣ <b>Tug‘ilgan yilingizni yozing / Укажите год рождения</b>\n\n` +
    `<i>Masalan: 1995 / Например: 1990</i>\n` +
    `<i>4 ta raqam / 4 цифры</i>`,

  invalidName:
    `⚠️ Iltimos, ismingizni to‘g‘ri kiriting (faqat harflar).\n` +
    `⚠️ Введите корректное имя (только буквы).`,

  invalidYear: (min, max) =>
    `⚠️ Yil ${min}–${max} oralig‘ida bo‘lishi kerak.\n` +
    `⚠️ Год должен быть в диапазоне ${min}–${max}.`,

  askGender:
    `4️⃣ <b>Jinsingiz / Ваш пол</b>`,

  askPhone:
    `1️⃣ <b>Telefon raqamingizni yuboring / Отправьте номер телефона</b>\n\n` +
    `Pastdagi tugmani bosing — raqam avtomatik yuboriladi.\n` +
    `Нажмите кнопку ниже — номер отправится автоматически.`,

  askConsent: (frontendUrl, brandName) =>
    `2️⃣ <b>Shaxsga doir ma’lumotlarga rozilik / Согласие на обработку данных</b>\n\n` +
    `${brandName} buyurtmalaringizni qayta ishlash uchun ma’lumotlaringizdan foydalanadi.\n` +
    `${brandName} использует ваши данные для обработки заказов.\n\n` +
    `Quyidagi ommaviy oferta bilan tanishing:\n` +
    `Ознакомьтесь с публичной офертой:\n\n` +
    `🇺🇿 ${frontendUrl}/legal/oferta-uz\n` +
    `🇷🇺 ${frontendUrl}/legal/oferta-ru\n\n` +
    `Davom etish uchun tasdiqlang / Для продолжения — подтвердите.`,

  registered: (name) =>
    `✅ <b>Tabriklaymiz, ${name}!</b> Ro‘yxatdan o‘tdingiz.\n` +
    `✅ <b>Готово, ${name}!</b> Регистрация завершена.\n\n` +
    `Endi do‘konni ochishingiz mumkin 👇\n` +
    `Теперь магазин доступен 👇`,

  alreadyRegistered: (name) =>
    `🌿 <b>Xush kelibsiz, ${name}!</b>\n` +
    `🌿 <b>С возвращением, ${name}!</b>\n\n` +
    `Do‘konni oching / Откройте магазин 👇`,

  openShop: '🛒 Do‘konni ochish / Открыть магазин',
  sendPhone: '📞 Raqamni yuborish / Отправить номер',
  readOferta: '📄 Oferta bilan tanishish / Прочитать оферту',
  acceptConsent: '✅ Roziman / Согласен с условиями',
  male: '👨 Erkak / Мужской',
  female: '👩 Ayol / Женский',

  orderApproved: (shortId) =>
    `✅ <b>Ваш заказ принят!</b>\n\n` +
    `📋 Номер заказа: <b>#${shortId}</b>\n\n` +
    `Мы приняли ваш заказ и скоро доставим его вам. ` +
    `Курьер свяжется с вами по указанному номеру телефона.\n\n` +
    `Спасибо, что выбрали Fairhaven Health. 🌿`,

  orderRejected: (shortId) =>
    `❌ <b>Заказ отменён</b>\n\n` +
    `📋 Номер заказа: <b>#${shortId}</b>\n\n` +
    `К сожалению, оператор не смог принять этот заказ. ` +
    `Для уточнения деталей обратитесь в наш контакт-центр:\n` +
    `📞 ${process.env.SUPPORT_PHONE || '+998 78 150 04 40'}`,
};

function shortOrderId(order) {
  return order._id.toString().slice(-6).toUpperCase();
}

// -----------------------------------------------------------------------------
// Web-site login handshake (t.me/<bot>?start=web_<token>)
// -----------------------------------------------------------------------------
const WEB_LOGIN_PAYLOAD_RE = /^web_([A-Za-z0-9_-]{20,64})$/;

function hashWebToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/** Marks a pending web login token as ready for the given Telegram user. */
async function claimWebLoginToken(tokenHash, telegramId) {
  if (!tokenHash) return false;
  const doc = await WebLoginToken.findOneAndUpdate(
    { tokenHash, status: 'pending', expiresAt: { $gt: new Date() } },
    { status: 'ready', telegramId, claimedAt: new Date() },
    { new: true }
  );
  return Boolean(doc);
}

function webLoginSuccessText() {
  return (
    `🌐 <b>Saytga kirish tasdiqlandi! / Вход на сайт подтверждён!</b>\n\n` +
    `Endi sayt yorlig‘iga qayting — hisobingiz ochiladi.\n` +
    `Вернитесь на вкладку сайта — ваш аккаунт уже активен.`
  );
}

function webLoginExpiredText() {
  return (
    `⌛️ <b>Kirish havolasi eskirgan / Ссылка для входа устарела</b>\n\n` +
    `Saytdagi «Telegram orqali kirish» tugmasini qayta bosing.\n` +
    `Нажмите кнопку «Войти через Telegram» на сайте ещё раз.`
  );
}

/**
 * Handles a /start deep-link coming from the web site.
 * Returns true when the payload was a web-login token (message already sent).
 */
async function handleWebLoginPayload(ctx, user) {
  const payload = (ctx.startPayload || '').toString();
  const match = payload.match(WEB_LOGIN_PAYLOAD_RE);
  if (!match) return false;

  const tokenHash = hashWebToken(match[1]);

  if (user.isRegistered()) {
    const claimed = await claimWebLoginToken(tokenHash, user.telegramId);
    await ctx.replyWithHTML(claimed ? webLoginSuccessText() : webLoginExpiredText());
    return true;
  }

  // Not registered yet — remember the token and finish it after consent.
  user.pendingWebLoginToken = tokenHash;
  await user.save();
  await ctx.replyWithHTML(
    `🌐 Saytga kirish uchun avval qisqa ro‘yxatdan o‘ting.\n` +
    `🌐 Для входа на сайт сначала пройдите короткую регистрацию.`
  );
  return true;
}

/** Called right after registration completes — finishes a stored web login. */
async function finishPendingWebLogin(ctx, user) {
  if (!user.pendingWebLoginToken) return;
  const tokenHash = user.pendingWebLoginToken;
  user.pendingWebLoginToken = '';
  await user.save();
  const claimed = await claimWebLoginToken(tokenHash, user.telegramId);
  if (claimed) {
    await ctx.replyWithHTML(webLoginSuccessText());
  }
}

// -----------------------------------------------------------------------------
// Send a step prompt to a user, honouring their current registrationStep
// -----------------------------------------------------------------------------
async function sendStep(ctx, user, frontendUrl) {
  if (!['awaiting_phone', 'awaiting_consent', 'done'].includes(user.registrationStep)) {
    syncRegistrationUser(user, ctx.from || {});
    await user.save();
  }

  switch (user.registrationStep) {
    case 'awaiting_phone':
      return ctx.replyWithHTML(T.askPhone, {
        reply_markup: {
          keyboard: [[{ text: T.sendPhone, request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });

    case 'awaiting_consent':
      return ctx.replyWithHTML(
        T.askConsent(frontendUrl || '', 'Fairhaven Health'),
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: T.readOferta, url: `${frontendUrl}/legal/oferta-ru` },
              ],
              [
                Markup.button.callback(T.acceptConsent, 'consent:accept'),
              ],
            ],
          },
        }
      );

    case 'done':
    default:
      return sendOpenShop(ctx, user, frontendUrl);
  }
}

async function sendOpenShop(ctx, user, frontendUrl) {
  const firstName = escapeRegistrationName(user.firstName || ctx.from.first_name || '');
  const greeting = user.isRegistered()
    ? T.alreadyRegistered(firstName)
    : T.registered(firstName);

  return ctx.replyWithHTML(greeting, {
    reply_markup: {
      inline_keyboard: [
        [{ text: T.openShop, web_app: { url: frontendUrl } }],
      ],
    },
  });
}

// -----------------------------------------------------------------------------
// Order receipt for the channel (bilingual header)
// -----------------------------------------------------------------------------
function buildChannelKeyboard(orderId, status) {
  if (status === 'pending') {
    return {
      inline_keyboard: [
        [
          { text: '✅ Tasdiqlash / Подтвердить', callback_data: `order:approve:${orderId}` },
          { text: '❌ Rad etish / Отклонить',   callback_data: `order:reject:${orderId}` },
        ],
      ],
    };
  }
  // Finalised — no buttons.
  return { inline_keyboard: [] };
}

// -----------------------------------------------------------------------------
// Post an order to the orders channel
// Returns message_id on success, null on failure (non-fatal).
// -----------------------------------------------------------------------------
async function forwardOrderToChannel(bot, order) {
  if (!ORDERS_CHANNEL_ID) {
    console.warn('[bot] ORDERS_CHANNEL_ID not set — skipping channel post');
    return null;
  }
  try {
    const text = formatOrderReceipt(order);
    const sent = await withTelegramRetry(() =>
      bot.telegram.sendMessage(ORDERS_CHANNEL_ID, text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: buildChannelKeyboard(order._id.toString(), 'pending'),
      })
    );
    console.log(`[bot] Order forwarded, msg ${sent.message_id}`);
    return sent.message_id;
  } catch (err) {
    console.error('[bot] channel forward failed:', errorLabel(err));
    return null;
  }
}

// -----------------------------------------------------------------------------
// Factory
// -----------------------------------------------------------------------------
function formatUZS(amount) {
  return (Number(amount) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' UZS';
}

function getDiscountInfo(product) {
  const price = Number(product.price) || 0;
  const oldPrice = Number(product.oldPrice) || 0;
  if (oldPrice > 0 && oldPrice > price && price > 0) {
    const savings = oldPrice - price;
    const percent = Math.round((savings / oldPrice) * 100);
    return { hasDiscount: true, price, oldPrice, savings, percent };
  }
  return { hasDiscount: false, price, oldPrice: 0, savings: 0, percent: 0 };
}

/**
 * Normalize a multi-line description for Telegram broadcast:
 *   - collapse only horizontal whitespace (so paragraphs survive)
 *   - cap consecutive blank lines at one (single \n\n = paragraph break)
 *   - trim trailing whitespace per line
 *   - hard-cap length, but rewind to the last paragraph / sentence /
 *     word boundary so we don't slice a word in half
 *   - "…" suffix when truncated
 */
function normalizeBroadcastDescription(input, maxLen = 800) {
  let text = (input || '')
    .toString()
    .replace(/\r\n/g, '\n')
    .replace(/[ \t ]+/g, ' ')      // collapse spaces/tabs only
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')         // max one blank line between paragraphs
    .trim();

  if (text.length <= maxLen) return text;

  // Rewind to the nearest sensible boundary so the truncated end reads
  // cleanly: prefer paragraph break, then sentence end, then word.
  const slice = text.slice(0, maxLen);
  const candidates = [
    slice.lastIndexOf('\n\n'),
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? '),
    slice.lastIndexOf('\n'),
    slice.lastIndexOf(' '),
  ].filter((i) => i > maxLen * 0.6);   // don't cut off too aggressively

  const cutAt = candidates.length ? Math.max(...candidates) : maxLen;
  return slice.slice(0, cutAt).trim() + '…';
}

function buildProductBroadcastMessage(product, kind) {
  // sendPhoto caption hard limit is 1024 chars. The other lines (header,
  // brand, name, prices, CTA, etc.) take roughly ~250-350 chars, so 700
  // is a safe ceiling for the description body.
  const cleanDesc = normalizeBroadcastDescription(product.description, 700);
  const headers = {
    new: '🌿 <b>Новинка в каталоге Fairhaven Health</b>',
    restock: '✨ <b>Снова в наличии!</b>',
    discount: '🎉 <b>Скидка на товар!</b>',
  };
  const ctas = {
    new: '🛒 Откройте магазин и добавьте в корзину 👇',
    restock: '🛒 Не упустите — добавьте в корзину сейчас 👇',
    discount: '🔥 Успейте по выгодной цене 👇',
  };
  const discount = getDiscountInfo(product);

  const lines = [];
  lines.push(headers[kind] || headers.new);
  lines.push('');
  if (product.brand) {
    lines.push(`<i>${escapeHtml(product.brand)}</i>`);
  }
  lines.push(`<b>${escapeHtml(product.name)}</b>`);
  if (product.nameUz && product.nameUz !== product.name) {
    lines.push(`<i>${escapeHtml(product.nameUz)}</i>`);
  }
  lines.push('');
  if (cleanDesc) {
    lines.push(escapeHtml(cleanDesc));
    lines.push('');
  }

  if (discount.hasDiscount) {
    // Pretty Russian price block: strikethrough old, bold new, savings line.
    lines.push(
      `💰 <b>Цена:</b> <s>${formatUZS(discount.oldPrice)}</s>  →  <b>${formatUZS(discount.price)}</b>`
    );
    lines.push(
      `🔥 <b>Скидка ${discount.percent}%</b> · экономия ${formatUZS(discount.savings)}`
    );
  } else {
    lines.push(`💰 <b>Цена:</b> ${formatUZS(product.price)}`);
  }

  if (product.category) {
    lines.push(`📦 <b>Категория:</b> ${escapeHtml(categoryLabel(product.category))}`);
  }
  lines.push('');
  lines.push(ctas[kind] || ctas.new);
  return lines.join('\n');
}

function escapeHtml(s) {
  return (s || '').toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function categoryLabel(key) {
  const map = {
    cosmetics: 'Косметика',
    parapharmaceuticals: 'Парафармация',
    supplements: 'Добавки',
    vitamins: 'Витамины',
    hygiene: 'Гигиена',
    drinks: 'Напитки',
  };
  return map[key] || key;
}

function pickProductImage(product) {
  if (product.imageUrl) return product.imageUrl;
  if (Array.isArray(product.images) && product.images.length) return product.images[0];
  return null;
}

function absolutizeUrl(maybeRelative, frontendUrl) {
  if (!maybeRelative) return null;
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
  const base = (frontendUrl || '').replace(/\/+$/, '');
  if (!base) return null;
  return `${base}${maybeRelative.startsWith('/') ? '' : '/'}${maybeRelative}`;
}

async function broadcastProductToUsers(bot, product, frontendUrl, kind = 'new') {
  const text = buildProductBroadcastMessage(product, kind);
  const photoUrl = absolutizeUrl(pickProductImage(product), frontendUrl);

  const productUrl = `${frontendUrl}?product=${product._id}`;
  const ctaLabels = {
    new: '🛒 Открыть товар',
    restock: '🛒 Открыть товар',
  };
  const keyboard = {
    inline_keyboard: [
      [
        { text: ctaLabels[kind] || '🛒 Открыть товар', web_app: { url: productUrl } },
      ],
    ],
  };

  const recipients = await User.find({
    registrationStep: 'done',
    consentAccepted: true,
    notificationsEnabled: { $ne: false },
  }).select('telegramId').lean();

  console.log(`[bot] Broadcasting ${kind} product "${product.name}" to ${recipients.length} users`);

  let sent = 0;
  let failed = 0;
  const errorSamples = [];
  for (let i = 0; i < recipients.length; i += 25) {
    const chunk = recipients.slice(i, i + 25);
    await Promise.allSettled(chunk.map(async (r) => {
      try {
        if (photoUrl) {
          try {
            await withTelegramRetry(() =>
              bot.telegram.sendPhoto(r.telegramId, photoUrl, {
                caption: text,
                parse_mode: 'HTML',
                reply_markup: keyboard,
              })
            );
          } catch (photoErr) {
            // Telegram couldn't fetch / accept the photo URL — fall back to plain text
            // so the broadcast still reaches users instead of silently failing.
            await withTelegramRetry(() =>
              bot.telegram.sendMessage(r.telegramId, text, {
                parse_mode: 'HTML',
                disable_web_page_preview: false,
                reply_markup: keyboard,
              })
            );
            if (errorSamples.length < 3) {
              errorSamples.push(`photo fallback: ${photoErr.description || photoErr.message}`);
            }
          }
        } else {
          await withTelegramRetry(() =>
            bot.telegram.sendMessage(r.telegramId, text, {
              parse_mode: 'HTML',
              disable_web_page_preview: true,
              reply_markup: keyboard,
            })
          );
        }
        sent += 1;
      } catch (err) {
        failed += 1;
        if (errorSamples.length < 5) {
          errorSamples.push(`${r.telegramId}: ${err.description || err.message}`);
        }
      }
    }));
    if (i + 25 < recipients.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (errorSamples.length) {
    console.warn(`[bot] Broadcast (${kind}) sample errors:`, errorSamples);
  }

  console.log(`[bot] Broadcast (${kind}) done: ${sent} sent, ${failed} failed`);
  return { sent, failed, total: recipients.length };
}

function createBot(token, frontendUrl) {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');
  const bot = new Telegraf(token);
  const FRONTEND = (frontendUrl || '').replace(/\/+$/, '') ||
    `https://${process.env.FRONTEND_URL || 'localhost'}`;

  // Attach the channel forwarder so orderController can call it.
  bot.forwardOrderToChannel = (order) => forwardOrderToChannel(bot, order);

  // Broadcast a fresh product to all registered users.
  bot.broadcastNewProduct = (product) => broadcastProductToUsers(bot, product, FRONTEND, 'new');
  bot.broadcastBackInStock = (product) => broadcastProductToUsers(bot, product, FRONTEND, 'restock');
  bot.broadcastDiscount = (product) => broadcastProductToUsers(bot, product, FRONTEND, 'discount');

  // Attach a helper for customer-initiated cancellations — edits the existing
  // channel card to strip the approve/reject buttons and append a verdict.
  bot.markOrderCancelledByCustomer = async (order) => {
    if (!ORDERS_CHANNEL_ID || !order.channelMessageId) return;
    const verdict = `\n\n❌ <b>Отменён клиентом</b>`;
    try {
      await bot.telegram.editMessageText(
        ORDERS_CHANNEL_ID,
        order.channelMessageId,
        null,
        formatOrderReceipt(order) + verdict,
        {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: { inline_keyboard: [] },
        }
      );
    } catch (err) {
      // If the text edit fails (e.g. "message is not modified"), at least
      // try to strip the buttons so operators don't tap a stale action.
      try {
        await bot.telegram.editMessageReplyMarkup(
          ORDERS_CHANNEL_ID,
          order.channelMessageId,
          null,
          { inline_keyboard: [] }
        );
      } catch (_) { /* swallow */ }
      throw err;
    }
  };

  // ---------------------------------------------------------------------------
  // /start — start or resume registration
  // ---------------------------------------------------------------------------
  bot.start(async (ctx) => {
    const tg = ctx.from;
    let user = await User.findOne({ telegramId: tg.id });
    if (!user) {
      user = await User.create({
        telegramId: tg.id,
        username: tg.username || '',
        languageCode: tg.language_code || 'ru',
        registrationStep: 'awaiting_phone',
      });
    }
    syncRegistrationUser(user, tg);
    await user.save();

    // Web-site login deep-link: confirm (or queue) and keep the shop flow.
    const wasWebLogin = await handleWebLoginPayload(ctx, user);
    if (wasWebLogin && user.isRegistered()) {
      return sendOpenShop(ctx, user, FRONTEND);
    }

    if (!wasWebLogin) {
      const firstName = escapeRegistrationName(user.firstName || tg.first_name || 'друг');
      await ctx.replyWithHTML(T.welcome(firstName));
    }

    if (user.isRegistered()) {
      return sendOpenShop(ctx, user, FRONTEND);
    }
    return sendStep(ctx, user, FRONTEND);
  });

  // ---------------------------------------------------------------------------
  // /help
  // ---------------------------------------------------------------------------
  bot.help((ctx) => {
    ctx.replyWithHTML(
      `ℹ️ <b>Fairhaven Health — yordam / помощь</b>\n\n` +
      `🛒 /start — do‘konni ochish / открыть магазин\n` +
      `📦 /myorders — buyurtmalarim / мои заказы\n` +
      `📄 /oferta — ommaviy oferta / публичная оферта\n\n` +
      `📞 ${process.env.SUPPORT_PHONE || '+998 00 000 00 00'}`
    );
  });

  // ---------------------------------------------------------------------------
  // /oferta
  // ---------------------------------------------------------------------------
  bot.command('oferta', (ctx) => {
    ctx.replyWithHTML(
      `📄 <b>Ommaviy oferta / Публичная оферта</b>\n\n` +
      `🇺🇿 ${FRONTEND}/legal/oferta-uz\n` +
      `🇷🇺 ${FRONTEND}/legal/oferta-ru`,
      { disable_web_page_preview: true }
    );
  });

  // ---------------------------------------------------------------------------
  // /myorders
  // ---------------------------------------------------------------------------
  bot.command('myorders', async (ctx) => {
    try {
      const orders = await Order.find({ telegramId: ctx.from.id })
        .sort({ createdAt: -1 })
        .limit(5);

      if (!orders.length) {
        return ctx.reply(
          '📦 Hali buyurtmalaringiz yo‘q.\n📦 У вас пока нет заказов.'
        );
      }

      // Customer-facing view: collapse every post-approval state
      // (preparing/delivering/delivered) into a single «принят» bucket.
      const stateOf = (s) => {
        if (s === 'pending') return { emoji: '⏳', label: 'В обработке' };
        if (s === 'cancelled') return { emoji: '❌', label: 'Отклонён' };
        return { emoji: '✅', label: 'Принят' };
      };

      let text = '📦 <b>Последние заказы:</b>\n\n';
      for (const order of orders) {
        const id = shortOrderId(order);
        const total = order.totalAmount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        const date = new Date(order.createdAt).toLocaleDateString('ru-RU');
        const s = stateOf(order.status);
        text += `${s.emoji} <b>#${id}</b> — ${s.label}\n`;
        text += `   💰 ${total} UZS · 📅 ${date}\n\n`;
      }
      ctx.replyWithHTML(text);
    } catch (err) {
      console.error('Error fetching orders:', errorLabel(err));
      ctx.reply('❌ Xatolik / Ошибка');
    }
  });

  // ---------------------------------------------------------------------------
  // Callback: gender selection
  // ---------------------------------------------------------------------------
  bot.action(/^gender:(male|female)$/, async (ctx) => {
    const gender = ctx.match[1];
    try {
      const user = await User.findOne({ telegramId: ctx.from.id });
      if (!user) return ctx.answerCbQuery();
      syncRegistrationUser(user, ctx.from);
      await user.save();
      await ctx.answerCbQuery(gender === 'male' ? '👨' : '👩');
      try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch (_) {}
      return sendStep(ctx, user, FRONTEND);
    } catch (err) {
      console.error('gender callback:', errorLabel(err));
      return ctx.answerCbQuery('Ошибка');
    }
  });

  // ---------------------------------------------------------------------------
  // Callback: consent accept
  // ---------------------------------------------------------------------------
  bot.action('consent:accept', async (ctx) => {
    try {
      const user = await User.findOne({ telegramId: ctx.from.id });
      if (!user) return ctx.answerCbQuery();
      if (!acceptConsent(user)) {
        return ctx.answerCbQuery();
      }
      await user.save();
      await ctx.answerCbQuery('✅');
      try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch (_) {}
      // A web login started before registration finishes here.
      try { await finishPendingWebLogin(ctx, user); } catch (err) {
        console.error('web login finish:', errorLabel(err));
      }
      return sendOpenShop(ctx, user, FRONTEND);
    } catch (err) {
      console.error('consent callback:', errorLabel(err));
      return ctx.answerCbQuery('Ошибка');
    }
  });

  // ---------------------------------------------------------------------------
  // Callback: order approval / rejection (from channel)
  // ---------------------------------------------------------------------------
  bot.action(/^order:(approve|reject):([a-fA-F0-9]{24})$/, async (ctx) => {
    const [, action, orderId] = ctx.match;
    try {
      const order = await Order.findById(orderId);
      if (!order) {
        return ctx.answerCbQuery('Buyurtma topilmadi / Заказ не найден');
      }
      if (order.status !== 'pending') {
        return ctx.answerCbQuery(`Allaqachon: ${order.status}`);
      }

      const newStatus = action === 'approve' ? 'confirmed' : 'cancelled';
      order.status = newStatus;
      await order.save();

      const shortId = shortOrderId(order);
      const actorName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ')
        || (ctx.from.username ? `@${ctx.from.username}` : 'operator');
      const verdict = action === 'approve'
        ? `\n\n✅ <b>Tasdiqlandi / Подтверждено</b> — ${actorName}`
        : `\n\n❌ <b>Rad etildi / Отклонено</b> — ${actorName}`;

      // Edit channel message — append verdict, strip buttons.
      try {
        await ctx.editMessageText(
          formatOrderReceipt(order) + verdict,
          {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard: [] },
          }
        );
      } catch (editErr) {
        // Fallback: just remove buttons if edit fails.
        try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch (_) {}
      }

      await ctx.answerCbQuery(action === 'approve' ? '✅ Подтверждено' : '❌ Отклонено');

      // Notify the customer
      try {
        await withTelegramRetry(() =>
          bot.telegram.sendMessage(
            order.telegramId,
            action === 'approve' ? T.orderApproved(shortId) : T.orderRejected(shortId),
            { parse_mode: 'HTML' }
          )
        );
      } catch (notifyErr) {
        console.warn('[bot] Could not notify customer:', errorLabel(notifyErr));
      }
    } catch (err) {
      console.error('order action:', errorLabel(err));
      return ctx.answerCbQuery('Ошибка');
    }
  });

  // ---------------------------------------------------------------------------
  // Contact (phone) submission
  // ---------------------------------------------------------------------------
  bot.on('contact', async (ctx) => {
    try {
      const user = await User.findOne({ telegramId: ctx.from.id });
      if (!user) return;
      if (user.registrationStep !== 'awaiting_phone') return;

      const contact = ctx.message.contact;
      if (!applyVerifiedContact(user, ctx.from.id, contact)) {
        return ctx.replyWithHTML(
          '⚠️ Iltimos, o‘zingizning raqamingizni yuboring.\n⚠️ Отправьте ваш собственный номер.'
        );
      }

      await user.save();

      // Remove the contact keyboard.
      await ctx.reply('📞 ' + user.phone, {
        reply_markup: { remove_keyboard: true },
      });
      return sendStep(ctx, user, FRONTEND);
    } catch (err) {
      console.error('contact handler:', errorLabel(err));
    }
  });

  // ---------------------------------------------------------------------------
  // Text input — routes to the current registration step
  // ---------------------------------------------------------------------------
  bot.on('text', async (ctx) => {
    // Ignore commands (start/help/oferta/myorders already handled above).
    if (ctx.message.text.startsWith('/')) return;

    // Ignore web-app data events — these are sent via the separate channel.
    if (ctx.message.web_app_data) return;

    try {
      const user = await User.findOne({ telegramId: ctx.from.id });
      if (!user) {
        return ctx.reply('/start');
      }

      if (user.registrationStep === 'done') {
        // Already registered — nudge back to the shop.
        return sendOpenShop(ctx, user, FRONTEND);
      }

      syncRegistrationUser(user, ctx.from);
      await user.save();
      return sendStep(ctx, user, FRONTEND);
    } catch (err) {
      console.error('text handler:', errorLabel(err));
    }
  });

  // ---------------------------------------------------------------------------
  // Error handler
  // ---------------------------------------------------------------------------
  bot.catch((err, ctx) => {
    console.error(`[bot] error in ${ctx.updateType}:`, errorLabel(err));
  });

  return bot;
}

module.exports = {
  createBot,
  ORDERS_CHANNEL_ID,
  forwardOrderToChannel,
};
