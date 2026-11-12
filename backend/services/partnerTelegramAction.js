const User = require('../models/User');
const channelHub = require('../utils/channelHub');

/**
 * Accept / Reject buttons on Partner API order cards (`pa:<cmd>:<orderId>`).
 *
 * The card itself is owned by the channel hub, which edits every copy once
 * the order's status changes; this only forwards an admin's decision. Reject
 * asks for confirmation first, the same as the Medicalka cards.
 */

const ID = /^[a-f\d]{24}$/i;

const MESSAGES = {
  forbidden: '⛔ Ruxsat yo‘q / Доступ запрещён',
  invalid_status: 'Buyurtma allaqachon yopilgan / Заказ уже закрыт',
  order_busy: 'Bajarilmoqda… / Уже обрабатывается',
  billz_writes_disabled: '⚠️ Billz yozuvi o‘chiq / Запись в Billz выключена',
  billz_unavailable: '⚠️ Billz javob bermadi, qayta bosing / Billz не ответил, повторите',
  billz_uncertain: '⚠️ Billz holati noaniq — panelni tekshiring / Проверьте в панели',
  release_failed: '⚠️ Bronni bo‘shatib bo‘lmadi, qayta bosing / Повторите',
};

function actorName(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ')
    || (user?.username ? `@${user.username}` : 'Telegram admin');
}

function createPartnerTelegramAction({ UserModel = User, hub = channelHub } = {}) {
  async function admin(telegramId) {
    const id = Number(telegramId);
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    const user = await UserModel.findOne({ telegramId: id, role: 'admin', botBlocked: { $ne: true } });
    return user?.role === 'admin' ? user : null;
  }

  async function respond({ telegramId, orderId, action }) {
    if (!ID.test(String(orderId || '')) || !['accept', 'reject'].includes(action)) {
      return { ok: false, code: 'invalid_action' };
    }
    const user = await admin(telegramId);
    if (!user) return { ok: false, code: 'forbidden' };
    try {
      const result = await hub.requestInternal('POST', ['internal', 'partners', 'orders', orderId, 'decision'], {
        body: { action, actor: { type: 'telegram', telegramId: Number(user.telegramId), name: actorName(user) } },
        timeoutMs: 60000,
      });
      if (result.ok) return { ok: true };
      return { ok: false, code: String(result.body?.error || 'partner_action_failed') };
    } catch (_) {
      return { ok: false, code: 'channel_hub_unreachable' };
    }
  }

  return { canAct: async (telegramId) => Boolean(await admin(telegramId)), respond };
}

function keyboard(id) {
  return {
    inline_keyboard: [
      [{ text: '✅ Qabul qilish / Принять', callback_data: `pa:a:${id}` }],
      [{ text: '❌ Rad etish / Отклонить', callback_data: `pa:r:${id}` }],
    ],
  };
}

function registerPartnerActions(bot, { actionService = createPartnerTelegramAction() } = {}) {
  bot.action(/^pa:(a|r|rc|x):([a-fA-F0-9]{24})$/, async (ctx) => {
    const [, command, orderId] = ctx.match;
    try {
      if (!await actionService.canAct(ctx.from?.id)) return ctx.answerCbQuery(MESSAGES.forbidden);

      if (command === 'r') {
        await ctx.editMessageReplyMarkup({
          inline_keyboard: [
            [{ text: '❌ Ha, rad etish / Да, отклонить', callback_data: `pa:rc:${orderId}` }],
            [{ text: '↩️ Ortga / Назад', callback_data: `pa:x:${orderId}` }],
          ],
        });
        return ctx.answerCbQuery('Rad etishni tasdiqlang / Подтвердите');
      }
      if (command === 'x') {
        await ctx.editMessageReplyMarkup(keyboard(orderId));
        return ctx.answerCbQuery('Bekor qilindi / Отменено');
      }

      const action = command === 'a' ? 'accept' : 'reject';
      const result = await actionService.respond({ telegramId: ctx.from.id, orderId, action });
      if (result.ok) {
        return ctx.answerCbQuery(action === 'accept' ? '✅ Qabul qilindi / Принят' : '❌ Rad etildi / Отклонён');
      }
      return ctx.answerCbQuery(MESSAGES[result.code] || '⚠️ Bajarilmadi, panelni tekshiring / Не удалось');
    } catch (err) {
      console.error('partner callback:', err?.message || err);
      return ctx.answerCbQuery('Ошибка');
    }
  });
}

module.exports = { createPartnerTelegramAction, registerPartnerActions, keyboard };
