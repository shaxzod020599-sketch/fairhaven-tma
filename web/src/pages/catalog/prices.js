/**
 * Price presets of the catalogue filter. They write plain min/max to the URL, so a hand-made range
 * (?min=150000&max=300000) works too and shows as its own chip.
 */
import { formatSum } from '../../catalog/index.js';

export const PRICE_PRESETS = [
  { key: 'to200', min: 0, max: 200000 },
  { key: '200to500', min: 200000, max: 500000 },
  { key: '500to1000', min: 500000, max: 1000000 },
  { key: 'from1000', min: 1000000, max: 0 },
];

export const presetFor = (min, max) => PRICE_PRESETS.find((p) => p.min === min && p.max === max) || null;

/** «до 200 000 сум», «от 200 000 сум до 500 000 сум», «от 1 000 000 сум»; '' without a range. */
export function priceLabel(min, max, tf, lang) {
  if (min && max) return tf('catalog.price.between', { min: formatSum(min, lang), max: formatSum(max, lang) });
  if (max) return tf('catalog.price.upTo', { max: formatSum(max, lang) });
  if (min) return tf('catalog.price.over', { min: formatSum(min, lang) });
  return '';
}

/** Products per preset among `list` (the result with every filter applied except price). */
export function priceCounts(list) {
  return PRICE_PRESETS.map((p) => ({
    ...p,
    count: list.filter((item) => (!p.min || item.price >= p.min) && (!p.max || item.price <= p.max)).length,
  }));
}
