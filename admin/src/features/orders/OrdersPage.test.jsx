import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrdersPage } from './OrdersPage';
import { ToastProvider } from '../../ui/ToastProvider';

const order = {
  _id: '507f1f77bcf86cd799439011',
  status: 'pending',
  customerName: 'Dilnoza Karimova',
  customerPhone: '+998901112233',
  createdAt: '2026-08-02T06:00:00.000Z',
  totalAmount: 440000,
  deliveryFee: 20000,
  paymentMethod: 'cash',
  items: [{ name: 'OvaBoost', quantity: 1, price: 420000 }],
  location: { addressString: 'Ташкент, Чиланзар 1' },
  statusHistory: [],
  internalNotes: [],
};

function makeApi(over = {}) {
  return {
    list: vi.fn().mockResolvedValue({ data: [order], meta: { total: 1, page: 1, limit: 30 } }),
    detail: vi.fn().mockResolvedValue({
      data: { order, actions: ['confirmed', 'cancelled'], canRevert: false, customer: { ordersCount: 3, customerBlocked: false } },
    }),
    transition: vi.fn().mockResolvedValue({ data: { order: { ...order, status: 'confirmed' }, actions: ['preparing', 'cancelled'] } }),
    addNote: vi.fn(),
    claim: vi.fn(),
    revert: vi.fn(),
    ...over,
  };
}

const renderPage = (api, medicalkaApi) => render(
  <ToastProvider><OrdersPage api={api} medicalkaApi={medicalkaApi} /></ToastProvider>
);

describe('OrdersPage', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/orders');
  });

  it('advances an order through the legal transition endpoint with an undo offer', async () => {
    const api = makeApi();
    renderPage(api);

    expect(await screen.findByText('Dilnoza Karimova')).toBeInTheDocument();
    expect(screen.getByText('#439011')).toBeInTheDocument();
    expect(screen.getByText('440 000 сум')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Принять заказ' }));

    expect(api.transition).toHaveBeenCalledWith(order._id, { to: 'confirmed', reason: '' });
    expect(await screen.findByText('Принят')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Вернуть в очередь' })).toBeInTheDocument();
  });

  it('demands a reason before rejecting an order', async () => {
    const api = makeApi();
    renderPage(api);
    await screen.findByText('Dilnoza Karimova');

    await userEvent.click(screen.getByRole('button', { name: 'Отклонить' }));
    const confirmButton = screen.getByRole('button', { name: 'Подтвердить' });
    expect(confirmButton).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText('Например: клиент не выходит на связь'), 'клиент не отвечает');
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));

    expect(api.transition).toHaveBeenCalledWith(order._id, { to: 'cancelled', reason: 'клиент не отвечает' });
  });

  it('opens the workbench from the list with server detail: timeline, notes, claim and print', async () => {
    const api = makeApi({
      detail: vi.fn().mockResolvedValue({
        data: {
          order: {
            ...order,
            statusHistory: [{ status: 'confirmed', at: '2026-08-02T07:00:00.000Z', by: { name: 'Ольга' }, reason: '' }],
            internalNotes: [{ text: 'Позвонить после 18:00', at: '2026-08-02T07:05:00.000Z', by: { name: 'Ольга' } }],
          },
          actions: ['preparing', 'cancelled'],
          canRevert: true,
          customer: { ordersCount: 3, customerBlocked: false },
        },
      }),
    });
    renderPage(api);
    await screen.findByText('Dilnoza Karimova');

    await userEvent.click(screen.getByRole('button', { name: 'Открыть заказ #439011' }));

    expect(await screen.findByRole('dialog', { name: 'Заказ #439011' })).toBeInTheDocument();
    expect(api.detail).toHaveBeenCalledWith(order._id);
    expect(screen.getByText('Ташкент, Чиланзар 1')).toBeInTheDocument();
    expect(await screen.findByText('Позвонить после 18:00')).toBeInTheDocument();
    expect(screen.getByText('История статусов')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Беру заказ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Печать чека' })).toBeInTheDocument();
    // Action buttons come from the server's answer, not the local table.
    expect(screen.getByRole('button', { name: 'Заказ собран' })).toBeInTheDocument();
  });

  it('opens Medicalka inside existing Orders workspace', async () => {
    const api = makeApi();
    const medicalkaApi = {
      list: vi.fn().mockResolvedValue({ data: [], meta: { total: 0 }, sync: { stale: false } }),
      respond: vi.fn(),
    };
    renderPage(api, medicalkaApi);
    await screen.findByText('Dilnoza Karimova');

    await userEvent.click(screen.getByRole('button', { name: 'Medicalka' }));

    expect(await screen.findByText('Medicalka zayavkalari')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'FairHaven' })).toBeInTheDocument();
    expect(medicalkaApi.list).toHaveBeenCalled();
  });
});
