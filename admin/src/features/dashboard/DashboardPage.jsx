import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { loadDashboard } from '../../api/dashboard';
import { formatDateTime, formatMoney, formatNumber, plural, relativeUpdated, shortId } from '../../lib/format';
import { AdminLink, navigate, useRoute } from '../../app/route';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { DataState } from '../../ui/DataState';
import { Badge } from '../../ui/Badge';

const PERIODS = [
  ['1d', 'Сегодня'],
  ['7d', '7 дней'],
  ['30d', '30 дней'],
];

const ACTION_LABELS = {
  'order.transition': 'Смена статуса заказа',
  'product.price': 'Изменение цены',
  'product.delete': 'Удаление товара',
  'customer.block': 'Блокировка клиента',
  'customer.unblock': 'Разблокировка клиента',
  'keys.pair': 'Выпуск ключей Medicalka',
  'broadcast.send': 'Запуск рассылки',
  'excel.apply': 'Применение Excel-импорта',
};

const SOURCE_LABELS = { 'fairhaven.uz': 'fairhaven.uz', medicalka: 'Medicalka', uzum: 'Uzum' };

export function activityLabel(action) {
  return ACTION_LABELS[action] || action;
}

/**
 * Native SVG bar chart. Bars are the period's revenue buckets; the surrounding
 * figure carries the accessible summary so the chart reads aloud sensibly.
 */
function RevenueChart({ series = [], period }) {
  const max = Math.max(1, ...series.map((bucket) => bucket.value));
  const total = series.reduce((sum, bucket) => sum + bucket.value, 0);
  const width = 640;
  const height = 140;
  const gap = 3;
  const bar = series.length ? (width - gap * (series.length - 1)) / series.length : width;

  const label = (key) => {
    if (period === '1d') return `${key.slice(11, 16)}`;
    const [, month, day] = key.split('-');
    return `${day}.${month}`;
  };

  return (
    <figure className="fh-revenue-chart" role="img" aria-label={`Выручка по ${period === '1d' ? 'часам' : 'дням'}: всего ${formatMoney(total)}`}>
      <svg viewBox={`0 0 ${width} ${height + 22}`} preserveAspectRatio="none" aria-hidden="true">
        {series.map((bucket, index) => {
          const h = Math.max(2, Math.round((bucket.value / max) * height));
          return (
            <rect
              key={bucket.key}
              x={index * (bar + gap)}
              y={height - h}
              width={bar}
              height={h}
              rx="2"
              className={bucket.value > 0 ? 'is-filled' : ''}
            >
              <title>{`${label(bucket.key)}: ${formatMoney(bucket.value)}`}</title>
            </rect>
          );
        })}
        {series.map((bucket, index) => (
          (series.length <= 12 || index % Math.ceil(series.length / 10) === 0) && (
            <text key={`t-${bucket.key}`} x={index * (bar + gap) + bar / 2} y={height + 16} textAnchor="middle">{label(bucket.key)}</text>
          )
        ))}
      </svg>
    </figure>
  );
}

export function DashboardPage({ load = loadDashboard }) {
  const route = useRoute();
  const urlPeriod = new URLSearchParams(route.split('?')[1] || '').get('period');
  const period = ['1d', '7d', '30d'].includes(urlPeriod) ? urlPeriod : '7d';

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(0);
  const [tick, setTick] = useState(Date.now());

  const refresh = useCallback(async () => {
    try {
      const response = await load(period);
      setData(response.data);
      setError('');
      setUpdatedAt(Date.now());
    } catch (err) {
      setError(err.message || 'Не удалось обновить данные');
    }
  }, [load, period]);

  useEffect(() => {
    refresh();
    const poll = window.setInterval(refresh, 20_000);
    return () => window.clearInterval(poll);
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const updated = useMemo(() => relativeUpdated(Math.floor((tick - updatedAt) / 1000)), [tick, updatedAt]);

  if (!data && error) return <DataState tone="error" title="Обзор недоступен" message={error} actionLabel="Повторить" onAction={refresh} />;
  if (!data) return <div className="fh-page-skeleton" aria-label="Загрузка обзора"><span /><span /><span /></div>;

  const {
    metrics = {}, series = [], topProducts = [], lowStock = [], conflicts = {},
    recentActivity = [], sources = [], billz = {}, attention = [],
  } = data;
  const pending = metrics.pending || 0;

  const ledger = [
    { label: 'Выручка', value: formatMoney(metrics.revenue), note: 'принятые заказы за период' },
    { label: 'Заказов', value: metrics.orders || 0, note: `${metrics.cancelled || 0} отклонено` },
    { label: 'Средний чек', value: formatMoney(metrics.averageCheck), note: 'по принятым заказам' },
  ];

  return (
    <div className="fh-page fh-dashboard">
      <header className="fh-page-head">
        <div><p className="fh-eyebrow">ОПЕРАТИВНАЯ СВОДКА</p><h1>Сегодня требует внимания</h1><p>{updated}</p></div>
        <div className="fh-head-actions">
          <div className="fh-tabs fh-tabs--compact" role="tablist" aria-label="Период">
            {PERIODS.map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={period === key} className={period === key ? 'is-active' : ''} onClick={() => navigate(key === '7d' ? '/' : `/?period=${key}`, { replace: true })}>{label}</button>
            ))}
          </div>
          <Button onClick={refresh}>Обновить</Button>
        </div>
      </header>

      {error && <div className="fh-stale-note">Свежие данные не загрузились. Показываем последнюю успешную сводку.</div>}

      <Card className="fh-pulse-card">
        <div className="fh-pulse-card__lead">
          <span className="fh-pulse-card__number">{pending}</span>
          <div>
            <b>{pending === 0
              ? 'Очередь пуста'
              : `${pending} ${plural(pending, 'новый заказ ждёт', 'новых заказа ждут', 'новых заказов ждут')} решения`}</b>
            <p>{pending === 0 ? 'Все заказы обработаны. Хорошая работа.' : 'Начните с самых старых — клиент уже ждёт.'}</p>
          </div>
        </div>
        <div className="fh-pulse-line" aria-hidden="true"><i /><i /><i /></div>
        <div className="fh-pulse-card__actions">
          <AdminLink to="/orders">Открыть очередь</AdminLink>
          {conflicts.count > 0 && <AdminLink to="/orders" className="fh-pulse-danger">⚠ {conflicts.count} конфликт Billz</AdminLink>}
          {attention.some((item) => item.destination === '/billz') && <AdminLink to="/billz" className="fh-pulse-danger">Billz требует внимания</AdminLink>}
          <AdminLink to="/products?filter=out_of_stock">Проверить остатки</AdminLink>
        </div>
      </Card>

      <section className="fh-metric-ledger" aria-label="Показатели периода">
        {ledger.map((metric) => (
          <div key={metric.label} className="fh-metric-ledger__item">
            <span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.note}</small>
          </div>
        ))}
      </section>

      {sources.length > 0 && (
        <section className="fh-source-overview" aria-label="Продажи по источникам">
          <div className="fh-source-overview__channels">
            {sources.map((source) => (
              <AdminLink key={source.source} to={`/sales?source=${encodeURIComponent(source.source)}&period=${period}`} className={source.state === 'unavailable' ? 'is-unavailable' : ''}>
                <span>{SOURCE_LABELS[source.source] || source.source}</span>
                {source.metrics ? <><strong>{formatMoney(source.metrics.grossRevenue)}</strong><small>{formatNumber(source.metrics.completedCount)} продаж</small></> : <><strong>Недоступно</strong><small>без подстановки оценки</small></>}
              </AdminLink>
            ))}
          </div>
          <Card className="fh-source-overview__billz">
            <div><p className="fh-eyebrow">ОТДЕЛЬНЫЙ КОНТУР</p><h2>Billz: весь бизнес</h2><p>Включает кассу и другие продажи Billz. Не складывается с каналами — иначе продажи задвоятся.</p></div>
            <div><strong>{billz.inventory ? `Доступно ${formatNumber(billz.inventory.sellableUnits)} шт.` : 'Остатки недоступны'}</strong><Badge tone={billz.sales?.state === 'report_access_required' ? 'warning' : 'neutral'}>{billz.sales?.state === 'report_access_required' ? 'Нужен доступ к отчётам' : 'Отдельная статистика'}</Badge><AdminLink to="/billz">Открыть Billz</AdminLink></div>
          </Card>
        </section>
      )}

      <Card className="fh-chart-card">
        <div className="fh-chart-card__head">
          <div><p className="fh-eyebrow">ВЫРУЧКА</p><h2>{period === '1d' ? 'По часам' : 'По дням'}</h2></div>
        </div>
        <RevenueChart series={series} period={period} />
      </Card>

      <div className="fh-dashboard-grid">
        <Card className="fh-list-card">
          <p className="fh-eyebrow">ЛИДЕРЫ ПРОДАЖ</p>
          <h2>Топ товаров</h2>
          {topProducts.length === 0 ? <p className="fh-muted">За период продаж не было.</p> : (
            <ol className="fh-top-list">
              {topProducts.map((product) => (
                <li key={product.name}><span>{product.name}</span><b className="fh-mono">{formatNumber(product.quantity)} шт · {formatMoney(product.amount)}</b></li>
              ))}
            </ol>
          )}
        </Card>

        <Card className="fh-list-card">
          <p className="fh-eyebrow">РИСК ОСТАТКОВ</p>
          <h2>Мало на складе</h2>
          {lowStock.length === 0 ? <p className="fh-muted">Все связанные товары в достатке.</p> : (
            <div className="fh-simple-list">
              {lowStock.map((item) => (
                <AdminLink key={item.productId} to={`/products?search=${encodeURIComponent(item.name)}`}>
                  <span><b>{item.name}</b><small>осталось {item.available} шт.</small></span>
                  <Badge tone={item.available === 0 ? 'danger' : 'warning'}>{item.available === 0 ? 'Нет' : 'Мало'}</Badge>
                </AdminLink>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="fh-list-card">
        <p className="fh-eyebrow">ПОСЛЕДНИЕ ДЕЙСТВИЯ</p>
        <h2>Журнал команды</h2>
        {recentActivity.length === 0 ? <p className="fh-muted">Пока пусто. Действия админов появятся здесь.</p> : (
          <div className="fh-activity-feed">
            {recentActivity.map((entry) => (
              <div key={entry._id}>
                <span><b>{activityLabel(entry.action)}</b><small>{entry.admin?.name || 'Система'} · {formatDateTime(entry.createdAt)}</small></span>
                {entry.entityType === 'order' && entry.entityId && <AdminLink to={`/orders/${entry.entityId}`} className="fh-mono">#{shortId(entry.entityId)}</AdminLink>}
              </div>
            ))}
          </div>
        )}
        <AdminLink to="/activity" className="fh-card-more">Вся история и рассылки →</AdminLink>
      </Card>
    </div>
  );
}
