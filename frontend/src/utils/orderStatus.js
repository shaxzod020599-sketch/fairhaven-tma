/**
 * Order status helpers — shared between Orders list, detail, timeline,
 * and the Home active-order banner. Single source of truth for labels,
 * tone colors and the forward progression.
 */

export const STATUS_META = {
  pending: {
    label: 'В обработке',
    short: 'Ожидает',
    tone: 'pending',
    glyph: '⏳',
    desc: 'Оператор FairHaven Health проверяет заказ',
  },
  confirmed: {
    label: 'Подтверждён',
    short: 'Принят',
    tone: 'confirmed',
    glyph: '✓',
    desc: 'Заказ принят — готовим к доставке',
  },
  preparing: {
    label: 'Готовится',
    short: 'Готовится',
    tone: 'confirmed',
    glyph: '🌿',
    desc: 'Собираем ваш заказ',
  },
  delivering: {
    label: 'В пути',
    short: 'Доставляется',
    tone: 'confirmed',
    glyph: '🚚',
    desc: 'Курьер уже везёт заказ',
  },
  delivered: {
    label: 'Доставлен',
    short: 'Доставлен',
    tone: 'delivered',
    glyph: '🎉',
    desc: 'Заказ доставлен. Спасибо!',
  },
  cancelled: {
    label: 'Отменён',
    short: 'Отменён',
    tone: 'cancelled',
    glyph: '×',
    desc: 'Заказ отменён',
  },
};

// Forward progression — timeline steps the order passes through.
export const TIMELINE_STEPS = [
  'pending',
  'confirmed',
  'preparing',
  'delivering',
  'delivered',
];

export function statusMeta(status) {
  return STATUS_META[status] || STATUS_META.pending;
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

export function isActive(status) {
  // An order the customer still cares about (not closed out).
  return ['pending', 'confirmed', 'preparing', 'delivering'].includes(status);
}

export function canCancel(status) {
  return status === 'pending';
}
