const { randomUUID, createHash } = require('node:crypto');
const picking = require('./picking');

const ID = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const ACTIONS = ['accept', 'cooking', 'ready', 'reject'];
const STATUSES = ['NEW', 'ACCEPTED_BY_RESTAURANT', 'COOKING', 'READY', 'TAKEN_BY_COURIER', 'DELIVERED', 'CANCELLED'];
const STALE_MS = 5 * 60_000;
const pending = { 'yandex.notification.pending': true, 'yandex.notification.retryAt': null };
function failure(code, status = 409) { return Object.assign(new Error(code), { code, status }); }
function readActor(actor) {
  if (!['admin-panel', 'telegram'].includes(actor?.type) || !Number.isSafeInteger(actor.telegramId) || actor.telegramId <= 0
    || (actor.name !== undefined && (typeof actor.name !== 'string' || actor.name.length > 100))) return null;
  return { type: actor.type, telegramId: actor.telegramId, name: actor.name || 'Admin' };
}
function reasonFor(value) {
  if (value !== undefined && (typeof value !== 'string' || value.length > 300)) throw failure('yandex_invalid_reason', 422);
  return (value || '').trim();
}
function revision(value) { return Number.isSafeInteger(value) && value >= 1; }
function needsReview(row, at = new Date()) {
  const y = row.yandex || {}; const b = row.billz || {};
  const stale = (token, started) => Boolean(token && (!started || at - new Date(started) >= STALE_MS));
  return Boolean(y.reconciliationRequired || b.reconciliationRequired
    || (row.status === 'failed' && b.failureDisposition !== 'retry_safe')
    || stale(y.operation?.token, y.operation?.startedAt) || stale(b.operationToken, b.operationStartedAt));
}
function cleanOrder(row, at = new Date(), flags = {}) {
  const config = require('../config');
  const enabled = flags.enabled ?? config.yandex.enabled;
  const accountingEnabled = flags.accountingEnabled ?? config.billzWriteEnabled;
  const y = row.yandex || {};
  const status = y.cancelRequested ? 'CANCELLED' : y.fulfillmentStatus || 'NEW';
  const reconciliationRequired = needsReview(row, at);
  const inProgress = Boolean(y.operation?.token || row.billz?.operationToken);
  const cancellationPending = Boolean(y.cancellationPending || (y.cancelRequested && row.status !== 'cancelled'));
  const allowed = enabled && !reconciliationRequired && !inProgress && !cancellationPending && status !== 'CANCELLED';
  return {
    id: row.internalOrderId, externalId: row.externalId, status, accountingStatus: row.status,
    revision: y.revision || 1, itemsRevision: y.itemsRevision || 1, itemsFrozen: Boolean(y.itemsFrozen),
    createdAt: row.createdAt, updatedAt: row.updatedAt,
    items: (row.items || []).map(({ billzProductId, name, quantity, unitPrice }) => ({ billzProductId, name, quantity, unitPrice })),
    totalAmount: row.totalAmount || 0,
    customer: { name: row.customer?.name || y.requestSnapshot?.deliveryInfo?.clientName || '',
      phone: row.customer?.phone || y.requestSnapshot?.deliveryInfo?.phoneNumber || '' },
    inProgress, reconciliationRequired, cancellationPending, enabled, accountingEnabled,
    actions: allowed ? [
      ...(accountingEnabled && !y.acceptedAt && ['received', 'failed'].includes(row.status) ? ['accept'] : []),
      ...(status === 'ACCEPTED_BY_RESTAURANT' && row.status === 'reserved' ? ['cooking'] : []),
      ...(accountingEnabled && y.acceptedAt && !y.readyAt && row.status === 'reserved' ? ['ready'] : []),
      ...(row.status !== 'cancelled' ? ['reject'] : []),
    ] : [],
    audit: (y.audit || []).slice(-100),
  };
}
function createLifecycle({ Model = require('../models/ChannelOrder')(), core = require('../core/orders'),
  now = () => new Date(), enabled = () => require('../config').yandex.enabled,
  accountingEnabled = () => require('../config').billzWriteEnabled,
  checkAvailability = picking.checkAvailability, resolveItems = picking.resolve,
} = {}) {
  const filter = (id) => ({ channel: 'yandex', internalOrderId: id });
  const clean = (row) => cleanOrder(row, now(), { enabled: enabled(), accountingEnabled: accountingEnabled() });
  async function getRaw(id) {
    if (typeof id !== 'string' || !ID.test(id)) throw failure('yandex_not_found', 404);
    let row = await Model.findOne(filter(id)).lean();
    if (!row) throw failure('yandex_not_found', 404);
    if (!row.yandex?.version) {
      // Phase one only received orders. Unknown accounting evidence is retained for review.
      const unsafe = row.status !== 'received' || row.billz?.operationToken || row.billz?.draftOrderId || row.billz?.reservationApplied;
      await Model.findOneAndUpdate({ ...filter(id), 'yandex.version': { $exists: false } }, { $set: {
        'yandex.version': 1, 'yandex.revision': 1, 'yandex.itemsRevision': 1,
        'yandex.itemsFrozen': Boolean(unsafe), 'yandex.fulfillmentStatus': 'NEW',
        'yandex.reconciliationRequired': Boolean(unsafe), 'yandex.cancellationPending': false,
        'yandex.cancelRequested': null, 'yandex.operation': null, ...pending,
      } });
      row = await Model.findOne(filter(id)).lean();
    }
    return row;
  }
  async function get(id) { return clean(await getRaw(id)); }
  async function list({ bucket = 'active', page = 1, limit = 30 } = {}) {
    if (!['active', 'history', 'all'].includes(bucket) || !Number.isSafeInteger(page) || page < 1 || page > 100000
      || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw failure('yandex_invalid_query', 422);
    const history = { 'yandex.fulfillmentStatus': { $in: ['CANCELLED', 'DELIVERED'] },
      'yandex.cancellationPending': { $ne: true }, 'yandex.reconciliationRequired': { $ne: true },
      'billz.reconciliationRequired': { $ne: true }, 'yandex.operation.token': { $in: ['', null] },
      'billz.operationToken': { $in: ['', null] }, status: { $in: ['sold', 'cancelled'] } };
    const query = { channel: 'yandex', ...(bucket === 'history' ? history : bucket === 'active' ? { $nor: [history] } : {}) };
    const [rows, total] = await Promise.all([Model.find(query).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(), Model.countDocuments(query)]);
    return { enabled: enabled(), accountingEnabled: accountingEnabled(), data: rows.map(clean), meta: { page, limit, total } };
  }
  function audit(action, actor, reason, outcome, extra = {}) { return { $each: [{ action, actor, reason: reason.slice(0, 4096), at: now(), outcome, ...extra }], $slice: -100 }; }
  async function markReview(id) {
    await Model.updateOne({ ...filter(id), 'yandex.reconciliationRequired': { $ne: true } }, {
      $set: { 'yandex.reconciliationRequired': true, ...pending }, $inc: { 'yandex.revision': 1 },
    });
  }
  async function updateItems(id, input = {}) {
    if (!enabled()) throw failure('yandex_disabled', 503);
    const actor = readActor(input.actor); const reason = reasonFor(input.reason);
    if (!actor || !revision(input.expectedItemsRevision)) throw failure('yandex_invalid_items_request', 422);
    const row = await getRaw(id);
    if (row.yandex.itemsRevision !== input.expectedItemsRevision) throw failure('yandex_items_revision_conflict');
    if (row.yandex.itemsFrozen || row.yandex.cancelRequested || row.yandex.operation?.token || row.billz?.operationToken
      || needsReview(row, now()) || !['received', 'failed'].includes(row.status)) throw failure('yandex_items_locked');
    const composition = await resolveItems(row, input.items);
    const updated = await Model.findOneAndUpdate({ ...filter(id), 'yandex.revision': row.yandex.revision,
      'yandex.itemsRevision': input.expectedItemsRevision, 'yandex.itemsFrozen': false, 'yandex.cancelRequested': null,
      'yandex.operation.token': { $in: ['', null] }, 'billz.operationToken': { $in: ['', null] },
      'yandex.reconciliationRequired': { $ne: true }, 'billz.reconciliationRequired': { $ne: true },
    }, { $set: { ...composition, ...pending }, $inc: { 'yandex.revision': 1, 'yandex.itemsRevision': 1 },
      $push: { 'yandex.audit': audit('items', actor, reason, 'applied', {
        before: row.items.slice(0, 100).map(({ billzProductId, quantity, unitPrice }) => ({ billzProductId, quantity, unitPrice })),
        after: composition.items.map(({ billzProductId, quantity, unitPrice }) => ({ billzProductId, quantity, unitPrice })),
        beforeCount: row.items.length, afterCount: composition.items.length,
      }) } }, { new: true }).lean();
    if (!updated) throw failure('yandex_items_revision_conflict');
    return { order: clean(updated), idempotent: false };
  }
  async function requestCancellation(id, actor, reason, { expectedRevision, key, callback: metadata } = {}) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const row = await getRaw(id);
      if (row.yandex.cancelRequested) {
        if (key && row.yandex.decisions?.reject !== key) throw failure('yandex_revision_conflict');
        return { order: clean(row), idempotent: true };
      }
      if (expectedRevision !== undefined && row.yandex.revision !== expectedRevision) throw failure('yandex_revision_conflict');
      const paid = row.status === 'sold' || row.yandex.paymentConfirmedAt;
      const updated = await Model.findOneAndUpdate({ ...filter(id), 'yandex.revision': row.yandex.revision, 'yandex.cancelRequested': null }, {
        $set: { 'yandex.cancelRequested': { at: now(), actor, reason, ...(metadata ? { callback: metadata } : {}) },
          'yandex.fulfillmentStatus': 'CANCELLED', 'yandex.cancellationPending': true, ...pending,
          ...(paid ? { 'yandex.reconciliationRequired': true } : {}),
          ...(key ? { 'yandex.decisions.reject': key } : {}) },
        $inc: { 'yandex.revision': 1 }, $push: { 'yandex.audit': audit('reject', actor, reason, 'requested', metadata ? { metadata } : {}) },
      }, { new: true }).lean();
      if (updated) return { order: clean(updated), idempotent: false };
    }
    throw failure('yandex_operation_in_progress');
  }
  async function cleanupCancellation(id, ownerToken) {
    let row = await getRaw(id);
    if (!row.yandex.cancelRequested || !row.yandex.cancellationPending) return;
    if (row.status === 'sold' || row.yandex.paymentConfirmedAt || needsReview(row, now())) { await markReview(id); return; }
    if (row.billz.operationToken || (row.yandex.operation?.token && row.yandex.operation.token !== ownerToken)) return;
    if (!accountingEnabled() && (row.billz.draftOrderId || row.billz.reservationApplied || row.billz.pendingApplied)) return;
    const token = ownerToken || randomUUID();
    const claimed = await Model.findOneAndUpdate({ ...filter(id), 'yandex.cancellationPending': true,
      'yandex.operation.token': ownerToken || { $in: ['', null] }, 'billz.operationToken': { $in: ['', null] },
      'yandex.reconciliationRequired': { $ne: true }, 'billz.reconciliationRequired': { $ne: true },
    }, { $set: { 'yandex.operation': { token, action: 'reject', actor: row.yandex.cancelRequested.actor, startedAt: now() } } });
    if (!claimed) return;
    try {
      await core.cancelOrder(id, { reason: row.yandex.cancelRequested.reason });
      row = await getRaw(id);
      if (row.status !== 'cancelled' || row.billz.reservationApplied || row.billz.pendingApplied || row.billz.operationToken || row.billz.reconciliationRequired) {
        throw failure('yandex_reconciliation_required');
      }
      await Model.updateOne({ ...filter(id), 'yandex.operation.token': token }, {
        $set: { 'yandex.operation': null, 'yandex.cancellationPending': false, ...pending }, $inc: { 'yandex.revision': 1 },
        $push: { 'yandex.audit': audit('reject', row.yandex.cancelRequested.actor, row.yandex.cancelRequested.reason, 'applied') },
      });
    } catch (_) {
      row = await getRaw(id);
      if (!row.billz.operationToken && row.billz.failureDisposition === 'retry_safe') {
        await Model.updateOne({ ...filter(id), 'yandex.operation.token': token }, { $set: { 'yandex.operation': null, ...pending } });
      } else await markReview(id);
    }
  }
  async function decide(id, input = {}) {
    if (!enabled()) throw failure('yandex_disabled', 503);
    const action = input.action; const actor = readActor(input.actor); const reason = reasonFor(input.reason);
    if (!ACTIONS.includes(action) || !actor || !revision(input.expectedRevision)
      || (action === 'accept' && !revision(input.expectedItemsRevision))) throw failure('yandex_invalid_decision', 422);
    // Disabled acceptance must not even lazily upgrade a phase-one record.
    if (['accept', 'ready'].includes(action) && !accountingEnabled()) throw failure('yandex_accounting_disabled', 503);
    const key = createHash('sha256').update(JSON.stringify([action, actor, reason, input.expectedRevision,
      action === 'accept' ? input.expectedItemsRevision : null])).digest('hex');
    let row = await getRaw(id);
    if (row.yandex.decisions?.[action] === key) return { order: clean(row), idempotent: true };
    if (row.yandex.revision !== input.expectedRevision) throw failure('yandex_revision_conflict');
    if (action === 'reject') {
      const requested = await requestCancellation(id, actor, reason, { expectedRevision: input.expectedRevision, key });
      await cleanupCancellation(id);
      return { order: await get(id), idempotent: requested.idempotent };
    }
    if (row.yandex.cancelRequested) throw failure('yandex_cancelled');
    if (needsReview(row, now())) { await markReview(id); throw failure('yandex_reconciliation_required'); }
    if (row.yandex.operation?.token || row.billz.operationToken) throw failure('yandex_operation_in_progress');
    if (action === 'accept' && row.yandex.itemsRevision !== input.expectedItemsRevision) throw failure('yandex_items_revision_conflict');
    if (!clean(row).actions.includes(action)) throw failure('yandex_invalid_transition');
    const token = randomUUID();
    const claim = await Model.findOneAndUpdate({ ...filter(id), 'yandex.revision': input.expectedRevision,
      'yandex.itemsRevision': row.yandex.itemsRevision, 'yandex.cancelRequested': null,
      'yandex.operation.token': { $in: ['', null] }, 'billz.operationToken': { $in: ['', null] },
      'yandex.reconciliationRequired': { $ne: true }, 'billz.reconciliationRequired': { $ne: true },
    }, { $set: { 'yandex.operation': { token, action, actor, startedAt: now() },
      ...(action === 'accept' ? { 'yandex.itemsFrozen': true } : {}), ...pending }, $inc: { 'yandex.revision': 1 },
    $push: { 'yandex.audit': audit(action, actor, reason, 'started') } }, { new: true });
    if (!claim) throw failure('yandex_revision_conflict');
    const owned = { ...filter(id), 'yandex.operation.token': token };
    try {
      if (action === 'accept') { await checkAvailability(await getRaw(id)); await core.reserveOrder(id); }
      if (action === 'ready') await core.completeOrder(id);
      // Only this local, owned finalization retries. Accounting above is never
      // repeated when a courier callback advances the public revision.
      for (let attempt = 0; attempt < 12; attempt += 1) {
        row = await getRaw(id);
        if (row.yandex.cancelRequested) { await cleanupCancellation(id, token); throw failure('yandex_cancelled'); }
        const at = now();
        const proof = action === 'ready'
          ? { status: 'sold', soldAt: row.soldAt, 'billz.reservationApplied': false, 'billz.pendingApplied': false }
          : { status: 'reserved', 'billz.reservationApplied': true };
        const proven = action === 'ready' ? row.status === 'sold' && row.soldAt && !row.billz.reservationApplied && !row.billz.pendingApplied
          : row.status === 'reserved' && row.billz.reservationApplied;
        if (!proven || row.yandex.operation?.token !== token || row.billz.operationToken || needsReview(row, at)
          || !row.yandex.itemsFrozen || row.yandex.itemsRevision !== claim.yandex.itemsRevision) throw failure('yandex_reconciliation_required');
        const target = { accept: 'ACCEPTED_BY_RESTAURANT', cooking: 'COOKING', ready: 'READY' }[action];
        const status = STATUSES.indexOf(row.yandex.fulfillmentStatus) > STATUSES.indexOf(target) ? row.yandex.fulfillmentStatus : target;
        const finished = await Model.findOneAndUpdate({ ...owned, ...proof,
          'yandex.cancelRequested': null, 'yandex.revision': row.yandex.revision,
          'yandex.itemsFrozen': true, 'yandex.itemsRevision': claim.yandex.itemsRevision,
          'yandex.operation.startedAt': { $gt: new Date(at.getTime() - STALE_MS) },
          'yandex.reconciliationRequired': { $ne: true }, 'billz.reconciliationRequired': { $ne: true },
          'billz.operationToken': { $in: ['', null] },
        }, {
          $set: { 'yandex.operation': null, 'yandex.fulfillmentStatus': status, [`yandex.decisions.${action}`]: key, ...pending,
            ...(action === 'accept' ? { 'yandex.acceptedAt': at } : action === 'ready' ? { 'yandex.readyAt': at } : {}) },
          $inc: { 'yandex.revision': 1 }, $push: { 'yandex.audit': audit(action, actor, reason, 'applied') },
        }, { new: true }).lean();
        if (finished) return { order: clean(finished), idempotent: false };
      }
      throw failure('yandex_reconciliation_required');
    } catch (err) {
      row = await getRaw(id);
      if (row.yandex.cancelRequested) { await cleanupCancellation(id, token); throw failure('yandex_cancelled'); }
      const safe = ['yandex_unavailable', 'yandex_empty_items', 'yandex_invalid_items', 'yandex_invalid_total'].includes(err.code)
        || (!row.billz.operationToken && row.billz.failureDisposition === 'retry_safe');
      if (safe) {
        await Model.updateOne(owned, { $set: { 'yandex.operation': null,
          ...(action === 'accept' && !row.billz.draftOrderId ? { 'yandex.itemsFrozen': false } : {}), ...pending },
        $inc: { 'yandex.revision': 1 }, $push: { 'yandex.audit': audit(action, actor, reason, 'failed') } });
        throw failure(err.code?.startsWith('yandex_') ? err.code : 'yandex_accounting_failed');
      }
      await markReview(id); throw failure('yandex_reconciliation_required');
    }
  }
  async function callback(id, input) {
    const invalid = require('../adapters/yandex/contract').validateStatus(input);
    if (invalid) throw failure('yandex_invalid_callback', 422);
    // Accept transport-sized strings, retaining bounded durable/display metadata.
    const metadata = { ...input,
      ...(input.reason !== undefined ? { reason: input.reason.slice(0, 4096) } : {}),
      ...(input.comment !== undefined ? { comment: input.comment.slice(0, 4096) } : {}),
      ...(input.reason?.length > 4096 || input.comment?.length > 4096 ? { truncated: true } : {}),
    };
    if (input.status === 'CANCELLED') return requestCancellation(id, { type: 'yandex', name: 'Yandex' }, metadata.reason ?? metadata.comment ?? '', { callback: metadata });
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const row = await getRaw(id);
      if (row.yandex.cancelRequested || STATUSES.indexOf(row.yandex.fulfillmentStatus) >= STATUSES.indexOf(input.status)) return { order: clean(row), idempotent: true };
      const updated = await Model.findOneAndUpdate({ ...filter(id), 'yandex.revision': row.yandex.revision, 'yandex.cancelRequested': null }, {
        $set: { 'yandex.fulfillmentStatus': input.status, ...pending }, $inc: { 'yandex.revision': 1 },
        $push: { 'yandex.audit': audit(input.status, { type: 'yandex', name: 'Yandex' }, metadata.reason ?? metadata.comment ?? '', 'received', { metadata }) },
      }, { new: true }).lean();
      if (updated) return { order: clean(updated), idempotent: false };
    }
    throw failure('yandex_operation_in_progress');
  }
  async function drainCancellations() {
    const rows = await Model.find({ channel: 'yandex', 'yandex.cancellationPending': true,
      // Filter before limiting: disabled reserved orders and active owners must
      // not starve a later cancellation that can safely finish locally.
      'yandex.cancelRequested': { $ne: null }, 'yandex.paymentConfirmedAt': null,
      'yandex.reconciliationRequired': { $ne: true }, 'billz.reconciliationRequired': { $ne: true },
      'yandex.operation.token': { $in: ['', null] }, 'billz.operationToken': { $in: ['', null] },
      $or: [{ status: { $in: ['received', 'reserved', 'cancelled'] } }, { status: 'failed', 'billz.failureDisposition': 'retry_safe' }],
      ...(!accountingEnabled() ? { 'billz.draftOrderId': { $in: ['', null] },
        'billz.reservationApplied': { $ne: true }, 'billz.pendingApplied': { $ne: true } } : {}),
    }).sort({ updatedAt: 1, _id: 1 }).limit(50).lean();
    for (const row of rows) { try { await cleanupCancellation(row.internalOrderId); } catch (_) { /* Durable intent survives restarts. */ } }
  }
  return { get, getRaw, list, decide, updateItems, callback, drainCancellations };
}
let runtime;
const service = () => (runtime ||= createLifecycle());
function start() {
  if (!require('../config').yandex.enabled) return null;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await service().drainCancellations(); } catch (_) { require('../logger').error('yandex cancellation drain failed'); }
    finally { running = false; }
  };
  const timer = setInterval(tick, 5000); timer.unref?.(); void tick(); return timer;
}
module.exports = { ID, ACTIONS, STATUSES, STALE_MS, readActor, cleanOrder, createLifecycle, start,
  get: (...args) => service().get(...args), list: (...args) => service().list(...args),
  decide: (...args) => service().decide(...args), updateItems: (...args) => service().updateItems(...args),
  callback: (...args) => service().callback(...args), drainCancellations: (...args) => service().drainCancellations(...args) };
