/** '1 190 000 сум' / '1 190 000 so‘m'. Plain spaces between groups; render it with white-space: nowrap. */
export function formatSum(value, lang = 'ru') {
  const n = Math.round(Number(value) || 0);
  const digits = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${n < 0 ? '−' : ''}${digits} ${lang === 'uz' ? 'so‘m' : 'сум'}`;
}

/** Whole-percent discount, 0 when there is none. */
export function percentOff(price, oldPrice) {
  const p = Number(price) || 0;
  const o = Number(oldPrice) || 0;
  return o > p && o > 0 ? Math.round(((o - p) / o) * 100) : 0;
}
