/**
 * Text helpers shared by the Telegram order cards.
 *
 * Everything here is pure and total. A card shows what a marketplace sent, and a
 * field it left out — or sent in a shape we do not expect — must render as
 * nothing, never as a broken card: the card is the operator's only prompt to act.
 */
const TZ = 'Asia/Tashkent';

// Bound escaped units, never cut an entity or a Unicode code point.
function escaped(value, limit) {
  const raw = typeof value === 'string' ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
  let text = '';
  for (const point of raw) {
    const entity = ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[point] || point.toWellFormed();
    if (text.length + entity.length > limit - 1) return `${text}…`;
    text += entity;
  }
  return text;
}

function money(value) {
  const [whole, fraction] = String(Math.round(Number(value) * 100) / 100 || 0).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${fraction ? `,${fraction}` : ''} UZS`;
}

/** Free text from outside on one line: whitespace collapsed, bounded, escaped. */
function note(value, limit = 300) {
  return typeof value === 'string' ? escaped(value.replace(/\s+/g, ' ').trim(), limit) : '';
}

const clockFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dayFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, day: '2-digit', month: '2-digit' });

/** Tashkent wall-clock time, "11:10". The day is added only when it is not `at`'s day. */
function clock(value, at = new Date()) {
  const date = value instanceof Date ? value
    : typeof value === 'string' && value && value.length <= 64 ? new Date(value) : null;
  if (!date || !Number.isFinite(+date)) return '';
  const day = dayFormat.format(date);
  const today = Number.isFinite(+new Date(at)) ? dayFormat.format(new Date(at)) : '';
  return day === today ? clockFormat.format(date) : `${day} ${clockFormat.format(date)}`;
}

/** "принят 11:02 · готов 11:09" from [label, time] pairs; a step without a time is skipped. */
function timeline(steps, at) {
  return steps.map(([label, value]) => {
    const time = clock(value, at);
    return time ? `${label} ${time}` : '';
  }).filter(Boolean).join(' · ');
}

const PAYMENT = { CARD: '💳 Оплата: картой', CASH: '💵 Оплата: наличными' };
/** paymentInfo.paymentType of the grocery order contract (Yandex, Uzum). */
function payment(type) {
  return typeof type === 'string' && Object.hasOwn(PAYMENT, type) ? PAYMENT[type] : '';
}

// What the order's accounting status means for the shelf, in the operator's words.
const STOCK = {
  received: 'товар ещё не списан', reserved: 'товар отложен под заказ', sold: 'продано, товар списан',
  cancelled: 'резерв снят, товар вернулся в продажу', failed: '⚠️ ошибка — проверьте заказ в панели',
};

/** A map link for coordinates, or '' when they are not a real point. */
function mapLink(latitude, longitude, label) {
  if (typeof latitude !== 'number' || typeof longitude !== 'number'
    || !Number.isFinite(latitude) || !Number.isFinite(longitude)
    || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || (latitude === 0 && longitude === 0)) return '';
  return `<a href="https://yandex.uz/maps/?pt=${longitude.toFixed(6)},${latitude.toFixed(6)}&amp;z=17&amp;l=map">${escaped(label, 64)}</a>`;
}

module.exports = { STOCK, clock, escaped, mapLink, money, note, payment, timeline };
