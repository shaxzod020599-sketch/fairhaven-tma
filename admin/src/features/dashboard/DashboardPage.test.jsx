import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './DashboardPage';

describe('DashboardPage', () => {
  it('opens with an operational brief, period metrics, chart and risk panels', async () => {
    const load = vi.fn().mockResolvedValue({
      data: {
        period: '7d',
        metrics: { revenue: 1250000, orders: 24, averageCheck: 89000, cancelled: 1, pending: 4 },
        series: [
          { key: '2026-07-27', value: 0 },
          { key: '2026-07-28', value: 500000 },
          { key: '2026-07-29', value: 750000 },
        ],
        topProducts: [{ name: 'OvaBoost', quantity: 7, amount: 3150000 }],
        lowStock: [{ productId: 'p1', name: 'FertilAid for Men', available: 2 }],
        conflicts: { count: 1, orders: [] },
        sources: [
          { source: 'fairhaven.uz', state: 'fresh', metrics: { grossRevenue: 900000, completedCount: 7 } },
          { source: 'medicalka', state: 'unavailable', metrics: null },
          { source: 'uzum', state: 'fresh', metrics: { grossRevenue: 300000, completedCount: 2 } },
        ],
        billz: {
          state: 'fresh', inventory: { sellableUnits: 42, freshness: 'fresh' },
          sales: { state: 'report_access_required' },
        },
        attention: [],
        recentActivity: [{ _id: 'a1', action: 'order.transition', admin: { name: 'Ольга' }, createdAt: '2026-08-02T08:00:00Z', entityType: 'order', entityId: '507f1f77bcf86cd799439011' }],
        generatedAt: '2026-08-02T08:00:00Z',
      },
    });
    render(<DashboardPage load={load} />);

    expect(await screen.findByRole('heading', { name: 'Сегодня требует внимания' })).toBeInTheDocument();
    expect(load).toHaveBeenCalledWith('7d');
    expect(screen.getByText('4 новых заказа ждут решения')).toBeInTheDocument();
    expect(screen.getByText('1 250 000 сум')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Выручка по дням/ })).toBeInTheDocument();
    expect(screen.getByText('OvaBoost')).toBeInTheDocument();
    expect(screen.getByText('FertilAid for Men')).toBeInTheDocument();
    expect(screen.getByText(/1 конфликт Billz/)).toBeInTheDocument();
    expect(screen.getByText('Смена статуса заказа')).toBeInTheDocument();
    expect(screen.getByText(/обновлено/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '30 дней' })).toBeInTheDocument();
    const comparison = screen.getByRole('region', { name: 'Продажи по источникам' });
    for (const label of ['fairhaven.uz', 'Medicalka', 'Uzum']) {
      expect(comparison).toHaveTextContent(label);
    }
    expect(screen.getByRole('heading', { name: 'Billz: весь бизнес' })).toBeInTheDocument();
    expect(screen.getByText(/не складывается с каналами/i)).toBeInTheDocument();
    expect(screen.getByText('Доступно 42 шт.')).toBeInTheDocument();
  });
});
