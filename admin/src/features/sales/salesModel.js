export const SALES_SOURCES = [
  { value: 'fairhaven.uz', label: 'fairhaven.uz', note: 'Наш сайт и Telegram-бот' },
  { value: 'medicalka', label: 'Medicalka', note: 'Маркетплейс Medicalka' },
  { value: 'uzum', label: 'Uzum', note: 'Маркетплейс Uzum Tezkor' },
];

export const SALES_PERIODS = [
  { value: '1d', label: 'Сегодня' },
  { value: '7d', label: '7 дней' },
  { value: '30d', label: '30 дней' },
];

const FAIRHAVEN_STATUSES = [
  ['pending', 'Новый', 'warning'],
  ['confirmed', 'Подтверждён', 'burgundy'],
  ['preparing', 'Сборка', 'burgundy'],
  ['delivering', 'Доставка', 'burgundy'],
  ['delivered', 'Доставлен', 'success'],
  ['cancelled', 'Отменён', 'danger'],
  ['returned', 'Возврат', 'warning'],
];

const CHANNEL_STATUSES = [
  ['received', 'Получен', 'neutral'],
  ['reserved', 'Резерв', 'burgundy'],
  ['sold', 'Продан', 'success'],
  ['cancelled', 'Отменён', 'danger'],
  ['failed', 'Ошибка', 'danger'],
];

const asOptions = (rows) => rows.map(([value, label, tone]) => ({ value, label, tone }));
const STATUS_OPTIONS = {
  'fairhaven.uz': asOptions(FAIRHAVEN_STATUSES),
  medicalka: asOptions(CHANNEL_STATUSES),
  uzum: asOptions(CHANNEL_STATUSES),
};

export function sourceMeta(source) {
  return SALES_SOURCES.find((item) => item.value === source) || SALES_SOURCES[0];
}

export function statusOptions(source) {
  return STATUS_OPTIONS[source] || STATUS_OPTIONS['fairhaven.uz'];
}

export function statusMeta(source, status) {
  return statusOptions(source).find((item) => item.value === status)
    || { value: status, label: status || 'Все статусы', tone: 'neutral' };
}

function positivePage(value) {
  const page = Number.parseInt(value, 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export function parseSalesRoute(route = '/sales') {
  const query = new URLSearchParams(String(route).split('?')[1] || '');
  const source = SALES_SOURCES.some((item) => item.value === query.get('source'))
    ? query.get('source')
    : 'fairhaven.uz';
  const period = SALES_PERIODS.some((item) => item.value === query.get('period'))
    ? query.get('period')
    : '7d';
  const requestedStatus = query.get('status') || '';
  const status = statusOptions(source).some((item) => item.value === requestedStatus)
    ? requestedStatus
    : '';
  return {
    source,
    period,
    status,
    search: String(query.get('search') || '').slice(0, 100),
    page: positivePage(query.get('page')),
  };
}

export function salesRoute(current, patch = {}) {
  const sourceChanged = patch.source !== undefined && patch.source !== current.source;
  const resetsPage = sourceChanged
    || patch.period !== undefined
    || patch.status !== undefined
    || patch.search !== undefined;
  const next = parseSalesRoute(`/sales?${new URLSearchParams({
    ...current,
    ...patch,
    ...(sourceChanged && patch.status === undefined ? { status: '' } : {}),
    ...(resetsPage && patch.page === undefined ? { page: 1 } : {}),
  })}`);
  const params = new URLSearchParams();
  params.set('source', next.source);
  params.set('period', next.period);
  if (next.status) params.set('status', next.status);
  if (next.search) params.set('search', next.search);
  if (next.page > 1) params.set('page', String(next.page));
  return `/sales?${params}`;
}
