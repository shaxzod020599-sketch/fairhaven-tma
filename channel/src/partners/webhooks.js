const crypto = require('crypto');
const config = require('../config');
const logger = require('../logger');
const PartnerEvent = require('../models/PartnerEvent');
const registry = require('./registry');

/**
 * Webhook delivery to partners.
 *
 * Each call is signed: `X-FairHaven-Signature: v1=<hex HMAC-SHA256>` over
 * `<X-FairHaven-Timestamp>.<raw body>` with the partner's signing secret, so the
 * partner can prove the call is ours and reject a replay of an old one.
 *
 * Delivery is at-least-once: a partner must treat a repeated event id as
 * already handled. Failures are retried with growing pauses for about a day.
 */

const RETRY_DELAYS_MS = [10e3, 60e3, 5 * 60e3, 15 * 60e3, 60 * 60e3, 3 * 60 * 60e3, 6 * 60 * 60e3, 12 * 60 * 60e3];
const BATCH = 20;
const USER_AGENT = 'FairHaven-Webhooks/1.0';

function sign(secret, timestamp, body) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/** A URL a webhook may be sent to, or an error code explaining why not. */
function checkUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return { ok: true, url: '' };
  if (raw.length > 500) return { ok: false, code: 'webhook_url_too_long' };
  let url;
  try {
    url = new URL(raw);
  } catch (_) {
    return { ok: false, code: 'webhook_url_invalid' };
  }
  const secure = url.protocol === 'https:';
  const insecureAllowed = url.protocol === 'http:' && config.partners.allowInsecureWebhooks;
  if (!secure && !insecureAllowed) return { ok: false, code: 'webhook_url_not_https' };
  if (url.username || url.password) return { ok: false, code: 'webhook_url_has_credentials' };
  return { ok: true, url: url.toString() };
}

async function post(partner, { id, type, payload, createdAt }) {
  // created_at is when the event happened, the same on every retry.
  const body = JSON.stringify({ id, type, created_at: new Date(createdAt || Date.now()).toISOString(), data: payload });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.partners.webhookTimeoutMs);
  try {
    const res = await fetch(partner.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        'X-FairHaven-Event': type,
        'X-FairHaven-Event-Id': id,
        'X-FairHaven-Timestamp': timestamp,
        'X-FairHaven-Signature': `v1=${sign(partner.webhookSecret, timestamp, body)}`,
      },
      body,
      redirect: 'manual',
      signal: controller.signal,
    });
    // The body is never read: whatever the partner answers, only the status
    // code counts, and an unread stream must not hold the socket.
    res.body?.cancel?.().catch?.(() => {});
    return { ok: res.status >= 200 && res.status < 300, status: res.status };
  } catch (err) {
    return { ok: false, status: null, error: err.name === 'AbortError' ? 'timeout' : 'network_error' };
  } finally {
    clearTimeout(timer);
  }
}

async function deliver(event) {
  const partner = registry.get(event.partnerCode);
  if (!partner || partner.mode === 'off' || !partner.webhookUrl || !partner.webhookSecret) {
    await PartnerEvent().updateOne({ _id: event._id }, { $set: { state: 'skipped' } });
    return 'skipped';
  }
  const result = await post(partner, {
    id: String(event._id), type: event.type, payload: event.payload, createdAt: event.createdAt,
  });
  const attempts = (event.attempts || 0) + 1;
  if (result.ok) {
    await PartnerEvent().updateOne({ _id: event._id }, {
      $set: { state: 'delivered', attempts, deliveredAt: new Date(), lastStatusCode: result.status, lastError: '' },
    });
    return 'delivered';
  }
  const giveUp = attempts > RETRY_DELAYS_MS.length;
  await PartnerEvent().updateOne({ _id: event._id }, {
    $set: {
      state: giveUp ? 'failed' : 'pending',
      attempts,
      lastStatusCode: result.status,
      lastError: result.error || `http_${result.status}`,
      nextAttemptAt: new Date(Date.now() + (RETRY_DELAYS_MS[attempts - 1] || 0)),
    },
  });
  if (giveUp) logger.warn('partner webhook abandoned', { code: event.partnerCode, event: String(event._id) });
  return giveUp ? 'failed' : 'retry';
}

/**
 * Delivers what is due. Events of one partner go out oldest first, and a
 * partner whose endpoint just failed is skipped for the rest of the round so a
 * newer status never overtakes an older one.
 */
async function drain() {
  const pending = await PartnerEvent()
    .find({ state: 'pending' })
    .sort({ createdAt: 1 })
    .limit(BATCH * 10)
    .lean();
  const blocked = new Set();
  const now = Date.now();
  let sent = 0;
  for (const event of pending) {
    if (sent >= BATCH) break;
    if (blocked.has(event.partnerCode)) continue;
    // The partner's oldest undelivered event is waiting for its retry time:
    // nothing newer may go out before it.
    if (new Date(event.nextAttemptAt).getTime() > now) {
      blocked.add(event.partnerCode);
      continue;
    }
    sent += 1;
    const outcome = await deliver(event);
    if (outcome === 'retry' || outcome === 'failed') blocked.add(event.partnerCode);
  }
  return sent;
}

/** One immediate, unrecorded call so a partner can check their endpoint. */
async function sendPing(partner) {
  const result = await post(partner, {
    id: `ping_${crypto.randomBytes(8).toString('hex')}`,
    type: 'ping',
    payload: { message: 'FairHaven webhook test' },
  });
  return { delivered: result.ok, status_code: result.status, error: result.error || null };
}

module.exports = { sign, checkUrl, drain, deliver, sendPing, RETRY_DELAYS_MS };
