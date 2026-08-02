const META = {
  pending: { label: 'Новый', tone: 'warning' },
  confirmed: { label: 'Принят', tone: 'burgundy' },
  preparing: { label: 'Собирается', tone: 'burgundy' },
  delivering: { label: 'У курьера', tone: 'burgundy' },
  delivered: { label: 'Доставлен', tone: 'success' },
  cancelled: { label: 'Отклонён', tone: 'danger' },
  returned: { label: 'Возврат', tone: 'danger' },
};

// How the operator's button reads for each destination status. The server is
// the authority on WHICH destinations are legal; this table only knows how to
// present a destination it is given.
const ACTION_META = {
  confirmed: { label: 'Принять заказ', tone: 'primary' },
  preparing: { label: 'Заказ собран', tone: 'primary' },
  delivering: { label: 'Передать курьеру', tone: 'primary' },
  delivered: { label: 'Доставлен', tone: 'primary' },
  cancelled: { label: 'Отклонить', tone: 'danger', reason: true },
  returned: { label: 'Оформить возврат', tone: 'danger', reason: true },
};

// Mirror of the server's legal-transition table, used only for the quick
// buttons on list rows before a detail response arrives. The server refuses
// anything stale, so drift here can annoy but never corrupt.
const TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['delivering', 'cancelled'],
  delivering: ['delivered', 'cancelled'],
  delivered: ['returned'],
  cancelled: [],
  returned: [],
};

export function statusMeta(status) {
  return META[status] || { label: status, tone: 'neutral' };
}

export function actionsFor(destinations = []) {
  return destinations
    .filter((to) => ACTION_META[to])
    .map((to) => ({ to, ...ACTION_META[to] }));
}

export function nextActions(status) {
  return actionsFor(TRANSITIONS[status] || []);
}

export function attentionReason(order, now = Date.now()) {
  if (order.billzSync?.conflict) return { key: 'billz', label: 'Конфликт Billz', priority: 3 };
  if (order.billzSync?.lastError) return { key: 'sync', label: 'Ошибка синхронизации', priority: 2 };
  const age = now - new Date(order.createdAt).getTime();
  if (order.status === 'pending' && age >= 30 * 60 * 1000) return { key: 'stale', label: 'Ждёт больше 30 минут', priority: 2 };
  if (order.status === 'pending') return { key: 'new', label: 'Новый заказ', priority: 1 };
  return null;
}

/** Pending ids present in `next` but absent from `previous` — the polling diff. */
export function newPendingIds(previous = [], next = []) {
  const seen = new Set(previous.map((order) => order._id));
  return next
    .filter((order) => order.status === 'pending' && !seen.has(order._id))
    .map((order) => order._id);
}
