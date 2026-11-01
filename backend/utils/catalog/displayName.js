/**
 * Display names for the shop, computed from the raw catalogue names.
 *
 * Raw names come from Billz in capitals with the brand and the pack glued on:
 * "БИОТИН 10,000 МКГ КАПС. №120 SOLGAR". The site shows the brand on its own
 * line and the pack on another, so the title keeps only what the product is:
 * "Биотин 10 000 мкг", spec "120 капсул". The raw name is never rewritten in
 * the database; integrations match products by it.
 */
const { stripBrands } = require('./brands');

const L = '\\p{L}\\p{N}';
const B = `(?<![${L}])`; // word start
const E = `(?![${L}])`; // word end
const rx = (source, flags = 'giu') => new RegExp(source, flags);

// Lines sold under one trademark. The rest of such a raw name is a Russian
// gloss of the trademark ("ДЛЯ ПОДДЕРЖКИ ФЕРТИЛЬНОСТИ"), so the title is the
// trademark itself, plus the gender where the line exists in both versions.
const LINES = [
  { re: rx(`${B}FH\\s*PRO${E}`), title: 'FH PRO', gendered: true },
  { re: rx(`${B}FERTILAID${E}`), title: 'FertilAid', gendered: true },
  { re: rx(`${B}OVABOOST${E}`), title: 'OvaBoost' },
  { re: rx(`${B}COUNTBOOST${E}`), title: 'CountBoost' },
  { re: rx(`${B}MOTILITYBOOST${E}`), title: 'MotilityBoost' },
  { re: rx(`${B}ISOFRESH${E}`), title: 'IsoFresh' },
  { re: rx(`${B}FERTILITEA${E}`), title: 'FertiliTea' },
  { re: rx(`${B}FERTILE\\s*CM${E}`), title: 'FertileCM' },
  { re: rx(`${B}BABYDANCE${E}`), title: 'BabyDance', keep: [rx(`${B}БЕЗ\\s+АППЛИКАТОРОВ${E}`)] },
];

// Trademarks written in Cyrillic transliteration, typos in the source data,
// and fixed spellings of vitamins. Applied to the upper-cased name; the
// replacement is final text that the casing pass leaves alone.
const PHRASES = [
  [`${B}НЕУРО-МАГ${E}`, 'Neuro-Mag'],
  [`${B}ХЕМА-ПЛЕКС${E}`, 'Hema-Plex'],
  [`${B}УЛЬТРА-МАГ${E}`, 'Ultra-Mag'],
  [`${B}ДАЙДЖЕСТ\\s+БЕЙСИК${E}`, 'Digest Basic'],
  [`${B}ДАЙДЖЕСТ\\s+КИДС${E}`, 'Digest Kids'],
  [`${B}ХЛОРОФРЕШ${E}`, 'ChloroFresh'],
  [`${B}ДЖЕНТЛ\\s+АЙРОН${E}`, 'Gentle Iron'],
  [`${B}СУПЕР\\s+ДЕЙЛИ${E}`, 'Super Daily'],
  [`${B}СУПЕР\\s+ОМЕГА[\\s-]*3${E}`, 'Super Omega-3'],
  [`${B}КОЛЛАГЕН\\s+UP(\\s+GOLD)?${E}`, 'CollagenUP'],
  [`${B}КОЛЛАГЕН\\s+ПЕПТИДЫ?${E}`, 'коллагеновые пептиды'],
  [`${B}ПРЕНАТАЛ\\s+МУЛЬТИВИТАМИН${E}`, 'пренатальный мультивитамин'],
  [`${B}ОСНОВНЫК${E}`, 'основные'],
  [`${B}АПЕЛСИН${E}`, 'апельсин'],
  [`${B}В-КОМПЛЕКС${E}`, 'B-комплекс'],
  [`${B}Д-ХИРО${E}`, 'D-хиро'],
  [`${B}[ВB][\\s-]?12${E}`, 'B12'],
  [`${B}ВИТАМИН\\s+[СC]${E}`, 'витамин C'],
  [`${B}[ДD][\\s-]?3${E}`, 'D3'],
  [`${B}[КK][\\s-]?2${E}`, 'K2'],
  [`${B}ОМЕГА[\\s-]*3${E}`, 'Омега-3'],
  // One card lost the start of its name: "-3 РЫБИЙ ЖИР".
  ['^\\s*-\\s*3(?![\\p{N}])', 'Омега-3'],
].map(([source, text]) => [rx(source), text]);

// Exact spellings for words the casing rules would get wrong.
const CASING = new Map(Object.entries({
  FERTILAID: 'FertilAid', OVABOOST: 'OvaBoost', COUNTBOOST: 'CountBoost', MOTILITYBOOST: 'MotilityBoost',
  ISOFRESH: 'IsoFresh', FERTILITEA: 'FertiliTea', FERTILECM: 'FertileCM', BABYDANCE: 'BabyDance',
  WELLBETX: 'WellBetX', BIGFRIENDS: 'BigFriends', MILKIES: 'Milkies', CHLOROFRESH: 'ChloroFresh',
  COLLAGENUP: 'CollagenUP', VERISOL: 'Verisol', MYO: 'Myo', 'D-CHIRO': 'D-Chiro', CHIRO: 'Chiro',
  COQ10: 'CoQ10', Q10: 'Q10', D3: 'D3', K2: 'K2', B12: 'B12', DHA: 'DHA', EPA: 'EPA', MSM: 'MSM',
  PQQ: 'PQQ', MCT: 'MCT', IU: 'IU', CM: 'CM', FH: 'FH', PRO: 'PRO', HMB: 'HMB', NAC: 'NAC',
  COENYME: 'Coenzyme', "KID'S": "Kid's", "BABY'S": "Baby's", KIDS: 'Kids', ДГК: 'ДГК', ЭПК: 'ЭПК', МЕ: 'МЕ',
}));

// Pack words that say nothing once the count has moved to the spec line.
const FORM_WORDS = rx(`${B}(КАПС\\.?|КАПСУЛ[АЫ]?|ТАБ\\.?|СОФТ\\.?|CAPSULES?|CAPS\\.?|TABLETS?|TAB\\.?|SOFTGELS?)(?=$|[^${L}])`);

const NUM = '\\d+(?:[.,]\\d+)*';
const DOSE_UNITS = 'МГ|MG|МКГ|MCG|IU|МЕ';
const DOSE = rx(`(${NUM}(?:\\s*\\/\\s*${NUM})?)\\s*(${DOSE_UNITS})(?![${L}])`);
const SIZE = rx(`(${NUM})\\s*(МЛ|ML|ГР|Г|GRAMS?|G|FL\\.?\\s*OZ|FL)(?![${L}])\\.?`);
const COUNT = rx(`(?:№|${B}N)\\s*(\\d+)(?![\\p{N}])`);
const PAREN = /\(([^()]*\d[^()]*)\)+/gu;
// Non-global twins for plain tests (a global regex keeps state between calls).
const SIZE_ONE = rx(SIZE.source, 'iu');
const DOSE_ONE = rx(DOSE.source, 'iu');
const COUNT_ONE = rx(COUNT.source, 'iu');

/** "10,000" -> "10 000", "5.000" -> "5000", "93,35" -> "93,35", "10.16" -> "10,16". */
function formatNumber(raw) {
  const text = String(raw).trim();
  let digits;
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(text)) digits = text.replace(/[.,]/g, '');
  else if (/^\d+$/.test(text)) digits = text;
  else return text.replace('.', ',');
  // Russian groups thousands from five digits on: 5000, but 10 000.
  return digits.length >= 5 ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : digits;
}

// 'uz' keeps the English units of the Latin names; 'uz-spec' is the Uzbek pack
// label: mkg (mikrogramm), XB (xalqaro birlik).
function doseUnit(unit, lang) {
  const u = unit.toUpperCase();
  const uzSpec = lang === 'uz-spec';
  if (u === 'МГ' || u === 'MG') return lang === 'ru' ? 'мг' : 'mg';
  if (u === 'МКГ' || u === 'MCG') return lang === 'ru' ? 'мкг' : uzSpec ? 'mkg' : 'mcg';
  return lang === 'ru' ? 'МЕ' : uzSpec ? 'XB' : 'IU';
}

function formatDose(amount, unit, lang = 'ru') {
  const value = amount.split('/').map((part) => formatNumber(part)).join('/');
  return `${value} ${doseUnit(unit, lang)}`;
}

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const COUNT_NOUNS = {
  capsule: ['капсула', 'капсулы', 'капсул'],
  softgel: ['мягкая капсула', 'мягкие капсулы', 'мягких капсул'],
  tablet: ['таблетка', 'таблетки', 'таблеток'],
  sachet: ['саше', 'саше', 'саше'],
  applicator: ['аппликатор', 'аппликатора', 'аппликаторов'],
  piece: ['шт', 'шт', 'шт'],
};

function countNoun(hint, upper) {
  if (/СОФТ|SOFTGEL/.test(hint)) return 'softgel';
  if (/КАПС|CAPS/.test(hint)) return 'capsule';
  if (/ТАБ|TAB/.test(hint)) return 'tablet';
  if (/ПАКЕТ|САШЕ|PACKET|SACHET/.test(hint)) return 'sachet';
  if (/АППЛИКАТОР|APPLICATOR/.test(hint)) return 'applicator';
  if (/ШТУК|DONA|PCS/.test(hint) && /КАПС|CAPS/.test(upper)) return 'capsule';
  // Fish oil sold by count always comes in capsules.
  if (/ОМЕГА|РЫБ|OMEGA/.test(upper) && !SIZE_ONE.test(upper)) return 'capsule';
  return 'piece';
}

function clean(text) {
  return String(text || '')
    .replace(/[   ]/g, ' ')
    .replace(/[’`ʼ]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function capitalizeFirst(text) {
  return text.replace(/\p{L}/u, (ch) => ch.toUpperCase());
}

const PROTECT_OPEN = '\u0001';
const PROTECT_CLOSE = '\u0002';
const protect = (text) => `${PROTECT_OPEN}${text}${PROTECT_CLOSE}`;

/** Case one word: dictionary, then mixed-case trademarks, then the language rule. */
function caseWord(word, lang) {
  const upper = word.toUpperCase();
  if (CASING.has(upper)) return CASING.get(upper);
  if (/\p{Lu}/u.test(word) && /\p{Ll}/u.test(word)) return word;
  if (/^[A-Z0-9'-]+$/i.test(word) && /\d/.test(word)) return upper;
  const latin = /^[A-Za-z'-]+$/.test(word);
  if (latin && lang === 'ru') {
    // A Latin word inside a Russian name is a trademark: short ones are
    // initialisms (UP, CM), longer ones are words ("Advanced", "Verisol").
    return word.length <= 3 ? upper : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }
  return word.toLowerCase();
}

function caseText(text, lang) {
  const cased = outsideProtected(text, (part) =>
    part.replace(/[\p{L}\p{N}'][\p{L}\p{N}'-]*/gu, (word) => {
      if (CASING.has(word.toUpperCase())) return CASING.get(word.toUpperCase());
      return word.split('-').map((piece) => (piece ? caseWord(piece, lang) : piece)).join('-');
    })
  );
  return cased.replace(new RegExp(`[${PROTECT_OPEN}${PROTECT_CLOSE}]`, 'gu'), '');
}

function tidy(text) {
  return text
    .replace(/\s*\+\s*/g, ' + ')
    .replace(/\s+-\s+/g, ', ')
    .replace(/\s+,/g, ',')
    .replace(/,(?=\S)/g, ', ')
    .replace(/\(\s*\)/g, '')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.+/-]+|[\s,.+/-]+$/g, '')
    .trim();
}

// Applies `fn` to the parts of `text` that are not protected yet.
function outsideProtected(text, fn) {
  return text
    .split(new RegExp(`(${PROTECT_OPEN}[^${PROTECT_CLOSE}]*${PROTECT_CLOSE})`, 'u'))
    .map((part) => (part.startsWith(PROTECT_OPEN) ? part : fn(part)))
    .join('');
}

/** Strips brand and pack, keeps single doses; shared by both languages. */
function coreName(name, brand, lang, phrases) {
  let text = clean(stripBrands(clean(name), brand)).toUpperCase();
  text = text.replace(PAREN, ' ').replace(/\)+/g, ')');
  text = text.replace(COUNT, ' ').replace(SIZE, ' ').replace(FORM_WORDS, ' ');
  text = text.replace(DOSE, (_m, amount, unit) =>
    amount.includes('/') ? ' ' : ` ${protect(formatDose(amount, unit, lang))} `
  );
  for (const [re, replacement] of phrases) {
    text = outsideProtected(text, (part) => part.replace(re, () => ` ${protect(replacement)} `));
  }
  // A number with no unit (Colastin "10.000") is not reliable enough to show.
  return outsideProtected(text, (part) => part.replace(rx(`(?<![${L}+-])\\d+(?:[.,]\\d+)*(?![${L}])`), ' '));
}

/**
 * Russian display name: sentence case, no brand, no pack.
 *   formatTitle('БИОТИН 10,000 МКГ КАПС. №120 SOLGAR', 'SOLGAR') -> 'Биотин 10 000 мкг'
 */
function formatTitle(name, brand) {
  const raw = clean(name);
  if (!raw) return '';
  const upper = raw.toUpperCase();
  const line = LINES.find(({ re }) => {
    re.lastIndex = 0;
    return re.test(upper);
  });
  if (line) {
    const extras = [];
    if (line.gendered && /ЖЕНЩИН/.test(upper)) extras.push('для женщин');
    else if (line.gendered && /МУЖЧИН/.test(upper)) extras.push('для мужчин');
    for (const keep of line.keep || []) {
      keep.lastIndex = 0;
      const hit = upper.match(keep);
      if (hit) extras.push(hit[0].toLowerCase());
    }
    return [line.title, ...extras].join(' ');
  }

  const text = coreName(raw, brand, 'ru', PHRASES);
  const cased = tidy(caseText(text, 'ru'));
  return cased ? capitalizeFirst(cased) : '';
}

/**
 * Display name from `nameUz`. That field holds the Latin-script (English or
 * Uzbek) name; anything in Cyrillic is not a Latin name, so it yields ''.
 */
function formatTitleUz(nameUz, brand) {
  const raw = clean(nameUz);
  if (!raw || /[\u0400-\u04FF]/.test(raw)) return '';
  const text = coreName(raw, brand, 'uz', []);
  const cased = tidy(caseText(text, 'uz'));
  return cased ? capitalizeFirst(cased) : '';
}

// Uzbek count words do not change with the number: "60 kapsula", "15 dona".
const COUNT_NOUNS_UZ = {
  capsule: 'kapsula',
  softgel: 'yumshoq kapsula',
  tablet: 'tabletka',
  sachet: 'sashe',
  applicator: 'applikator',
  piece: 'dona',
};

/**
 * Pack and dose line: "1250/1040 мг · 180 капсул", "50 мл · 15 шт", or ''.
 * Single doses stay in the title, so only combined ones ("125/100 мкг") and
 * doses the title drops (trademark lines) appear here.
 * lang 'uz' gives the same line with Uzbek units: "125/100 mkg · 60 kapsula".
 */
function formatSpec(name, brand, lang = 'ru') {
  const raw = clean(stripBrands(clean(name), brand));
  if (!raw) return '';
  const uz = lang === 'uz';
  const upper = raw.toUpperCase();
  const title = formatTitle(name, brand);
  const parts = [];
  const seen = [];

  for (const match of upper.matchAll(DOSE)) {
    const amount = match[1].replace(/\s+/g, '');
    const dose = formatDose(amount, match[2]);
    if (!title.includes(dose) && !seen.includes(dose)) {
      seen.push(dose);
      parts.push(uz ? formatDose(amount, match[2], 'uz-spec') : dose);
    }
  }

  const size = upper.match(SIZE_ONE);
  if (size) {
    const unit = size[2].toUpperCase();
    const ml = uz ? 'ml' : 'мл';
    if (/^FL/.test(unit)) parts.push(`${Math.round(Number(size[1].replace(',', '.')) * 29.5735)} ${ml}`);
    else parts.push(`${formatNumber(size[1])} ${/^(МЛ|ML)$/.test(unit) ? ml : uz ? 'g' : 'г'}`);
  }

  let count = null;
  let hint = '';
  for (const group of upper.matchAll(PAREN)) {
    const hit = group[1].match(/(\d+)\s*([\p{L}.]+)?/u);
    if (hit && !SIZE_ONE.test(group[1]) && !DOSE_ONE.test(group[1])) {
      count = Number(hit[1]);
      hint = group[1];
    }
  }
  const numbered = upper.match(COUNT_ONE);
  if (count === null && numbered) {
    count = Number(numbered[1]);
    hint = upper;
  }
  if (count) {
    const noun = countNoun(hint, upper);
    parts.push(`${count} ${uz ? COUNT_NOUNS_UZ[noun] : plural(count, ...COUNT_NOUNS[noun])}`);
  }
  return parts.join(' · ');
}

module.exports = { formatTitle, formatTitleUz, formatSpec, formatNumber };
