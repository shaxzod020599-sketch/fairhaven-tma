const { Telegraf, Markup } = require('telegraf');
const User = require('../models/User');
const Order = require('../models/Order');
const { formatOrderReceipt } = require('../utils/helpers');
const { buildOrderData } = require('../utils/orderPayload');

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || null;

function createBot(token, frontendUrl) {
  const bot = new Telegraf(token);

  // /start command
  bot.start(async (ctx) => {
    const tgUser = ctx.from;

    // Upsert user in DB
    try {
      let user = await User.findOne({ telegramId: tgUser.id });
      if (!user) {
        user = await User.create({
          telegramId: tgUser.id,
          firstName: tgUser.first_name || '',
          lastName: tgUser.last_name || '',
          username: tgUser.username || '',
          languageCode: tgUser.language_code || 'ru',
        });
      }
    } catch (err) {
      console.error('Error upserting user on /start:', err.message);
    }

    const welcomeText =
      `🌿 <b>Добро пожаловать в FairHaven!</b>\n\n` +
      `Витамины, добавки и средства для здоровья — всё в одном месте.\n\n` +
      `Нажмите кнопку ниже, чтобы открыть магазин 👇`;

    await ctx.replyWithHTML(welcomeText, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🛒 Открыть магазин',
              web_app: { url: frontendUrl },
            },
          ],
        ],
      },
    });
  });

  // /help command
  bot.help((ctx) => {
    ctx.replyWithHTML(
      `ℹ️ <b>Помощь — FairHaven</b>\n\n` +
      `🛒 /start — Открыть магазин\n` +
      `📦 /myorders — Мои заказы\n` +
      `📞 Поддержка: @fairhaven_support`
    );
  });

  // /myorders command
  bot.command('myorders', async (ctx) => {
    try {
      const orders = await Order.find({ telegramId: ctx.from.id })
        .sort({ createdAt: -1 })
        .limit(5);

      if (!orders.length) {
        return ctx.reply('📦 У вас пока нет заказов. Откройте магазин и сделайте первый заказ!');
      }

      const statusEmoji = {
        pending: '⏳',
        confirmed: '✅',
        preparing: '🔧',
        delivering: '🚚',
        delivered: '✅',
        cancelled: '❌',
      };

      const statusText = {
        pending: 'Ожидает',
        confirmed: 'Подтверждён',
        preparing: 'Готовится',
        delivering: 'Доставляется',
        delivered: 'Доставлен',
        cancelled: 'Отменён',
      };

      let text = '📦 <b>Ваши последние заказы:</b>\n\n';
      for (const order of orders) {
        const id = order._id.toString().slice(-6).toUpperCase();
        const emoji = statusEmoji[order.status] || '📦';
        const status = statusText[order.status] || order.status;
        const total = order.totalAmount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        const date = new Date(order.createdAt).toLocaleDateString('ru-RU');
        text += `${emoji} <b>#${id}</b> — ${status}\n   💰 ${total} UZS | 📅 ${date}\n\n`;
      }

      ctx.replyWithHTML(text);
    } catch (err) {
      console.error('Error fetching orders:', err.message);
      ctx.reply('Произошла ошибка при получении заказов.');
    }
  });

  // Handle web_app_data from sendData
  bot.on('message', async (ctx) => {
    if (!ctx.message.web_app_data) return;

    try {
      const data = JSON.parse(ctx.message.web_app_data.data);
      const tgUser = ctx.from;

      // Upsert user
      let user = await User.findOne({ telegramId: tgUser.id });
      if (!user) {
        user = await User.create({
          telegramId: tgUser.id,
          firstName: tgUser.first_name || '',
          lastName: tgUser.last_name || '',
          username: tgUser.username || '',
        });
      }

      // Create order (recalculate prices from DB, do not trust client totals)
      const orderData = await buildOrderData({
        items: data.items,
        location: data.location,
        customerName: data.user?.name || `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim(),
        customerPhone: data.user?.phone || user.phone || '',
        notes: data.notes || '',
      });

      const order = await Order.create({
        userId: user._id,
        telegramId: tgUser.id,
        items: orderData.items,
        totalAmount: orderData.totalAmount,
        location: orderData.location,
        customerName: orderData.customerName || '',
        customerPhone: orderData.customerPhone || '',
        notes: orderData.notes || '',
      });

      // Confirm to user
      await ctx.replyWithHTML(
        `✅ <b>Заказ оформлен!</b>\n\n` +
        `📋 Номер: <b>#${order._id.toString().slice(-6).toUpperCase()}</b>\n` +
        `💰 Сумма: <b>${order.totalAmount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} UZS</b>\n\n` +
        `Мы свяжемся с вами для подтверждения. Спасибо! 🌿`
      );

      // Forward receipt to admin
      const receipt = formatOrderReceipt(order);
      if (ADMIN_CHAT_ID) {
        await bot.telegram.sendMessage(ADMIN_CHAT_ID, receipt, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        });
      } else {
        // If no admin chat configured, log receipt
        console.log('📋 New order received (no ADMIN_CHAT_ID set):');
        console.log(receipt.replace(/<[^>]*>/g, ''));
      }
    } catch (err) {
      console.error('Error processing web_app_data:', err);
      await ctx.reply('❌ Произошла ошибка при оформлении заказа. Попробуйте ещё раз.');
    }
  });

  // Error handler
  bot.catch((err, ctx) => {
    console.error(`Bot error for ${ctx.updateType}:`, err);
  });

  return bot;
}

module.exports = { createBot };
