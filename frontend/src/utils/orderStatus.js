/**
 * Order status helpers — the customer-facing surface uses only three
 * states: pending (в обработке), confirmed (принят) and cancelled
 * (отклонён). Internal pipeline statuses like preparing/delivering/
 * delivered exist in the schema but are folded into "confirmed" here —
 * the customer doesn't need to track those steps.
 *
 *   active (shown on Home banner) → pending only
 *   history (list archive)        → confirmed / cancelled (and folded)
 */

const CONFIRMED_MAP = ['confirmed', 'preparing', 'delivering', 'delivered'];

export const STATUS_META = {
  pending: {
    label: 'В обработке',
    short: 'В обработке',
    tone: 'pending',
    glyph: '⏳',
    desc: 'Оператор FairHaven Health проверяет ваш заказ',
  },
  confirmed: {
    label: 'Заказ принят',
    short: 'Принят',
    tone: 'confirmed',
    glyph: '✓',
    desc: 'Ваш заказ принят — мы доставим его в ближайшее время',
  },
  cancelled: {
    label: 'Отклонён',
    short: 'Отклонён',
    tone: 'cancelled',
    glyph: '×',
    desc: 'Заказ отклонён',
  },
};

/**
 * Normalise any backend status into one of the three customer-facing
 * values. preparing/delivering/delivered all collapse into 'confirmed'.
 */
export function normalizeStatus(status) {
  if (CONFIRMED_MAP.includes(status)) return 'confirmed';
  if (status === 'cancelled') return 'cancelled';
  return 'pending';
}

export function statusMeta(status) {
  return STATUS_META[normalizeStatus(status)];
}

export function shortId(order) {
  const id = order?._id || order?.id || '';
  return id.toString().slice(-6).toUpperCase();
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tashkent',
  });
}

/** Only still-pending orders surface on the Home banner / bottom-nav badge. */
export function isActive(status) {
  return normalizeStatus(status) === 'pending';
}

export function canCancel(status) {
  return status === 'pending';
}
