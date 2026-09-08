const User = require('../models/User');
const channelHub = require('../utils/channelHub');
const { actorFor, safeCode, ID } = require('../controllers/uzumController');

function createUzumTelegramAction({ UserModel = User, hub = channelHub } = {}) {
  async function admin(telegramId) {
    if (!Number.isSafeInteger(telegramId) || telegramId <= 0) return null;
    const user = await UserModel.findOne({ telegramId, role: 'admin' });
    return user?.role === 'admin' ? user : null;
  }
  async function respond({ telegramId, orderId, action, reason = '' }) {
    if (!ID.test(orderId || '') || !['accept', 'ready', 'reject'].includes(action)) return { ok: false, code: 'uzum_invalid_action' };
    const actor = actorFor(await admin(telegramId), 'telegram');
    if (!actor) return { ok: false, code: 'forbidden' };
    try {
      const result = await hub.requestInternal('POST', ['internal', 'uzum', 'orders', orderId, 'decision'], {
        body: { action, reason: String(reason).slice(0, 300), actor },
      });
      return result.ok ? { ok: true, ...result.body } : { ok: false, code: safeCode(result) };
    } catch (_) { return { ok: false, code: 'channel_hub_unreachable' }; }
  }
  return { canAct: async (id) => Boolean(await admin(id)), respond };
}
const MESSAGES = {
  uzum_disabled: 'Uzum отключён',
  uzum_acceptance_expired: 'Срок принятия истёк',
  uzum_cancelled: 'Заказ отменён',
  uzum_cancellation_pending: 'Отмена ожидает обработки',
  uzum_operation_in_progress: 'Решение уже обрабатывается',
  uzum_not_accepted: 'Сначала примите заказ',
  uzum_reconciliation_required: 'Нужна сверка учёта. Откройте админ-панель.',
  uzum_unavailable: 'Товара уже нет в наличии',
  forbidden: 'Доступ запрещён',
  uzum_forbidden: 'Доступ запрещён',
};
function registerUzumActions(bot, { actionService = createUzumTelegramAction() } = {}) {
  bot.action(/^uz:(a|r|rc|ready):([a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i, async (ctx) => {
    const [, command, orderId] = ctx.match;
    try {
      if (!await actionService.canAct(ctx.from?.id)) return ctx.answerCbQuery(MESSAGES.forbidden);
      const action = command === 'a' ? 'accept' : command === 'ready' ? 'ready' : 'reject';
      const result = await actionService.respond({ telegramId: ctx.from.id, orderId, action, ...(action === 'reject' ? { reason: 'Отклонено администратором в Telegram' } : {}) });
      // Durable notification delivery edits every tracked card and retries its
      // keyboard cleanup. A callback must not race that worker with stale markup.
      return ctx.answerCbQuery(result.ok ? ({ accept: 'Принят', ready: 'Готов', reject: 'Отменён' })[action] : MESSAGES[result.code] || 'Не удалось выполнить. Проверьте заказ в панели.');
    } catch (_) { return ctx.answerCbQuery('Сервис временно недоступен'); }
  });
}
module.exports = { createUzumTelegramAction, registerUzumActions };
