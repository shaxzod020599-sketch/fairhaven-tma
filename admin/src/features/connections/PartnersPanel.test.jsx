import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PartnersPanel } from './PartnersPanel';

const partner = {
  code: 'apteka24', name: 'Apteka 24', mode: 'test', decisionMinutes: 5, note: '', webhookUrl: '',
  billz: { hasSecret: false, paymentTypeId: '', paymentTypeName: '' },
  keys: [{ kind: 'token', fingerprint: 'fhp_t…abcd' }, { kind: 'secret', fingerprint: 'fhp_s…efgh' }],
  stats: { liveOrders: 0, waiting: 0, lastOrderAt: null, webhookFailed: 0 },
};

function fakeApi(overrides = {}) {
  return {
    list: vi.fn(async () => ({ data: { partners: [partner] } })),
    create: vi.fn(async (body) => ({
      data: { partner: { ...partner, ...body }, keys: { token: 'fhp_t_read', secret: 'fhp_s_write' }, webhookSecret: 'whsec_x' },
    })),
    update: vi.fn(async () => ({ data: { partner } })),
    issueKeys: vi.fn(),
    webhookSecret: vi.fn(),
    rotateWebhookSecret: vi.fn(),
    testWebhook: vi.fn(),
    orders: vi.fn(async () => ({
      data: {
        orders: [{
          _id: 'a'.repeat(24), id: 1001, order_id: 'P-1', status: 'new', test: false, total: 250000,
          items: [{ name: 'Vitamin C', quantity: 2 }], created_at: '2026-11-12T10:00:00Z',
        }],
      },
    })),
    decide: vi.fn(async () => ({ data: { order: {} } })),
    cancel: vi.fn(),
    ...overrides,
  };
}

describe('Partner API partners panel', () => {
  it('creates a partner and shows its keys once', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    render(<PartnersPanel api={api} />);
    expect(await screen.findByText('Apteka 24')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Добавить партнёра' }));
    const dialog = screen.getByRole('dialog');
    const create = within(dialog).getByRole('button', { name: 'Добавить и выпустить ключи' });
    expect(create.disabled).toBe(true);
    const [name, code] = within(dialog).getAllByRole('textbox');
    await user.type(name, 'Dori Express');
    await user.type(code, 'Dori-Express');
    await user.click(create);

    expect(api.create).toHaveBeenCalledWith({ name: 'Dori Express', code: 'dori-express', decisionMinutes: 5 });
    expect(await within(dialog).findByText('fhp_s_write')).toBeTruthy();
    expect(within(dialog).getByText('whsec_x')).toBeTruthy();
  });

  it('asks before going live and before accepting a real order', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    render(<PartnersPanel api={api} />);
    await user.click(await screen.findByRole('button', { name: 'Открыть' }));
    const dialog = screen.getByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Работает' }));
    expect(api.update).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Да, подтверждаю' }));
    expect(api.update).toHaveBeenCalledWith('apteka24', { mode: 'live' });

    await user.click(await within(dialog).findByRole('button', { name: 'Принять' }));
    expect(api.decide).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Да, подтверждаю' }));
    expect(api.decide).toHaveBeenCalledWith('a'.repeat(24), 'accept');
  });
});
