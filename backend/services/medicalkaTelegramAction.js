const User = require('../models/User');
const channelHub = require('../utils/channelHub');

const ID = /^[a-f\d]{24}$/i;

function actorName(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ')
    || (user?.username ? `@${user.username}` : 'Telegram admin');
}

function safeCode(body, fallback) {
  const code = String(body?.error || '');
  return code.startsWith('medicalka_') ? code : fallback;
}

function createMedicalkaTelegramAction({ UserModel = User, hub = channelHub } = {}) {
  async function admin(telegramId) {
    const id = Number(telegramId);
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    const user = await UserModel.findOne({ telegramId: id, role: 'admin' });
    return user?.role === 'admin' ? user : null;
  }

  async function canAct(telegramId) {
    return Boolean(await admin(telegramId));
  }

  async function respond({ telegramId, approvalId, action, comment = '' } = {}) {
    if (!ID.test(String(approvalId || '')) || !['accepted', 'rejected'].includes(action)) {
      return { ok: false, code: 'invalid_action' };
    }
    const user = await admin(telegramId);
    if (!user) return { ok: false, code: 'forbidden' };

    const path = `/internal/medicalka/approvals/${approvalId}`;
    let result;
    try {
      result = await hub.request('POST', `${path}/respond`, {
        body: {
          action,
          comment: String(comment || '').trim().slice(0, 500),
          actor: {
            type: 'telegram',
            telegramId: Number(user.telegramId),
            name: actorName(user),
          },
        },
      });
    } catch (_) {
      return { ok: false, code: 'channel_hub_unreachable' };
    }
    if (result.ok) return { ok: true, ...result.body };

    const code = safeCode(result.body, 'medicalka_action_failed');
    if (result.status !== 409) return { ok: false, code };

    try {
      const current = await hub.request('GET', path);
      return {
        ok: false,
        code,
        ...(current.ok && current.body?.data ? { approval: current.body.data } : {}),
      };
    } catch (_) {
      return { ok: false, code };
    }
  }

  return { canAct, respond };
}

module.exports = { createMedicalkaTelegramAction };
