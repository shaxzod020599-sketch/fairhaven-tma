const User = require('../models/User');
const channelHub = require('../utils/channelHub');
const { actorFor, safeCode, validId, decisionBody } = require('../controllers/yandexController');
const ACTION = { a: 'accept', c: 'cooking', r: 'ready', x: 'reject' };
function parseCallback(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value) > 64) return null;
  const match = /^ya:([acrx]):([a-f\d]{32}):([1-9a-z][0-9a-z]{0,10}):([1-9a-z][0-9a-z]{0,10})$/.exec(value);
  if (!match || match[0] !== value) return null;
  const [, command, compact, revision, itemsRevision] = match;
  const expectedRevision = parseInt(revision, 36); const expectedItemsRevision = parseInt(itemsRevision, 36);
  if (![expectedRevision, expectedItemsRevision].every((number) => Number.isSafeInteger(number) && number > 0)
    || expectedRevision.toString(36) !== revision || expectedItemsRevision.toString(36) !== itemsRevision) return null;
  const orderId = `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
  return { orderId, action: ACTION[command], expectedRevision, expectedItemsRevision };
}
function createYandexTelegramAction({ UserModel = User, hub = channelHub } = {}) {
  async function respond({ telegramId, orderId, action, expectedRevision, expectedItemsRevision, reason = '' }) {
    if (!validId(orderId) || !decisionBody({ action, expectedRevision, expectedItemsRevision, reason })) return { ok: false, code: 'yandex_invalid_action' };
    if (!Number.isSafeInteger(telegramId) || telegramId <= 0) return { ok: false, code: 'yandex_forbidden' };
    try {
      const user = await UserModel.findOne({ telegramId, role: 'admin', botBlocked: { $ne: true } });
      const actor = user?.botBlocked ? null : actorFor(user, 'telegram');
      if (!actor) return { ok: false, code: 'yandex_forbidden' };
      const result = await hub.requestInternal('POST', ['internal', 'yandex', 'orders', orderId, 'decision'], {
        body: { action, reason: reason.trim(), expectedRevision,
          ...(expectedItemsRevision === undefined ? {} : { expectedItemsRevision }), actor },
      });
      return result.ok ? { ok: true, ...result.body } : { ok: false, code: safeCode(result) };
    } catch (error) { return { ok: false, code: error?.notConfigured ? 'channel_hub_not_configured' : 'channel_hub_unreachable' }; }
  }
  return { respond };
}
const MESSAGES = {
  yandex_forbidden: 'Доступ запрещён',
  yandex_disabled: 'Yandex отключён',
  yandex_accounting_disabled: 'Учёт отключён. Откройте панель.',
  yandex_revision_conflict: 'Заказ изменился. Дождитесь обновления карточки.',
  yandex_items_revision_conflict: 'Состав изменился. Проверьте заказ в панели.',
  yandex_operation_in_progress: 'Решение уже обрабатывается',
  yandex_reconciliation_required: 'Нужна сверка учёта. Откройте панель.',
  yandex_cancellation_pending: 'Отмена ожидает обработки',
  yandex_cancelled: 'Заказ отменён',
  yandex_unavailable: 'Товара уже нет в наличии',
  yandex_empty_items: 'Состав пуст. Откройте панель.',
};
function registerYandexActions(bot, { actionService = createYandexTelegramAction() } = {}) {
  bot.action(/^ya:/, async (ctx) => {
    const input = parseCallback(ctx.callbackQuery?.data);
    if (!input) return ctx.answerCbQuery('Кнопка устарела. Откройте панель.');
    if (ctx.chat?.type !== 'private' || ctx.chat.id !== ctx.from?.id) return ctx.answerCbQuery(MESSAGES.yandex_forbidden);
    try {
      const result = await actionService.respond({ ...input, telegramId: ctx.from.id,
        ...(input.action === 'reject' ? { reason: 'Отклонено администратором в Telegram' } : {}) });
      // Only the durable notifier owns card edits and keyboard removal.
      return ctx.answerCbQuery(result.ok ? ({ accept: 'Принят', cooking: 'Готовится', ready: 'Готов', reject: 'Отклонён' })[input.action]
        : MESSAGES[result.code] || 'Не удалось выполнить. Проверьте заказ в панели.');
    } catch (_) { return ctx.answerCbQuery('Сервис временно недоступен'); }
  });
}
module.exports = { parseCallback, createYandexTelegramAction, registerYandexActions };
