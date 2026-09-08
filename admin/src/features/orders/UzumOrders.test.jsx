import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { UzumOrders } from './UzumOrders';
const row = { id: 'id', externalId: 'uz-order', status: 'NEW', createdAt: new Date().toISOString(), deadlineAt: new Date(Date.now() + 60_000).toISOString(), actions: ['accept', 'reject'], items: [{ billzProductId: 'p', name: 'Vitamin', quantity: 2, unitPrice: 100 }], totalAmount: 200, customer: {} };
describe('Uzum operator orders', () => {
  it('accepts and updates to ready action without inventing courier buttons', async () => {
    const api = { list: vi.fn().mockResolvedValue({ enabled: true, data: [row], meta: { total: 1 } }), decide: vi.fn().mockResolvedValue({ order: { ...row, status: 'ACCEPTED_BY_RESTAURANT', actions: ['ready', 'reject'] } }) };
    render(<UzumOrders api={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Принять' }));
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));
    await waitFor(() => expect(api.decide).toHaveBeenCalledWith('id', { action: 'accept', reason: '' }));
    expect(await screen.findByRole('button', { name: 'Готов' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Курьер|Доставлен|COOKING/i })).toBeNull();
  });
  it('expired and disabled orders have no accept actions', async () => {
    const api = { list: vi.fn().mockResolvedValue({ enabled: false, data: [{ ...row, deadlineAt: new Date(0).toISOString() }], meta: { total: 1 } }) };
    render(<UzumOrders api={api} />);
    expect(await screen.findByText(/Uzum отключён/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Принять' })).toBeNull();
    expect(screen.getByText(/Срок принятия истёк/)).toBeTruthy();
  });
  it('sold accounting reconciliation is visible and cannot be cancelled', async () => {
    const api = { list: vi.fn().mockResolvedValue({ enabled: true, data: [{ ...row, status: 'READY', actions: [], reconciliationRequired: true }], meta: { total: 1 } }) };
    render(<UzumOrders api={api} />);
    expect(await screen.findByText(/Нужна сверка учёта/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Отклонить' })).toBeNull();
  });
});
