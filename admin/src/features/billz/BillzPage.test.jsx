import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BillzPage } from './BillzPage';

const data = {
  source: 'billz', state: 'stale',
  inventory: {
    physicalUnits: 120, reservedUnits: 15, pendingUnits: 5, sellableUnits: 100,
    estimatedRetailValue: 45_000_000, skuCount: 12, zeroStockSkuCount: 2,
    lowStockSkuCount: 4, freshness: 'stale', syncedAt: '2026-08-02T10:00:00Z',
    lowStock: [
      { billzProductId: 'p-1', name: 'OvaBoost', sellableUnits: 0 },
      { billzProductId: 'p-2', name: 'FertilAid', sellableUnits: 2 },
    ],
  },
  capability: {
    state: 'report_access_required', reason: 'billz_report_permission_denied',
    checkedAt: '2026-08-02T12:00:00Z',
  },
  sales: {
    state: 'report_access_required', grossRevenue: null, returnedAmount: null,
    netRevenue: null, checks: null,
  },
  warning: 'Billz savdo hisobotiga o‘qish ruxsati kerak.',
};

describe('BillzPage', () => {
  it('keeps real inventory visible while report revenue stays unavailable', async () => {
    const api = { billzSummary: vi.fn().mockResolvedValue({ data }), exportBillz: vi.fn() };
    render(<BillzPage api={api} />);
    expect(await screen.findByRole('heading', { name: 'Billz' })).toBeInTheDocument();

    const inventory = screen.getByRole('region', { name: 'Остатки Billz' });
    for (const label of ['Физический остаток', 'В резерве', 'Ожидает', 'Доступно', 'SKU', 'Нет в наличии']) {
      expect(within(inventory).getByText(label)).toBeInTheDocument();
    }
    expect(within(inventory).getByText('120 шт.')).toBeInTheDocument();
    expect(within(inventory).getByText('100 шт.')).toBeInTheDocument();
    expect(screen.getByText('Оценочная розничная стоимость')).toBeInTheDocument();
    expect(screen.getByText('45 000 000 сум')).toBeInTheDocument();
    expect(screen.getAllByText('Устарело')).toHaveLength(2);

    const report = screen.getByRole('region', { name: 'Отчёт продаж Billz' });
    expect(within(report).getByRole('heading', { name: 'Требуется доступ Billz к отчётам' })).toBeInTheDocument();
    expect(within(report).queryByText(/0 сум/)).not.toBeInTheDocument();
    expect(within(report).getByRole('button', { name: 'Скачать продажи' })).toBeDisabled();
  });

  it('shows zero and low stock in one operator attention list', async () => {
    const api = { billzSummary: vi.fn().mockResolvedValue({ data }), exportBillz: vi.fn() };
    render(<BillzPage api={api} />);
    expect(await screen.findByText('OvaBoost')).toBeInTheDocument();
    expect(screen.getByText('FertilAid')).toBeInTheDocument();
    expect(screen.getByText('Нет')).toBeInTheDocument();
    expect(screen.getByText('2 шт.')).toBeInTheDocument();
  });
});
