const money = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

export function formatMoney(value) {
  return `${money.format(Number(value) || 0).replace(/\u00a0/g, ' ')} сум`;
}

export function formatNumber(value) {
  return money.format(Number(value) || 0).replace(/\u00a0/g, ' ');
}

export function formatDateTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Tashkent',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function shortId(value = '') {
  return String(value).slice(-6).toUpperCase();
}

/**
 * Russian plural agreement: plural(2, 'заказ', 'заказа', 'заказов') → 'заказа'.
 * Operators read these counts all day; "1 новых заказа" reads as a bug.
 */
export function plural(count, one, few, many) {
  const n = Math.abs(Number(count) || 0) % 100;
  if (n > 10 && n < 20) return many;
  const last = n % 10;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

export function relativeUpdated(seconds) {
  if (seconds < 5) return 'обновлено только что';
  if (seconds < 60) return `обновлено ${seconds} сек назад`;
  return `обновлено ${Math.floor(seconds / 60)} мин назад`;
}
