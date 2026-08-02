import React, { useCallback, useEffect, useState } from 'react';
import { analyticsApi } from '../../api/analytics';
import { formatDateTime, formatMoney, formatNumber } from '../../lib/format';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { DataState } from '../../ui/DataState';

const FRESHNESS = {
  fresh: ['Актуально', 'success'],
  stale: ['Устарело', 'warning'],
  unavailable: ['Недоступно', 'danger'],
};

function InventoryMetrics({ inventory }) {
  const values = [
    ['Физический остаток', `${formatNumber(inventory.physicalUnits)} шт.`, 'в зеркале Billz'],
    ['В резерве', `${formatNumber(inventory.reservedUnits)} шт.`, 'подтверждённые резервы'],
    ['Ожидает', `${formatNumber(inventory.pendingUnits)} шт.`, 'решение оператора'],
    ['Доступно', `${formatNumber(inventory.sellableUnits)} шт.`, 'для новых продаж'],
    ['SKU', formatNumber(inventory.skuCount), `${formatNumber(inventory.lowStockSkuCount)} мало`],
    ['Нет в наличии', formatNumber(inventory.zeroStockSkuCount), 'требует внимания'],
  ];
  return (
    <section className="fh-billz-analytics__metrics" aria-label="Остатки Billz">
      {values.map(([label, value, note]) => <div key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}
    </section>
  );
}

function SalesReport({ data }) {
  const state = data.sales?.state;
  if (state !== 'available') {
    const access = state === 'report_access_required';
    return (
      <Card className="fh-billz-report" aria-label="Отчёт продаж Billz">
        <div className="fh-billz-report__mark">B</div>
        <div>
          <p className="fh-eyebrow">ВСЕ ПРОДАЖИ BILLZ</p>
          <h2>{access ? 'Требуется доступ Billz к отчётам' : state === 'normalization_required' ? 'Формат отчёта проверяется' : 'Отчёт Billz недоступен'}</h2>
          <p>{data.warning || 'До подтверждения доступа выручка не показывается и не заменяется суммой каналов.'}</p>
        </div>
        <Button disabled>Скачать продажи</Button>
      </Card>
    );
  }
  return (
    <Card className="fh-billz-report" aria-label="Отчёт продаж Billz">
      <div><p className="fh-eyebrow">ВСЕ ПРОДАЖИ BILLZ</p><h2>{formatMoney(data.sales.netRevenue)}</h2><p>Чистая выручка после возвратов.</p></div>
      <Button>Скачать продажи</Button>
    </Card>
  );
}

export function BillzPage({ api = analyticsApi }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.billzSummary({ preset: '7d' });
      setData(result.data);
      setError('');
    } catch (err) {
      setError(err.message || 'Не удалось загрузить Billz');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  if (!data && error) return <DataState tone="error" title="Billz недоступен" message={error} actionLabel="Повторить" onAction={load} />;
  if (!data || loading && !data) return <div className="fh-page-skeleton" aria-label="Загрузка Billz"><span /><span /><span /></div>;

  const inventory = data.inventory;
  if (!inventory) return <DataState tone="error" title="Остатки Billz недоступны" message="Доверенный снимок ещё не создан." actionLabel="Обновить" onAction={load} />;
  const freshness = FRESHNESS[inventory.freshness] || FRESHNESS.unavailable;

  return (
    <div className="fh-page fh-billz-analytics">
      <header className="fh-page-head">
        <div><p className="fh-eyebrow">FAIRHAVEN / BILLZ</p><h1>Billz</h1><p>Остатки и полная статистика Billz без смешивания с каналами.</p></div>
        <div className="fh-head-actions"><Badge tone={freshness[1]}>{freshness[0]}</Badge><Button disabled={loading} onClick={load}>{loading ? 'Обновляем…' : 'Обновить'}</Button></div>
      </header>

      <div className="fh-billz-analytics__identity">
        <div><span className="fh-billz-analytics__logo">B</span><div><b>Источник остатков</b><small>Последняя успешная синхронизация: {formatDateTime(inventory.syncedAt)}</small></div></div>
        <div><span>Оценочная розничная стоимость</span><strong>{formatMoney(inventory.estimatedRetailValue)}</strong><small>Доступный остаток × розничная цена. Не себестоимость и не прибыль.</small></div>
      </div>

      {inventory.freshness === 'stale' && <div className="fh-stale-note">Остатки устарели. Новые продажи могут ещё не входить в цифры.</div>}
      <InventoryMetrics inventory={inventory} />

      <div className="fh-billz-analytics__grid">
        <Card className="fh-billz-stock-list">
          <div><p className="fh-eyebrow">КОНТРОЛЬ ОСТАТКОВ</p><h2>Мало и нет в наличии</h2></div>
          {(inventory.lowStock || []).length ? <div className="fh-billz-stock-list__rows">{inventory.lowStock.map((item) => <div key={item.billzProductId}><span><b>{item.name}</b><small className="fh-mono">{item.billzProductId}</small></span>{item.sellableUnits === 0 ? <Badge tone="danger">Нет</Badge> : <Badge tone="warning">{formatNumber(item.sellableUnits)} шт.</Badge>}</div>)}</div> : <p className="fh-muted">Критичных остатков нет.</p>}
        </Card>
        <Card className="fh-billz-health">
          <p className="fh-eyebrow">ДОВЕРИЕ К ДАННЫМ</p><h2>{freshness[0]}</h2>
          <dl><div><dt>Синхронизация</dt><dd>{formatDateTime(inventory.syncedAt)}</dd></div><div><dt>Проверка отчёта</dt><dd>{formatDateTime(data.capability?.checkedAt)}</dd></div><div><dt>Доступ к отчётам</dt><dd>{data.capability?.state === 'report_access_required' ? 'Нужен доступ' : data.capability?.state === 'available' ? 'Есть' : 'Недоступен'}</dd></div></dl>
        </Card>
      </div>

      <SalesReport data={data} />
    </div>
  );
}

export { InventoryMetrics, SalesReport };
