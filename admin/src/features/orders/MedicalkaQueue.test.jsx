import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../ui/ToastProvider';
import { MedicalkaQueue } from './MedicalkaQueue';

const approval = {
  id: '507f1f77bcf86cd799439011',
  externalId: 'approval-a',
  checkoutId: 'checkout-a',
  status: 'pending',
  requiresAction: true,
  deadlineAt: new Date(Date.now() + 120_000).toISOString(),
  sourceCreatedAt: '2026-08-22T03:00:00.000Z',
  deliveryType: 'pickup',
  customer: { firstName: 'Ali', lastName: 'Valiyev', phone: '+998901234567' },
  items: [{ productId: '501', name: 'OvaBoost', quantity: 2, unitPrice: 15000, lineTotal: 30000 }],
  subtotal: 30000,
  decision: {},
};

function makeApi(over = {}) {
  return {
    list: vi.fn().mockResolvedValue({
      data: [approval], meta: { page: 1, limit: 30, total: 1 },
      sync: { enabled: true, stale: false, lastSuccessAt: new Date().toISOString() },
    }),
    respond: vi.fn().mockImplementation(async (_id, body) => ({
      approval: {
        ...approval, status: body.action, requiresAction: false,
        decision: { actorName: 'Admin', actorType: 'admin-panel' },
      },
      idempotent: false,
    })),
    ...over,
  };
}

function renderQueue(api) {
  return render(<ToastProvider><MedicalkaQueue api={api} /></ToastProvider>);
}

describe('MedicalkaQueue', () => {
  it('shows complete pending approval and informational countdown', async () => {
    const api = makeApi();
    renderQueue(api);

    expect(await screen.findByText('Ali Valiyev')).toBeInTheDocument();
    expect(screen.getByText(/\+998901234567/)).toBeInTheDocument();
    expect(screen.getByText('OvaBoost')).toBeInTheDocument();
    expect(screen.getAllByText('30 000 сум')).toHaveLength(2);
    expect(screen.getByText(/Medicalka oynasi/)).toBeInTheDocument();
  });

  it('accept requires confirmation and calls one decision endpoint', async () => {
    const api = makeApi();
    renderQueue(api);
    await screen.findByText('Ali Valiyev');

    await userEvent.click(screen.getByRole('button', { name: 'Tasdiqlash' }));
    expect(screen.getByRole('dialog', { name: 'Medicalka zayavkani tasdiqlash' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ha, tasdiqlash' }));

    expect(api.respond).toHaveBeenCalledWith(approval.id, { action: 'accepted', comment: '' });
    expect(await screen.findByText('Tasdiqlandi')).toBeInTheDocument();
  });

  it('reject sends optional bounded comment after confirmation', async () => {
    const api = makeApi();
    renderQueue(api);
    await screen.findByText('Ali Valiyev');

    await userEvent.click(screen.getByRole('button', { name: 'Rad etish' }));
    await userEvent.type(screen.getByLabelText('Izoh / Комментарий'), 'Ostatka yo‘q');
    await userEvent.click(screen.getByRole('button', { name: 'Ha, rad etish' }));

    expect(api.respond).toHaveBeenCalledWith(approval.id, {
      action: 'rejected', comment: 'Ostatka yo‘q',
    });
  });

  it('keeps last good rows visible when silent refresh fails', async () => {
    const api = makeApi();
    renderQueue(api);
    await screen.findByText('Ali Valiyev');
    api.list.mockRejectedValueOnce(new Error('offline'));

    await userEvent.click(screen.getByRole('button', { name: 'Yangilash' }));

    await waitFor(() => expect(screen.getByText(/Oldingi ma’lumot ko‘rsatilmoqda/)).toBeInTheDocument());
    expect(screen.getByText('Ali Valiyev')).toBeInTheDocument();
  });
});
