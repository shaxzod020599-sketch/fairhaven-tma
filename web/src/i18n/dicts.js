// Flat dictionaries built from the namespace folders. Plain ESM so node:test can load it.
import * as ruNamespaces from './ru/index.js';
import * as uzNamespaces from './uz/index.js';

export const NAMESPACES = { ru: ruNamespaces, uz: uzNamespaces };

const flatten = (namespaces) => Object.assign({}, ...Object.values(namespaces));

export const DICTS = { ru: flatten(ruNamespaces), uz: flatten(uzNamespaces) };

/** '{n} из {total}' + {n: 3, total: 9} -> '3 из 9'. Unknown placeholders stay as written. */
export function interpolate(text, vars) {
  if (!vars) return text;
  return String(text).replace(/\{(\w+)\}/g, (match, name) => (vars[name] ?? match));
}

/**
 * Picks the word form for a count. Russian has three (1 товар, 2 товара, 5 товаров);
 * Uzbek has one. `forms` is an array or a 'товар|товара|товаров' string from a dictionary.
 */
export function pluralForm(lang, n, forms) {
  const list = Array.isArray(forms) ? forms : String(forms).split('|');
  if (lang !== 'ru' || list.length < 3) return list[0];
  const abs = Math.abs(Math.trunc(Number(n) || 0));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return list[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return list[1];
  return list[2];
}
