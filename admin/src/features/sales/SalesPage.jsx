import React, { useEffect, useMemo, useState } from 'react';
import { analyticsApi } from '../../api/analytics';
import { navigate, useRoute } from '../../app/route';
import { formatDateTime, formatMoney, formatNumber, shortId } from '../../lib/format';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { DataState } from '../../ui/DataState';
import { Pagination } from '../../ui/Pagination';
import {
  SALES_PERIODS,
  SALES_SOURCES,
  parseSalesRoute,
  salesRoute,
  sourceMeta,
  statusMeta,
  statusOptions,
} from './salesModel';

const BILLZ_STATE = {
  posted: ['Записан', 'success'],
  reserved: ['Резерв', 'burgundy'],
  released: ['Снят', 'neutral'],
  error: ['Ошибка', 'danger'],
  conflict: ['Конфликт', 'danger'],
  pending: ['Ожидает', 'warning'],
};

function saveBlob({ blob, filename }) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function Metrics({ values = {} }) {
  const metrics = [
    ['Валовая выручка', formatMoney(values.grossRevenue), `${formatNumber(values.completedCount)} завершено`],
    ['Возвраты', formatMoney(values.returnedAmount), 'отдельно от валовой выручки'],
    ['Чистая выручка', formatMoney(values.netRevenue), 'валовая минус возвраты'],
    ['Продажи', formatNumber(values.completedCount), `${formatNumber(values.cancelledCount)} отменено`],
    ['Средний чек', formatMoney(values.averageCheck), 'по завершённым продажам'],
    ['Товаров продано', `${formatNumber(values.unitsSold)} шт.`, values.failedCount ? `${values.failedCount} ошибок` : 'без ошибок'],
  ];
  return (
    <section className="fh-sales-metrics" aria-label="Показатели продаж">
      {metrics.map(([label, value, note]) => (
        <div key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
      ))}
    </section>
  );
}

function SalesTable({ source, rows }) {
  if (!rows.length) {
    return <div className="fh-sales-empty"><b>За период продаж нет</b><span>Измените период или фильтры.</span></div>;
  }
  return (
    <div className="fh-sales-table-wrap">
      <table className="fh-sales-table">
        <thead><tr><th>Дата</th><th>Заказ</th><th>Клиент</th><th>Статус</th><th>Billz</th><th>Сумма</th></tr></thead>
        <tbody>
          {rows.map((row) => {
            const status = statusMeta(source, row.status);
            const billz = BILLZ_STATE[row.billzState] || [row.billzState || '—', 'neutral'];
            return (
              <tr key={row.id}>
                <td><b>{formatDateTime(row.occurredAt)}</b>{row.legacyTimeFallback && <small>дата старой записи</small>}</td>
                <td><span className="fh-mono">#{shortId(row.externalId || row.id)}</span><small>{row.items?.map((item) => item.name).filter(Boolean).join(', ') || `${row.itemCount || 0} шт.`}</small></td>
                <td><b>{row.customer?.name || 'Без имени'}</b><small className="fh-mono">{row.customer?.phoneMasked || '—'}</small></td>
                <td><Badge tone={status.tone}>{status.label}</Badge></td>
                <td><Badge tone={billz[1]}>{billz[0]}</Badge>{row.billzOrderNumber && <small className="fh-mono">#{row.billzOrderNumber}</small>}</td>
                <td><strong>{formatMoney(row.totalAmount)}</strong><small>{formatNumber(row.itemCount)} шт.</small></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function SalesPage({ api = analyticsApi }) {
  const route = useRoute();
  const filters = useMemo(() => parseSalesRoute(route), [route]);
  const [search, setSearch] = useState(filters.search);
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [exporting, setExporting] = useState(false);

  useEffect(() => setSearch(filters.search), [filters.search]);

  useEffect(() => {
    let current = true;
    setSummary(null);
    setHistory(null);
    setError('');
    Promise.all([api.summary(filters), api.history(filters)])
      .then(([summaryResult, historyResult]) => {
        if (!current) return;
        setSummary(summaryResult.data);
        setHistory(historyResult.data);
      })
      .catch((err) => {
        if (!current) return;
        setSummary(null);
        setHistory(null);
        setError(err.message || 'Не удалось загрузить продажи');
      });
    return () => { current = false; };
  }, [api, route, retryKey]);

  const update = (patch) => navigate(salesRoute(filters, patch));
  const exportRows = async () => {
    setExporting(true);
    try {
      saveBlob(await api.exportSales(filters));
    } catch (err) {
      setError(err.message || 'Не удалось скачать Excel');
    } finally {
      setExporting(false);
    }
  };

  if (!summary && !history && error) {
    return <DataState tone="error" title="Продажи недоступны" message={error} actionLabel="Повторить" onAction={() => setRetryKey((value) => value + 1)} />;
  }
  if (!summary || !history) {
    return <div className="fh-page-skeleton" aria-label="Загрузка продаж"><span /><span /><span /></div>;
  }

  const source = sourceMeta(filters.source);
  const summaryUnavailable = summary.state === 'unavailable';
  const historyUnavailable = history.state === 'unavailable';
  return (
    <div className="fh-page fh-sales-page">
      <header className="fh-page-head">
        <div><p className="fh-eyebrow">FAIRHAVEN / ANALYTICS</p><h1>Продажи</h1><p>{source.note}. День считается по Asia/Tashkent.</p></div>
        <div className="fh-head-actions">
          <div className="fh-tabs fh-tabs--compact" role="tablist" aria-label="Период">
            {SALES_PERIODS.map((period) => <button key={period.value} type="button" role="tab" aria-selected={filters.period === period.value} className={filters.period === period.value ? 'is-active' : ''} onClick={() => update({ period: period.value })}>{period.label}</button>)}
          </div>
          <Button variant="primary" disabled={exporting || history.state === 'unavailable'} onClick={exportRows}>{exporting ? 'Готовим…' : 'Скачать Excel'}</Button>
        </div>
      </header>

      <div className="fh-sales-sources" role="tablist" aria-label="Источник продаж">
        {SALES_SOURCES.map((item) => (
          <button key={item.value} type="button" role="tab" aria-label={item.label} aria-selected={filters.source === item.value} className={filters.source === item.value ? 'is-active' : ''} onClick={() => update({ source: item.value })}>
            <b>{item.label}</b><span>{item.note}</span>
          </button>
        ))}
      </div>

      {error && <div className="fh-error-note">{error}</div>}
      {(summaryUnavailable || historyUnavailable) && <div className="fh-error-note">Источник временно недоступен. Числа не заменены оценкой.</div>}
      {summary.freshness === 'stale' && <div className="fh-stale-note">Источник устарел. Показаны последние подтверждённые данные.</div>}
      {summary.metrics?.legacyFallbackCount > 0 && <div className="fh-stale-note">{formatNumber(summary.metrics.legacyFallbackCount)} старых продаж используют приблизительную дату и отмечены в истории.</div>}

      {!summaryUnavailable && <Metrics values={summary.metrics || {}} />}

      <Card className="fh-sales-ledger">
        <div className="fh-sales-ledger__head">
          <div><p className="fh-eyebrow">ИСТОРИЯ</p><h2>{source.label}</h2><span>{historyUnavailable ? '—' : formatNumber(history.total)} записей</span></div>
          <div className="fh-sales-filters">
            <form onSubmit={(event) => { event.preventDefault(); update({ search: search.trim() }); }}>
              <label htmlFor="sales-search">Поиск</label>
              <input id="sales-search" className="fh-input" value={search} maxLength={100} placeholder="Заказ, клиент, товар" onChange={(event) => setSearch(event.target.value)} />
              <Button size="sm" type="submit">Найти</Button>
            </form>
            <label>Статус<select className="fh-select" aria-label="Статус" value={filters.status} onChange={(event) => update({ status: event.target.value })}><option value="">Все статусы</option>{statusOptions(filters.source).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          </div>
        </div>
        {historyUnavailable
          ? <div className="fh-sales-empty"><b>История недоступна</b><span>Подтверждённые данные от источника не получены.</span></div>
          : <SalesTable source={filters.source} rows={history.rows || []} />}
        {!historyUnavailable && <Pagination page={history.page || filters.page} total={history.total || 0} limit={history.limit || 25} onPage={(page) => update({ page })} />}
      </Card>
    </div>
  );
}

export { Metrics, SalesTable, saveBlob };
