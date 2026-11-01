import { useSettings } from '../../context/SettingsContext.jsx';
import { useI18n } from '../../i18n/index.jsx';

const TIME = /(\d{1,2})[:.](\d{2})/g;
const DAILY = /ежедневно|каждый день|har kuni|daily/i;

/**
 * Store hours as a sentence. Admins type them freely («Ежедневно · 9:00 – 21:00 (Asia/Tashkent)»): the time
 * zone note goes, and a «from – to» pair becomes «Ежедневно с 9:00 до 21:00» / «Har kuni 9:00 dan 21:00 gacha»
 * in the reader's language, so the dash never reaches the page.
 */
export function formatHours(raw, tf) {
  const text = String(raw || '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const times = [...text.matchAll(TIME)].map((x) => `${Number(x[1])}:${x[2]}`);
  if (times.length === 2) {
    const range = { from: times[0], to: times[1] };
    const prefix = text.slice(0, text.search(TIME)).replace(/[·•|,:–—-]+/g, ' ').trim();
    if (!prefix || DAILY.test(prefix)) return tf('shell.hoursDaily', range);
    return `${prefix} ${tf('shell.hoursRange', range)}`;
  }
  return text.replace(/\s*[–—]\s*/g, ' - ');
}

/** Phone, Telegram and hours from the public settings, ready for links. */
export function useContacts() {
  const { get } = useSettings();
  const { tf } = useI18n();
  const phone = String(get('support_phone') || '').trim();
  const tel = String(get('support_phone_tel') || phone).replace(/[^\d+]/g, '');
  const tg = String(get('support_tg') || '').trim().replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '');
  return {
    phone,
    tel: tel ? `tel:${tel}` : '',
    tg: tg ? `@${tg}` : '',
    tgUrl: tg ? `https://t.me/${tg}` : '',
    hours: formatHours(get('support_hours'), tf),
  };
}
