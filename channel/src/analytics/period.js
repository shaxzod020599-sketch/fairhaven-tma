const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const PRESET_DAYS = Object.freeze({ '1d': 1, '7d': 7, '30d': 30 });

function tashkentMidnight(value) {
  const shifted = new Date(new Date(value).getTime() + TASHKENT_OFFSET_MS);
  return new Date(Date.UTC(
    shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()
  ) - TASHKENT_OFFSET_MS);
}

function periodForPreset(preset = '7d', now = new Date()) {
  const days = PRESET_DAYS[preset];
  if (!days) throw new Error(`invalid analytics preset: ${preset}`);
  const to = new Date(now);
  if (Number.isNaN(to.getTime())) throw new Error('invalid analytics time');
  const from = new Date(tashkentMidnight(to).getTime() - (days - 1) * DAY_MS);
  return {
    preset,
    from,
    to,
    bucket: preset === '1d' ? 'hour' : 'day',
    currentBucketPartial: preset === '1d',
  };
}

function inHalfOpenRange(value, from, to) {
  const time = new Date(value).getTime();
  return time >= new Date(from).getTime() && time < new Date(to).getTime();
}

module.exports = {
  DAY_MS,
  PRESET_DAYS,
  TASHKENT_OFFSET_MS,
  inHalfOpenRange,
  periodForPreset,
  tashkentMidnight,
};
