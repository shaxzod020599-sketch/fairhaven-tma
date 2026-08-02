import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActivityPage } from './ActivityPage';
import { ToastProvider } from '../../ui/ToastProvider';

function makeApi(over = {}) {
  return {
    list: vi.fn().mockResolvedValue({
      data: [{
        _id: 'a1',
        action: 'product.price',
        admin: { name: 'Ольга Оператор' },
        createdAt: '2026-08-02T08:00:00Z',
        entityType: 'product',
        entityId: 'p1',
        summary: { name: 'OvaBoost', price: { old: 400000, new: 450000 } },
      }],
      meta: { total: 1, page: 1, limit: 30 },
    }),
    broadcasts: vi.fn().mockResolvedValue({ data: [] }),
    previewSegment: vi.fn().mockResolvedValue({ data: { segment: 'all', count: 128 } }),
    createBroadcast: vi.fn().mockResolvedValue({ data: { _id: 'b1', status: 'draft', counts: { targets: 128 } } }),
    testBroadcast: vi.fn().mockResolvedValue({ data: { _id: 'b1', status: 'tested', counts: { targets: 128 } } }),
    sendBroadcast: vi.fn().mockResolvedValue({ data: { _id: 'b1', status: 'sending' } }),
    ...over,
  };
}

const renderPage = (api) => render(<ToastProvider><ActivityPage api={api} /></ToastProvider>);

describe('ActivityPage', () => {
  it('shows a readable audit trail with a human summary', async () => {
    renderPage(makeApi());
    expect(await screen.findByText('Изменение цены')).toBeInTheDocument();
    expect(screen.getByText('OvaBoost: 400 000 → 450 000 сум')).toBeInTheDocument();
    expect(screen.getByText('Ольга Оператор')).toBeInTheDocument();
  });

  it('refuses to send a broadcast before the admin tested it on themselves', async () => {
    const api = makeApi();
    renderPage(api);
    await screen.findByText('Изменение цены');

    await userEvent.click(screen.getByRole('button', { name: 'Новая рассылка' }));
    expect(await screen.findByText('Получателей: 128')).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/новое поступление/), 'Новые витамины уже в наличии');
    await userEvent.click(screen.getByRole('button', { name: 'Продолжить' }));

    const launch = await screen.findByRole('button', { name: 'Запустить' });
    expect(launch).toBeDisabled();
    expect(api.sendBroadcast).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Тест мне' }));
    expect(api.testBroadcast).toHaveBeenCalledWith('b1');

    await userEvent.click(await screen.findByRole('button', { name: 'Запустить' }));
    // Confirmation dialog stands between the button and the send.
    expect(api.sendBroadcast).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Да, отправить всем' }));
    expect(api.sendBroadcast).toHaveBeenCalledWith('b1');
  });
});
