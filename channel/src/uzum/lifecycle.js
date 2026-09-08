const { randomUUID } = require('node:crypto');
const { toUzum } = require('../adapters/uzum/statuses');

const ACCEPT_WINDOW_MS = 15 * 60_000;
const STALE_MS = 5 * 60_000;
const ACTIONS = ['accept', 'ready', 'reject'];
const ID = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
function failure(code, status = 409) {
  return Object.assign(new Error(code), { code, status });
}
function readActor(actor, { partner = false } = {}) {
  if (partner && actor?.type === 'uzum') return { type: 'uzum', telegramId: null, name: 'Uzum' };
  if (!['admin-panel', 'telegram'].includes(actor?.type)
    || !Number.isSafeInteger(actor.telegramId) || actor.telegramId <= 0) return null;
  return { type: actor.type, telegramId: actor.telegramId, name: Array.from(String(actor.name || 'Admin')).slice(0, 100).join('') };
}
function deadlineAt(row) {
  const created = new Date(row.createdAt).getTime();
  return Number.isFinite(created) ? new Date(created + ACCEPT_WINDOW_MS) : null;
}
function needsReview(row, at) {
  const operation = row.uzum?.operation;
  return row.uzum?.version !== 1 || row.uzum?.reconciliationRequired === true
    || row.billz?.reconciliationRequired === true
    || (row.status === 'failed' && row.billz?.failureDisposition !== 'retry_safe')
    || Boolean(operation?.token && (!operation.startedAt || at - new Date(operation.startedAt) >= STALE_MS));
}
function cleanOrder(row, at = new Date()) {
  const deadline = deadlineAt(row);
  const expired = !deadline || at >= deadline;
  const reconciliationRequired = needsReview(row, at);
  const inProgress = Boolean(row.uzum?.operation?.token || row.billz?.operationToken);
  const cancellationPending = Boolean(row.uzum?.cancelRequested && row.status !== 'cancelled');
  const allowed = !reconciliationRequired && !inProgress && !cancellationPending;
  return {
    id: row.internalOrderId, externalId: row.externalId, status: toUzum(row.status, row.billz, row.uzum),
    accountingStatus: row.status, createdAt: row.createdAt, deadlineAt: deadline, expired,
    items: (row.items || []).map(({ billzProductId, name, quantity, unitPrice }) => ({ billzProductId, name, quantity, unitPrice })),
    totalAmount: row.totalAmount || 0,
    customer: { name: row.customer?.name || '', phone: row.customer?.phone || '' },
    inProgress, reconciliationRequired, cancellationPending,
    actions: allowed ? [
      ...(!expired && ['received', 'failed'].includes(row.status) ? ['accept'] : []),
      ...(row.status === 'reserved' && row.billz?.reservationApplied && row.uzum?.acceptedAt ? ['ready'] : []),
      ...(!['sold', 'cancelled'].includes(row.status) ? ['reject'] : []),
    ] : [],
    audit: row.uzum?.audit || [],
  };
}

async function checkAvailability(row) {
  const catalog = require('../core/catalog');
  const images = require('../media/images');
  const { supportedEntry } = require('../adapters/uzum/serializers');
  const totals = new Map();
  for (const item of row.items) totals.set(item.billzProductId, (totals.get(item.billzProductId) || 0) + item.quantity);
  for (const [id, quantity] of totals) {
    const entry = await catalog.findForChannel('uzum', id);
    if (!entry || !supportedEntry(entry) || !images.hasUsableImage(entry.card)
      || !catalog.isAvailable(entry.card, entry.mirror, 'uzum')
      || quantity > catalog.publishedQuantity(entry.card, entry.mirror, 'uzum')) throw failure('uzum_unavailable');
  }
}

function createLifecycle({
  Model = require('../models/ChannelOrder')(), core = require('../core/orders'),
  now = () => new Date(), checkAvailability: available = checkAvailability,
  enabled = () => require('../config').uzum.enabled,
} = {}) {
  const filter = (id) => ({ channel: 'uzum', internalOrderId: id });
  async function getRaw(id) {
    const row = await Model.findOne(filter(id)).lean();
    if (!row) throw failure('uzum_not_found', 404);
    return row;
  }
  async function get(id) { const row = cleanOrder(await getRaw(id), now()); return { ...row, actions: enabled() ? row.actions : [], enabled: enabled() }; }
  async function list({ bucket = 'active', page = 1, limit = 30 } = {}) {
    if (!['active', 'history', 'all'].includes(bucket) || !Number.isSafeInteger(page) || page < 1
      || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw failure('uzum_invalid_query', 422);
    const query = { channel: 'uzum', ...(bucket === 'all' ? {} : bucket === 'history'
      ? { status: { $in: ['sold', 'cancelled'] } }
      : { $or: [{ status: { $nin: ['sold', 'cancelled'] } }, { 'uzum.reconciliationRequired': true }, { 'billz.reconciliationRequired': true }] }) };
    const [rows, total] = await Promise.all([
      Model.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Model.countDocuments(query),
    ]);
    return { enabled: enabled(), data: rows.map((row) => { const clean = cleanOrder(row, now()); return { ...clean, actions: enabled() ? clean.actions : [] }; }), meta: { page, limit, total } };
  }
  async function markReview(id, token) {
    await Model.updateOne({ ...filter(id), ...(token ? { 'uzum.operation.token': token } : {}) }, {
      $set: { 'uzum.reconciliationRequired': true, 'uzum.notification.pending': true, 'uzum.notification.retryAt': null }, $inc: { 'uzum.revision': 1 },
    });
  }
  async function decide(id, input = {}, { partner = false } = {}) {
    if (!enabled()) throw failure('uzum_disabled', 503);
    const { action } = input;
    const actor = readActor(input.actor, { partner });
    if (!actor || (actor.type === 'uzum' && action !== 'reject')) throw failure('uzum_invalid_actor', 422);
    if (!ACTIONS.includes(action)) throw failure('uzum_invalid_action', 422);
    if (input.reason !== undefined && (typeof input.reason !== 'string' || input.reason.length > 300)) throw failure('uzum_invalid_reason', 422);
    const reason = String(input.reason || (actor.type === 'uzum' ? 'Cancelled by Uzum' : 'Отклонено оператором')).trim();
    let row = await getRaw(id);
    if (action === 'reject' && row.status === 'cancelled') return { order: cleanOrder(row, now()), idempotent: true };
    if (action === 'reject') {
      // Preserve the first request even when another process owns the decision.
      await Model.updateOne({ ...filter(id), 'uzum.cancelRequested': null }, {
        $set: { 'uzum.cancelRequested': { at: now(), actor, reason }, 'uzum.notification.pending': true, 'uzum.notification.retryAt': null }, $inc: { 'uzum.revision': 1 },
        $push: { 'uzum.audit': { $each: [{ action, actor, reason, at: now(), outcome: 'requested' }], $slice: -100 } },
      });
      row = await getRaw(id);
      if (row.status === 'sold') { await markReview(id); throw failure('uzum_reconciliation_required'); }
    }
    if (needsReview(row, now())) { await markReview(id); throw failure('uzum_reconciliation_required'); }
    if (row.uzum?.operation?.token || row.billz?.operationToken) throw failure('uzum_operation_in_progress');
    if (row.uzum?.cancelRequested && action !== 'reject') throw failure('uzum_cancellation_pending');
    if (action === 'accept' && row.uzum?.acceptedAt && ['reserved', 'sold'].includes(row.status)) return { order: cleanOrder(row, now()), idempotent: true };
    if (action === 'ready' && row.status === 'sold') return { order: cleanOrder(row, now()), idempotent: true };
    if (row.status === 'cancelled') throw failure('uzum_cancelled');
    if (action === 'ready' && (row.status !== 'reserved' || !row.billz?.reservationApplied || !row.uzum?.acceptedAt)) throw failure('uzum_not_accepted');
    if (action === 'accept' && (!deadlineAt(row) || now() >= deadlineAt(row))) throw failure('uzum_acceptance_expired');
    const token = randomUUID();
    const claim = await Model.findOneAndUpdate({
      ...filter(id), status: row.status, 'uzum.reconciliationRequired': { $ne: true },
      'billz.reconciliationRequired': { $ne: true },
      ...(action !== 'reject' ? { 'uzum.cancelRequested': null } : {}),
      $or: [{ 'uzum.operation.token': null }, { 'uzum.operation.token': '' }],
    }, {
      $set: { 'uzum.operation': { token, action, actor, startedAt: now() }, 'uzum.notification.pending': true, 'uzum.notification.retryAt': null },
      $inc: { 'uzum.revision': 1 },
      $push: { 'uzum.audit': { $each: [{ action, actor, at: now(), outcome: 'started' }], $slice: -100 } },
    }, { new: true });
    if (!claim) throw failure('uzum_operation_in_progress');
    const owned = { ...filter(id), 'uzum.operation.token': token };
    async function finish(finalAction, finalActor, outcome, extra = {}, cancellation = false) {
      return Model.findOneAndUpdate({ ...owned, ...(!cancellation ? { 'uzum.cancelRequested': null } : {}) }, {
        $set: { 'uzum.operation': null, 'uzum.notification.pending': true, 'uzum.notification.retryAt': null, ...extra }, $inc: { 'uzum.revision': 1 },
        $push: { 'uzum.audit': { $each: [{ action: finalAction, actor: finalActor, at: now(), outcome }], $slice: -100 } },
      }, { new: true }).lean();
    }
    try {
      if (action === 'accept') {
        await available(await getRaw(id));
        row = await getRaw(id);
        if (!row.uzum?.cancelRequested) {
          if (now() >= deadlineAt(row)) throw failure('uzum_acceptance_expired');
          await core.reserveOrder(id);
          if (now() >= deadlineAt(row)) {
            await Model.updateOne({ ...owned, 'uzum.cancelRequested': null }, {
              $set: { 'uzum.cancelRequested': { at: now(), actor, reason: 'Acceptance deadline expired', deadline: true }, 'uzum.notification.pending': true, 'uzum.notification.retryAt': null },
              $inc: { 'uzum.revision': 1 },
            });
          }
        }
      } else if (action === 'ready') {
        row = await getRaw(id);
        if (!row.uzum?.cancelRequested) await core.completeOrder(id);
      }
      row = await getRaw(id);
      // Completion is checked in the database. A service return or stale object
      // cannot establish accounting success after a crash or ownership loss.
      if (action !== 'reject' && !row.uzum?.cancelRequested) {
        const proven = action === 'accept'
          ? row.status === 'reserved' && row.billz?.reservationApplied
          : row.status === 'sold' && row.soldAt;
        if (!proven || row.billz?.operationToken || row.billz?.reconciliationRequired) throw failure('uzum_reconciliation_required');
        const finished = await finish(action, actor, 'applied', action === 'accept' ? { 'uzum.acceptedAt': now() } : { 'uzum.readyAt': now() });
        if (finished) return { order: cleanOrder(finished, now()), idempotent: false };
        row = await getRaw(id);
      }
      if (row.uzum?.cancelRequested) {
        if (row.status === 'sold') throw failure('uzum_reconciliation_required');
        await core.cancelOrder(id, { reason: row.uzum.cancelRequested.reason });
        row = await getRaw(id);
        if (row.status !== 'cancelled' || row.billz?.reservationApplied || row.billz?.pendingApplied
          || row.billz?.operationToken || row.billz?.reconciliationRequired) throw failure('uzum_reconciliation_required');
        const finished = await finish('reject', row.uzum.cancelRequested.actor, 'applied', {}, true);
        if (!finished) throw failure('uzum_reconciliation_required');
        if (action !== 'reject') throw failure(row.uzum.cancelRequested.deadline ? 'uzum_acceptance_expired' : 'uzum_cancelled');
        return { order: cleanOrder(finished, now()), idempotent: false };
      }
      throw failure('uzum_reconciliation_required');
    } catch (err) {
      if (err.code === 'uzum_cancelled') throw err;
      const fresh = await getRaw(id);
      const safe = ['uzum_unavailable', 'uzum_acceptance_expired'].includes(err.code)
        || (!fresh.billz?.operationToken && fresh.billz?.failureDisposition === 'retry_safe');
      if (safe) {
        await finish(action, actor, 'failed', {}, true);
        throw failure(err.code?.startsWith('uzum_') ? err.code : 'uzum_accounting_failed');
      }
      await markReview(id, token);
      throw failure('uzum_reconciliation_required');
    }
  }
  async function drainCancellations() {
    if (!enabled()) return;
    const rows = await Model.find({ channel: 'uzum', status: { $nin: ['cancelled', 'sold'] },
      'uzum.cancelRequested': { $ne: null }, 'uzum.reconciliationRequired': { $ne: true } }).limit(50).lean();
    for (const row of rows) {
      const request = row.uzum?.cancelRequested;
      if (!request) continue;
      try { await decide(row.internalOrderId, { action: 'reject', actor: request.actor, reason: request.reason }, { partner: request.actor?.type === 'uzum' }); } catch (_) { /* durable intent stays pending */ }
    }
  }
  return { get, getRaw, list, decide, drainCancellations };
}
let runtime;
const service = () => (runtime ||= createLifecycle());
module.exports = { ACCEPT_WINDOW_MS, ACTIONS, ID, cleanOrder, createLifecycle, deadlineAt, readActor,
  get: (...args) => service().get(...args), list: (...args) => service().list(...args),
  decide: (...args) => service().decide(...args), drainCancellations: (...args) => service().drainCancellations(...args) };
