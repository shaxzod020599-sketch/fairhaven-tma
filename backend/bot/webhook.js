const crypto = require('crypto');
const { errorLabel } = require('../utils/http');

/**
 * Telegram transport: webhook, with long polling as the fallback.
 *
 * Polling is the wrong shape for this deployment. utils/telegramRetry.js
 * records why: egress from this VPS to api.telegram.org fails on roughly 60% of
 * calls, and polling means the bot must make that outbound call continuously.
 * A webhook reverses the direction — Telegram connects to us, over the TLS
 * endpoint nginx already terminates. It also removes the 409 conflict class
 * entirely, and stops a developer running the backend locally from stealing
 * getUpdates from the live bot.
 *
 * The mount point has to be registered alongside the other routes, before the
 * SPA catch-all, but the handler only exists once the bot has been created and
 * Telegram has accepted setWebhook. So a stable middleware is installed at
 * startup and the real handler is slotted in behind it later.
 */

const WEBHOOK_PREFIX = '/tg/';

let handler = null;

/** Registered with the other routes. Does nothing until a handler is set. */
function webhookRoute(req, res, next) {
  if (!handler || !req.path.startsWith(WEBHOOK_PREFIX)) return next();
  return handler(req, res, next);
}

/**
 * The path Telegram posts to.
 *
 * Derived from the bot token so it is unguessable, and stable across restarts
 * so a redeploy does not need setWebhook to be called again. The secret token
 * header is the actual authentication — this only keeps the path out of logs
 * and scanners.
 */
function webhookPath(token) {
  const digest = crypto.createHash('sha256').update(String(token)).digest('hex');
  return `${WEBHOOK_PREFIX}${digest.slice(0, 32)}`;
}

function readConfig() {
  return {
    enabled: process.env.TELEGRAM_USE_WEBHOOK === 'true',
    domain: (process.env.TELEGRAM_WEBHOOK_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/+$/, ''),
    secretToken: process.env.TELEGRAM_WEBHOOK_SECRET || '',
  };
}

/**
 * Puts the bot on a webhook.
 *
 * @returns true when Telegram accepted it; false when the caller should fall
 *          back to polling. Never throws — a misconfigured or unreachable
 *          webhook must degrade to polling rather than leave the bot dead.
 */
async function useWebhook(bot, token) {
  const { enabled, domain, secretToken } = readConfig();
  if (!enabled) return false;

  if (!domain) {
    console.warn('[bot] TELEGRAM_USE_WEBHOOK is set but TELEGRAM_WEBHOOK_DOMAIN is missing — polling instead');
    return false;
  }
  if (secretToken.length < 16) {
    // Telegram echoes this back in a header and it is what proves an update
    // really came from them. A weak value makes the endpoint forgeable.
    console.warn('[bot] TELEGRAM_WEBHOOK_SECRET must be at least 16 characters — polling instead');
    return false;
  }

  const path = webhookPath(token);
  try {
    handler = await bot.createWebhook({
      domain,
      path,
      secret_token: secretToken,
      // Preserve queued updates, including admin callbacks, across restarts.
      drop_pending_updates: false,
      allowed_updates: ['message', 'callback_query', 'my_chat_member'],
    });
    console.log(`🤖 Telegram webhook active at https://${domain}${path}`);
    return true;
  } catch (err) {
    handler = null;
    console.warn(`[bot] webhook setup failed (${errorLabel(err)}) — falling back to polling`);
    return false;
  }
}

/**
 * Clears any webhook so getUpdates can run.
 *
 * Telegram refuses polling while a webhook is registered, so switching back
 * without this leaves the bot silently receiving nothing.
 */
async function clearWebhook(bot) {
  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: false });
  } catch (err) {
    console.warn('[bot] could not clear webhook:', errorLabel(err));
  }
}

module.exports = { webhookRoute, webhookPath, useWebhook, clearWebhook, WEBHOOK_PREFIX };
