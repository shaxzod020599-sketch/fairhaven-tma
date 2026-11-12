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
    list: vi.fn(async () => ({ data: { partners: [partner], catalog: { products: 0 } } })),
    guide: vi.fn(async () => ({ blob: new Blob(['%PDF']), filename: 'FairHaven-Partner-API.pdf' })),
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

    await user.click(within(dialog).getByRole('button', { name: 'Включить настоящие заказы' }));
    expect(api.update).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Да, подтверждаю' }));
    expect(api.update).toHaveBeenCalledWith('apteka24', { mode: 'live' });

    await user.click(within(dialog).getByRole('tab', { name: /Заказы/ }));
    await user.click(await within(dialog).findByRole('button', { name: 'Принять' }));
    expect(api.decide).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Да, подтверждаю' }));
    expect(api.decide).toHaveBeenCalledWith('a'.repeat(24), 'accept');
  });
});

describe('Partner connection steps', () => {
  it('points at the first unfinished step and hands out the guide', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    URL.createObjectURL = vi.fn(() => 'blob:guide');
    URL.revokeObjectURL = vi.fn();
    render(<PartnersPanel api={api} />);

    expect(await screen.findByText(/Партнёры пока не видят ни одного товара/)).toBeTruthy();
    expect(screen.getByText('Следующий шаг: откройте товары для партнёров')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Открыть' }));
    const dialog = screen.getByRole('dialog');
    const steps = within(dialog).getAllByRole('listitem');
    expect(steps).toHaveLength(4);
    expect(steps[0].className).toBe('is-current');
    expect(within(steps[0]).getByText(/пустой каталог/)).toBeTruthy();

    await user.click(within(dialog).getByRole('button', { name: 'Скачать инструкцию (PDF)' }));
    expect(api.guide).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('marks steps done from real usage', async () => {
    const used = {
      ...partner,
      keys: [{ kind: 'token', fingerprint: 'fhp_t…abcd', lastUsedAt: '2026-11-12T09:00:00Z' }],
      stats: { ...partner.stats, testOrders: 3 },
    };
    const api = fakeApi({ list: vi.fn(async () => ({ data: { partners: [used], catalog: { products: 25 } } })) });
    const user = userEvent.setup();
    render(<PartnersPanel api={api} />);

    expect(await screen.findByText('Следующий шаг: включите настоящие заказы')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Открыть' }));
    const steps = within(screen.getByRole('dialog')).getAllByRole('listitem');
    expect(steps.slice(0, 3).map((step) => step.className)).toEqual(['is-done', 'is-done', 'is-done']);
    expect(steps[3].className).toBe('is-current');
    expect(within(steps[0]).getByText(/Партнёры видят товаров: 25/)).toBeTruthy();
  });
});
