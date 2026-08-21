import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../ui/ToastProvider';
import { MedicalkaSubOrders } from './MedicalkaSubOrders';

const pickup = {
  id: '507f1f77bcf86cd799439011', externalId: 'sub-a',
  orderNumber: 'ORD-1', subOrderNumber: 'ORD-1-1', paymentStatus: 'paid',
  status: 'processing', deliveryType: 'pickup', subtotal: 30000,
  sourceCreatedAt: '2026-08-22T03:10:00.000Z',
  customer: { firstName: 'Ali', lastName: 'Valiyev', phone: '+998901234567' },
  items: [{ itemId: 'line-a', name: 'OvaBoost', quantity: 2, lineTotal: 30000, markingRequired: false, labels: [] }],
  mapping: { state: 'ready', missingProductIds: [] },
  sale: { state: 'sold', reconciliationRequired: false },
};

function makeApi(row = pickup) {
  return {
    listSubOrders: vi.fn().mockResolvedValue({
      data: [row], meta: { page: 1, limit: 30, total: 1 }, sync: { enabled: true, stale: false },
    }),
    transitionSubOrder: vi.fn().mockResolvedValue({ data: { ...row, status: 'delivered' } }),
    cancelSubOrder: vi.fn().mockResolvedValue({ data: { ...row, status: 'cancelled' } }),
    addSubOrderLabel: vi.fn().mockResolvedValue({ data: row }),
  };
}

const renderPage = (api) => render(
  <ToastProvider><MedicalkaSubOrders api={api} /></ToastProvider>
);

describe('MedicalkaSubOrders', () => {
  it('shows paid sale and completes pickup only after confirmation', async () => {
    const api = makeApi();
    renderPage(api);

    expect(await screen.findByText('ORD-1-1')).toBeInTheDocument();
    expect(screen.getByText('Billz: sotildi')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mijozga berildi' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ha, yuborish' }));

    expect(api.transitionSubOrder).toHaveBeenCalledWith(pickup.id, 'delivered');
  });

  it('lets a delivered pickup move to completed and hides cancellation', async () => {
    const delivered = { ...pickup, status: 'delivered' };
    const api = makeApi(delivered);
    api.transitionSubOrder.mockResolvedValue({ data: { ...delivered, status: 'completed' } });
    renderPage(api);

    expect(await screen.findByRole('button', { name: 'Yakunlash' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bekor qilish' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Yakunlash' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ha, yuborish' }));

    expect(api.transitionSubOrder).toHaveBeenCalledWith(pickup.id, 'completed');
  });

  it('delivery marking sends raw DataMatrix to selected line', async () => {
    const delivery = {
      ...pickup, deliveryType: 'delivery',
      items: [{ ...pickup.items[0], quantity: 1, markingRequired: true, labels: [] }],
    };
    const api = makeApi(delivery);
    renderPage(api);
    await screen.findByText('ORD-1-1');

    await userEvent.click(screen.getByRole('button', { name: 'Marka qo‘shish' }));
    const label = '0104780012960092217Jh';
    await userEvent.type(screen.getByLabelText('DataMatrix'), label);
    await userEvent.click(screen.getByRole('button', { name: 'Markani yuborish' }));

    expect(api.addSubOrderLabel).toHaveBeenCalledWith(pickup.id, {
      itemId: 'line-a', label,
    });
  });

  it('reconciliation warning stays visible and blocks lifecycle actions', async () => {
    const api = makeApi({
      ...pickup,
      mapping: { state: 'reconciliation_required', missingProductIds: ['501'] },
      sale: { state: 'blocked', reconciliationRequired: true },
    });
    renderPage(api);

    expect(await screen.findByText(/Product mapping tekshirilishi kerak/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mijozga berildi' })).toBeDisabled();
  });
});
