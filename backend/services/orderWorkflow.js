/**
 * The one place that knows which order status may follow which.
 *
 * The frontend renders whatever `allowedTransitions` returns and the transition
 * endpoint refuses everything else, so a stale button in an open browser tab
 * cannot skip a step or walk a delivered order back to "collecting".
 */

const TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['delivering', 'cancelled'],
  delivering: ['delivered', 'cancelled'],
  delivered: ['returned'],
  cancelled: [],
  returned: [],
};

// Destinations that erase expected revenue must say why — the reason lands in
// the status history and the audit log, not in a chat message nobody finds.
const REASON_REQUIRED = new Set(['cancelled', 'returned']);

const TERMINAL = new Set(['cancelled', 'returned']);

function allowedTransitions(status) {
  return TRANSITIONS[status] ? [...TRANSITIONS[status]] : [];
}

function historyEntry(status, admin, reason = '') {
  return {
    status,
    at: new Date(),
    by: {
      telegramId: admin?.telegramId ?? null,
      name: [admin?.firstName, admin?.lastName].filter(Boolean).join(' ')
        || admin?.username || '',
    },
    reason: String(reason || '').slice(0, 500),
  };
}

/**
 * Mutates `order` in place (status + history) but does not save — the caller
 * owns persistence and its own side effects. Throws coded errors:
 * `invalid_status`, `illegal_transition`, `reason_required`.
 */
function transition({ order, to, reason = '', admin }) {
  if (!Object.prototype.hasOwnProperty.call(TRANSITIONS, to)) {
    const err = new Error(`unknown status: ${to}`);
    err.code = 'invalid_status';
    throw err;
  }
  const legal = TRANSITIONS[order.status] || [];
  if (!legal.includes(to)) {
    const err = new Error(`${order.status} → ${to} is not a legal transition`);
    err.code = 'illegal_transition';
    err.allowed = legal;
    throw err;
  }
  if (REASON_REQUIRED.has(to) && !String(reason || '').trim()) {
    const err = new Error(`a reason is required to move an order to ${to}`);
    err.code = 'reason_required';
    throw err;
  }
  order.status = to;
  order.statusHistory.push(historyEntry(to, admin, reason));
  return order;
}

/**
 * The explicit correction tool: any non-pending order returns to the queue.
 * Deliberately outside TRANSITIONS — it is not a forward step, it is an undo,
 * and it keeps its own history entry so the trail shows who walked it back.
 */
function revert({ order, admin, reason = '' }) {
  if (order.status === 'pending') {
    const err = new Error('order is already pending');
    err.code = 'already_pending';
    throw err;
  }
  order.status = 'pending';
  order.statusHistory.push(historyEntry('pending', admin, reason || 'возврат в очередь'));
  return order;
}

module.exports = {
  TRANSITIONS,
  REASON_REQUIRED,
  TERMINAL,
  allowedTransitions,
  transition,
  revert,
  historyEntry,
};
