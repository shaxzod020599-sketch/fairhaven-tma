/**
 * Package measure for marketplace catalogues.
 *
 * Every product is sold by the piece, but Yandex and Uzum both require a
 * measure in grams or millilitres (their schemas allow only GRM and MLT).
 * Owner decision 2026-10-07: take it from the name when printed there,
 * otherwise a nominal 100 g that operators can correct per product in the
 * panel. The correction is saved with the Yandex settings but describes the
 * product itself, so Uzum reads the same one.
 */
const NOMINAL_MEASURE = { unit: 'GRM', value: 100 };

function measureFor(settings, name) {
  if (settings.measure) return settings.measure;
  const printed = /(\d{1,5})\s*(ГР|Г|GR|G|МЛ|ML)(?![\p{L}])/iu.exec(name || '');
  if (!printed || Number(printed[1]) <= 0) return NOMINAL_MEASURE;
  return { unit: /^(МЛ|ML)$/i.test(printed[2]) ? 'MLT' : 'GRM', value: Number(printed[1]) };
}

module.exports = { NOMINAL_MEASURE, measureFor };
