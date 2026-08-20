import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SalesPage } from './SalesPage';

const metrics = {
  grossRevenue: 500_000, returnedAmount: 50_000, netRevenue: 450_000,
  completedCount: 2, averageCheck: 250_000, unitsSold: 3,
  cancelledCount: 1, failedCount: 0, legacyFallbackCount: 0,
};

const history = {
  source: 'fairhaven.uz', state: 'fresh', total: 26, page: 1, limit: 25,
  rows: [{
    id: 'order-1', source: 'fairhaven.uz', externalId: 'ext-1', internalOrderId: 'int-1',
    billzOrderNumber: 'B-10', status: 'delivered', occurredAt: '2026-08-02T10:00:00Z',
    itemCount: 2, totalAmount: 300_000, customer: { name: 'Dilnoza', phoneMasked: '+998 ** *** ** 67' },
    billzState: 'posted', items: [{ name: 'OvaBoost', quantity: 2, unitPrice: 150_000, amount: 300_000 }],
  }],
};

function api(overrides = {}) {
  return {
    summary: vi.fn().mockResolvedValue({ data: { source: 'fairhaven.uz', state: 'fresh', freshness: 'fresh', metrics } }),
    history: vi.fn().mockResolvedValue({ data: history }),
    exportSales: vi.fn().mockResolvedValue({ blob: new Blob(['xlsx']), filename: 'sales.xlsx' }),
    ...overrides,
  };
}

beforeEach(() => window.history.replaceState({}, '', '/sales?source=fairhaven.uz&period=7d'));

describe('SalesPage', () => {
  it('shows exact sources, KPI ledger and privacy-safe order history', async () => {
    const client = api();
    render(<SalesPage api={client} />);

    expect(await screen.findByRole('heading', { name: 'Продажи' })).toBeInTheDocument();
    const sources = within(screen.getByRole('tablist', { name: 'Источник продаж' }));
    expect(sources.getAllByRole('tab').map((tab) => tab.getAttribute('aria-label'))).toEqual([
      'fairhaven.uz', 'Medicalka', 'Uzum',
    ]);
    const ledger = within(screen.getByRole('region', { name: 'Показатели продаж' }));
    for (const label of ['Валовая выручка', 'Возвраты', 'Чистая выручка', 'Продажи', 'Средний чек', 'Товаров продано']) {
      expect(ledger.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('+998 ** *** ** 67')).toBeInTheDocument();
    expect(screen.queryByText('+998901234567')).not.toBeInTheDocument();
    for (const column of ['Дата', 'Заказ', 'Клиент', 'Статус', 'Billz', 'Сумма']) {
      expect(screen.getByRole('columnheader', { name: column })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Скачать Excel' })).toBeInTheDocument();
  });

  it('renders Medicalka sale and reconciliation rows through the existing ledger', async () => {
    window.history.replaceState({}, '', '/sales?source=medicalka&period=7d');
    const medicalkaMetrics = {
      ...metrics, grossRevenue: 100_000, completedCount: 1, averageCheck: 100_000,
      unitsSold: 2, failedCount: 1,
    };
    const medicalkaHistory = {
      ...history,
      source: 'medicalka',
      total: 2,
      rows: [
        {
          ...history.rows[0], source: 'medicalka', externalId: 'MED-SOLD-000042',
          billzOrderNumber: 'BILLZ-SOLD-42', status: 'sold', billzState: 'posted',
        },
        {
          ...history.rows[0], id: 'order-2', source: 'medicalka', externalId: 'MED-RECONCILE-000043',
          billzOrderNumber: '', status: 'failed', billzState: 'error', totalAmount: 900_000,
        },
      ],
    };
    const client = api({
      summary: vi.fn().mockResolvedValue({ data: { source: 'medicalka', state: 'fresh', freshness: 'fresh', metrics: medicalkaMetrics } }),
      history: vi.fn().mockResolvedValue({ data: medicalkaHistory }),
    });
    render(<SalesPage api={client} />);

    expect(await screen.findByText('#000042')).toBeInTheDocument();
    expect(screen.getByText('BILLZ-SOLD-42', { exact: false })).toBeInTheDocument();
    const table = within(screen.getByRole('table'));
    expect(table.getByText('Продан')).toBeInTheDocument();
    expect(table.getAllByText('Ошибка')).toHaveLength(2);
    expect(screen.queryByText('+998901234567')).not.toBeInTheDocument();
    expect(screen.queryByText('private')).not.toBeInTheDocument();
  });

  it('keeps URL filters, changes source safely and paginates', async () => {
    const client = api();
    const user = userEvent.setup();
    render(<SalesPage api={client} />);
    await screen.findByText('Dilnoza');

    await user.click(screen.getByRole('tab', { name: 'Uzum' }));
    expect(window.location.search).toContain('source=uzum');
    expect(window.location.search).toContain('period=7d');

    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(window.location.search).toContain('page=2');

    fireEvent.change(screen.getByLabelText('Статус'), { target: { value: 'failed' } });
    expect(window.location.search).toContain('status=failed');
    expect(window.location.search).not.toContain('page=2');
    await waitFor(() => expect(client.summary).toHaveBeenCalled());
  });

  it('renders loading, failure and empty states without fake rows', async () => {
    let resolve;
    const pending = new Promise((done) => { resolve = done; });
    const { rerender } = render(<SalesPage api={api({ summary: () => pending, history: () => pending })} />);
    expect(screen.getByLabelText('Загрузка продаж')).toBeInTheDocument();
    resolve({ data: { metrics } });

    const failed = api({ summary: vi.fn().mockRejectedValue(new Error('offline')) });
    rerender(<SalesPage api={failed} />);
    expect(await screen.findByRole('heading', { name: 'Продажи недоступны' })).toBeInTheDocument();

    const empty = api({ history: vi.fn().mockResolvedValue({ data: { ...history, rows: [], total: 0 } }) });
    rerender(<SalesPage api={empty} />);
    expect(await screen.findByText('За период продаж нет')).toBeInTheDocument();
  });

  it('never renders zero KPIs or an empty-period claim for an unavailable source', async () => {
    const unavailable = api({
      summary: vi.fn().mockResolvedValue({
        data: { source: 'medicalka', state: 'unavailable', freshness: 'unavailable', metrics: null },
      }),
      history: vi.fn().mockResolvedValue({
        data: { source: 'medicalka', state: 'unavailable', rows: [], total: 0, page: 1, limit: 25 },
      }),
    });
    render(<SalesPage api={unavailable} />);

    expect(await screen.findByText('Источник временно недоступен. Числа не заменены оценкой.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Показатели продаж' })).not.toBeInTheDocument();
    expect(screen.getByText('История недоступна')).toBeInTheDocument();
    expect(screen.queryByText('За период продаж нет')).not.toBeInTheDocument();
    expect(screen.queryByText('0 записей')).not.toBeInTheDocument();
  });

  it('clears stale source data after a failed filter request', async () => {
    const client = api();
    client.summary
      .mockResolvedValueOnce({ data: { source: 'fairhaven.uz', state: 'fresh', freshness: 'fresh', metrics } })
      .mockRejectedValueOnce(new Error('offline'));
    client.history
      .mockResolvedValueOnce({ data: history })
      .mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    render(<SalesPage api={client} />);
    expect(await screen.findByText('Dilnoza')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Uzum' }));

    expect(await screen.findByRole('heading', { name: 'Продажи недоступны' })).toBeInTheDocument();
    expect(screen.queryByText('Dilnoza')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Показатели продаж' })).not.toBeInTheDocument();
  });

  it('retries a failed load without changing route', async () => {
    const client = api();
    client.summary
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ data: { source: 'fairhaven.uz', state: 'fresh', freshness: 'fresh', metrics } });
    client.history
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ data: history });
    const user = userEvent.setup();
    render(<SalesPage api={client} />);
    expect(await screen.findByRole('heading', { name: 'Продажи недоступны' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(await screen.findByRole('heading', { name: 'Продажи' })).toBeInTheDocument();
    expect(client.summary).toHaveBeenCalledTimes(2);
    expect(client.history).toHaveBeenCalledTimes(2);
  });
});
