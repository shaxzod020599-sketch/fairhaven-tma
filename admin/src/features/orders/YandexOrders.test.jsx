import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { YandexOrders } from './YandexOrders';
import { yandexApi } from '../../api/yandex';
import { setCsrfToken } from '../../api/client';

const ID = '11111111-1111-4111-8111-111111111111';
const SECOND = '22222222-2222-4222-8222-222222222222';
const vitamin = { billzProductId: 'vitamin', name: 'Витамин', quantity: 3, unitPrice: 40000 };
const zinc = { billzProductId: 'zinc', name: 'Цинк', quantity: 1, unitPrice: 20000 };
const replacement = { billzProductId: 'magnesium', name: 'Магний', unitPrice: 50000, availableQuantity: 8 };
const row = {
  id: ID, externalId: 'YA-LOCAL-001', status: 'NEW', accountingStatus: 'received',
  revision: 7, itemsRevision: 3, itemsFrozen: false, enabled: true, accountingEnabled: true,
  inProgress: false, reconciliationRequired: false, cancellationPending: false,
  items: [vitamin, zinc], totalAmount: 140000, customer: { name: 'Тестовый клиент', phone: '' },
  actions: ['accept', 'reject'], audit: [], createdAt: '2026-09-08T09:00:00Z', updatedAt: '2026-09-08T09:00:00Z',
};
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const envelope = (order = row) => ({ enabled: order.enabled, accountingEnabled: order.accountingEnabled, data: [order], meta: { total: 1, page: 1, limit: 30 } });
function makeApi(order = row) {
  return {
    list: vi.fn().mockResolvedValue(envelope(order)), detail: vi.fn().mockResolvedValue({ data: order }),
    products: vi.fn().mockResolvedValue({ items: [replacement] }),
    updateItems: vi.fn().mockResolvedValue({ order: { ...order, revision: 8, itemsRevision: 4 } }),
    decide: vi.fn().mockResolvedValue({ order: { ...order, revision: 8, itemsFrozen: true, accountingStatus: 'reserved', status: 'ACCEPTED_BY_RESTAURANT', actions: ['cooking', 'ready', 'reject'] } }),
  };
}
async function open(api = makeApi(), props = {}) {
  render(<YandexOrders api={api} {...props} />);
  await act(async () => { await Promise.resolve(); });
  fireEvent.click(screen.getByRole('button', { name: `Открыть ${row.externalId}`, exact: true }));
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByRole('heading', { name: `Yandex · ${row.externalId}`, level: 2 })).toBeVisible();
  return api;
}
const quantity = (name = 'Витамин') => screen.getByRole('spinbutton', { name: `Количество: ${name}`, exact: true });
const changeQuantity = (value, name) => fireEvent.change(quantity(name), { target: { value } });
const confirm = () => fireEvent.click(screen.getByRole('button', { name: 'Подтвердить', exact: true }));
const save = () => { fireEvent.click(screen.getByRole('button', { name: 'Сохранить состав', exact: true })); confirm(); };
const flush = async () => act(async () => { await Promise.resolve(); });
async function search(value) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Поиск замены', exact: true }), { target: { value } });
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); setCsrfToken(''); });

describe('Yandex orders transport', () => {
  it('uses authenticated API paths and excludes client prices, names and authority from mutations', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    setCsrfToken('fixture-csrf');
    await yandexApi.list({ bucket: 'active', page: 1, limit: 30 });
    await yandexApi.detail(ID);
    await yandexApi.products({ search: 'Магний', limit: 30 });
    await yandexApi.updateItems(ID, { items: [{ ...vitamin, actor: 'spoof' }], expectedItemsRevision: 3, reason: ' сборка ', actor: {}, role: 'admin' });
    await yandexApi.decide(ID, { action: 'accept', expectedRevision: 7, expectedItemsRevision: 3, reason: '', actor: {}, role: 'admin', price: 1 });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      '/api/admin/yandex/orders?bucket=active&page=1&limit=30', `/api/admin/yandex/orders/${ID}`,
      '/api/admin/yandex/products?search=%D0%9C%D0%B0%D0%B3%D0%BD%D0%B8%D0%B9&limit=30',
      `/api/admin/yandex/orders/${ID}/items`, `/api/admin/yandex/orders/${ID}/decision`,
    ]);
    expect(JSON.parse(fetch.mock.calls[3][1].body)).toEqual({ items: [{ billzProductId: 'vitamin', quantity: 3 }], expectedItemsRevision: 3, reason: 'сборка' });
    expect(JSON.parse(fetch.mock.calls[4][1].body)).toEqual({ action: 'accept', expectedRevision: 7, expectedItemsRevision: 3, reason: '' });
    expect(fetch.mock.calls[3][1]).toMatchObject({ method: 'PUT', credentials: 'same-origin', headers: { 'X-FH-CSRF': 'fixture-csrf' } });
    expect(fetch.mock.calls[4][1].method).toBe('POST');
  });
});

describe('Yandex picking and decisions', () => {
  it('keeps READY in the server active bucket with separate accounting and no courier/payment action', async () => {
    const api = makeApi({ ...row, status: 'READY', accountingStatus: 'sold', itemsFrozen: true, actions: ['reject'] });
    render(<YandexOrders api={api} />);
    expect(await screen.findByText('Выдача: Готов · ожидает курьера')).toBeVisible();
    expect(screen.getByText('Учёт: Продажа завершена')).toBeVisible();
    expect(screen.getByText('140 000 UZS')).toBeVisible();
    expect(api.list).toHaveBeenCalledWith({ bucket: 'active', page: 1, limit: 30 });
    expect(screen.queryByRole('button', { name: /Доставлен|Курьер|Оплачен/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'История', exact: true }));
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ bucket: 'history', page: 1, limit: 30 }));
    fireEvent.click(screen.getByRole('button', { name: 'Все', exact: true }));
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ bucket: 'all', page: 1, limit: 30 }));
  });

  it('saves reduced, removed and catalog replacement lines with the displayed revision, then reloads server prices', async () => {
    const api = await open();
    vi.useFakeTimers();
    changeQuantity('2');
    fireEvent.click(screen.getByRole('button', { name: 'Удалить Цинк', exact: true }));
    await search('маг');
    fireEvent.click(screen.getByRole('button', { name: 'Добавить Магний', exact: true }));
    expect(screen.getByText('Загружено: 3')).toBeVisible();
    expect(screen.getByText('Удалено из сборки')).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: 'Причина изменения состава', exact: true }), { target: { value: ' Замена ' } });
    api.updateItems.mockResolvedValue({ order: { ...row, revision: 8, itemsRevision: 4, totalAmount: 135000, items: [{ ...vitamin, quantity: 2 }, { ...replacement, quantity: 1, unitPrice: 55000 }] } });
    save();
    await flush();
    expect(api.updateItems).toHaveBeenCalledExactlyOnceWith(ID, { items: [{ billzProductId: 'vitamin', quantity: 2 }, { billzProductId: 'magnesium', quantity: 1 }], expectedItemsRevision: 3, reason: 'Замена' });
    expect(screen.getByText('135 000 UZS')).toBeVisible();
    expect(screen.getByText('Версия состава: 4')).toBeVisible();
    expect(screen.queryByRole('spinbutton', { name: 'Количество: Цинк' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Сохранить состав' })).toBeDisabled();
  });

  it('rejects fractional/increased quantities, bounds text, permits empty save but blocks accept', async () => {
    const api = await open();
    changeQuantity('4');
    expect(screen.getByRole('button', { name: 'Сохранить состав' })).toBeDisabled();
    changeQuantity('1.5');
    expect(screen.getByRole('button', { name: 'Сохранить состав' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Поиск замены', exact: true })).toHaveAttribute('maxLength', '120');
    expect(screen.getByRole('textbox', { name: 'Причина изменения состава', exact: true })).toHaveAttribute('maxLength', '300');
    fireEvent.click(screen.getByRole('button', { name: 'Удалить Витамин' }));
    fireEvent.click(screen.getByRole('button', { name: 'Удалить Цинк' }));
    api.updateItems.mockResolvedValue({ order: { ...row, revision: 8, itemsRevision: 4, items: [], totalAmount: 0 } });
    save();
    await waitFor(() => expect(api.updateItems).toHaveBeenCalledWith(ID, { items: [], expectedItemsRevision: 3, reason: '' }));
    expect(await screen.findByText(/Состав пуст.*отклоните заказ или добавьте/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Принять', exact: true })).toBeDisabled();
  });

  it('allows replacing a removed line when the loaded order already has 100 lines', async () => {
    const items = Array.from({ length: 100 }, (_, index) => ({ ...vitamin, billzProductId: `p-${index}`, name: `Товар ${index}`, quantity: 1 }));
    const api = await open(makeApi({ ...row, items })); vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Удалить Товар 0', exact: true }));
    await search('маг');
    expect(screen.getByRole('button', { name: 'Добавить Магний', exact: true })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Добавить Магний', exact: true }));
    save(); await flush();
    const submitted = api.updateItems.mock.calls[0][1].items;
    expect(submitted).toHaveLength(100);
    expect(submitted).not.toContainEqual({ billzProductId: 'p-0', quantity: 1 });
    expect(submitted).toContainEqual({ billzProductId: 'magnesium', quantity: 1 });
  });

  it('confirms accept against both displayed revisions and prevents repeated submission', async () => {
    const api = await open();
    const pending = deferred(); api.decide.mockReturnValue(pending.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Принять', exact: true }));
    expect(screen.getByRole('dialog')).toHaveTextContent('зарезервирует товары');
    expect(screen.getByRole('dialog')).toHaveTextContent('Версия решения: 7 · версия состава: 3');
    confirm();
    fireEvent.click(screen.getByRole('button', { name: 'Обрабатываем…', exact: true }));
    expect(api.decide).toHaveBeenCalledExactlyOnceWith(ID, { action: 'accept', expectedRevision: 7, expectedItemsRevision: 3, reason: '' });
    expect(screen.getByRole('button', { name: 'Закрыть', exact: true })).toBeDisabled();
    await act(async () => pending.resolve({ order: { ...row, revision: 8, itemsFrozen: true, accountingStatus: 'reserved', status: 'ACCEPTED_BY_RESTAURANT', actions: ['cooking', 'ready', 'reject'] } }));
    expect(screen.getByText(/Состав зафиксирован/)).toBeVisible();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Готов', exact: true }));
    expect(screen.getByRole('dialog')).toHaveTextContent('завершит продажу');
  });

  it('requires a bounded rejection reason and describes sold cancellation as reconciliation, not refund', async () => {
    const api = await open(makeApi({ ...row, status: 'READY', accountingStatus: 'sold', itemsFrozen: true, actions: ['reject'] }));
    fireEvent.click(screen.getByRole('button', { name: 'Отклонить', exact: true }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('сверки учёта');
    expect(dialog).toHaveTextContent('не оформляет возврат денег');
    expect(screen.getByRole('button', { name: 'Подтвердить' })).toBeDisabled();
    const reason = screen.getByRole('textbox', { name: 'Причина отклонения', exact: true });
    expect(reason).toHaveAttribute('maxLength', '300');
    fireEvent.change(reason, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Подтвердить' })).toBeDisabled();
    fireEvent.change(reason, { target: { value: ' Курьер отменил ' } });
    confirm();
    await waitFor(() => expect(api.decide).toHaveBeenCalledExactlyOnceWith(ID, { action: 'reject', expectedRevision: 7, reason: 'Курьер отменил' }));
  });

  it.each([
    [{ enabled: false }, /Yandex отключён/],
    [{ inProgress: true }, /Решение обрабатывается/],
    [{ reconciliationRequired: true, status: 'CANCELLED', accountingStatus: 'sold' }, /Нужна сверка учёта/],
    [{ cancellationPending: true }, /Отмена ожидает обработки/],
    [{ status: 'CANCELLED' }, /Заказ отменён/],
  ])('blocks editing and staff actions for guarded DTO %j', async (overrides, warning) => {
    const api = await open(makeApi({ ...row, ...overrides }));
    expect(screen.getByText(warning)).toBeVisible();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Принять', exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Отклонить', exact: true })).toBeNull();
    expect(api.decide).not.toHaveBeenCalled();
  });

  it('shows accounting-disabled reason but preserves server-authorized rejection', async () => {
    await open(makeApi({ ...row, accountingEnabled: false, actions: ['reject'] }));
    expect(screen.getByText(/Учёт отключён.*резервирование и продажа недоступны/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Принять', exact: true })).toBeNull();
    expect(screen.getByRole('button', { name: 'Отклонить', exact: true })).toBeEnabled();
  });

  it('retains manual accounting allowed by server after an early courier callback', async () => {
    const api = await open(makeApi({ ...row, status: 'DELIVERED' }));
    expect(screen.getByText('Выдача: Доставлен')).toBeVisible();
    expect(screen.getByText('Учёт: Получен · без резерва')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Принять', exact: true })); confirm();
    await waitFor(() => expect(api.decide).toHaveBeenCalledWith(ID, { action: 'accept', expectedRevision: 7, expectedItemsRevision: 3, reason: '' }));
  });
});

describe('Yandex response races', () => {
  it('protects dirty edits against 10s polling and a detail request already in flight', async () => {
    vi.useFakeTimers();
    const api = await open();
    const old = deferred(); api.detail.mockReturnValueOnce(old.promise);
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(api.detail).toHaveBeenCalledTimes(2);
    changeQuantity('2');
    await act(async () => old.resolve({ data: { ...row, revision: 8, itemsRevision: 4, items: [{ ...vitamin, quantity: 1 }] } }));
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
    expect(quantity()).toHaveValue(2);
    expect(screen.getByText('Версия состава: 3')).toBeVisible();
    expect(api.detail).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Обновить заказ' })).toBeDisabled();
  });

  it('holds displayed revisions while confirmation is open', async () => {
    vi.useFakeTimers(); const api = await open();
    fireEvent.click(screen.getByRole('button', { name: 'Принять', exact: true }));
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
    expect(api.detail).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toHaveTextContent('Версия решения: 7 · версия состава: 3');
  });

  it('debounces bounded queries and rejects older search results', async () => {
    const api = await open(); vi.useFakeTimers();
    const old = deferred(); api.products.mockReturnValueOnce(old.promise);
    await search('старый');
    await search('маг');
    expect(api.products).toHaveBeenLastCalledWith({ search: 'маг', limit: 30 });
    expect(screen.getByRole('button', { name: 'Добавить Магний' })).toBeVisible();
    await act(async () => old.resolve({ items: [{ ...replacement, billzProductId: 'old', name: 'Старый' }] }));
    expect(screen.queryByRole('button', { name: 'Добавить Старый' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Добавить Магний' })).toBeVisible();
  });

  it('requires explicit discard on back or source change and ignores requests from previous selection', async () => {
    const api = makeApi();
    api.list.mockResolvedValue({ ...envelope(), data: [row, { ...row, id: SECOND, externalId: 'YA-LOCAL-002' }], meta: { total: 2 } });
    const leaveRef = { current: null }; const leave = vi.fn();
    await open(api, { leaveRef }); vi.useFakeTimers();
    const old = deferred(); api.products.mockReturnValueOnce(old.promise);
    await search('старый'); changeQuantity('2');
    act(() => leaveRef.current(leave));
    expect(screen.getByRole('dialog', { name: 'Отменить несохранённые изменения?' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить сборку' }));
    expect(leave).not.toHaveBeenCalled(); expect(quantity()).toHaveValue(2);
    fireEvent.click(screen.getByRole('button', { name: 'К списку Yandex' }));
    fireEvent.click(screen.getByRole('button', { name: 'Отменить изменения' }));
    api.detail.mockResolvedValue({ data: { ...row, id: SECOND, externalId: 'YA-LOCAL-002' } });
    fireEvent.click(screen.getByRole('button', { name: 'Открыть YA-LOCAL-002' })); await flush();
    await act(async () => old.resolve({ items: [{ ...replacement, name: 'Старый' }] }));
    expect(screen.getByRole('heading', { name: 'Yandex · YA-LOCAL-002', level: 2 })).toBeVisible();
    expect(quantity()).toHaveValue(3);
    expect(screen.queryByRole('button', { name: 'Добавить Старый' })).toBeNull();
  });

  it('ignores a delayed detail response after selecting another order', async () => {
    const api = makeApi(); const old = deferred();
    api.list.mockResolvedValue({ ...envelope(), data: [row, { ...row, id: SECOND, externalId: 'YA-LOCAL-002' }] });
    api.detail.mockReturnValueOnce(old.promise).mockResolvedValue({ data: { ...row, id: SECOND, externalId: 'YA-LOCAL-002' } });
    render(<YandexOrders api={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Открыть YA-LOCAL-001' }));
    fireEvent.click(screen.getByRole('button', { name: 'К списку Yandex' }));
    fireEvent.click(screen.getByRole('button', { name: 'Открыть YA-LOCAL-002' }));
    await screen.findByRole('heading', { name: 'Yandex · YA-LOCAL-002', level: 2 });
    await act(async () => old.resolve({ data: row }));
    expect(screen.queryByRole('heading', { name: 'Yandex · YA-LOCAL-001' })).toBeNull();
  });

  it.each(['items', 'decision'])('refreshes authoritative composition on stale %s without retry', async (kind) => {
    const api = await open();
    const conflict = Object.assign(new Error('Conflict'), { status: 409, code: kind === 'items' ? 'yandex_items_revision_conflict' : 'yandex_revision_conflict' });
    api.detail.mockResolvedValue({ data: { ...row, revision: 9, itemsRevision: 5, items: [{ ...vitamin, quantity: 1 }] } });
    if (kind === 'items') { api.updateItems.mockRejectedValue(conflict); changeQuantity('2'); save(); }
    else { api.decide.mockRejectedValue(conflict); fireEvent.click(screen.getByRole('button', { name: 'Принять', exact: true })); confirm(); }
    expect(await screen.findByText(/Конфликт версий.*актуальный состав/)).toBeVisible();
    await waitFor(() => expect(quantity()).toHaveValue(1));
    expect(screen.getByText('Версия состава: 5')).toBeVisible();
    expect(kind === 'items' ? api.updateItems : api.decide).toHaveBeenCalledTimes(1);
    expect(api.list.mock.calls.length).toBeGreaterThan(1);
  });

  it('keeps uncertain Ready locked until detail refresh succeeds, never automatically repeats payment', async () => {
    const reserved = { ...row, revision: 8, itemsFrozen: true, accountingStatus: 'reserved', status: 'COOKING', actions: ['ready', 'reject'] };
    const api = await open(makeApi(reserved));
    api.decide.mockRejectedValue(new TypeError('Failed to fetch'));
    api.detail.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fireEvent.click(screen.getByRole('button', { name: 'Готов', exact: true })); confirm();
    expect(await screen.findByText(/Результат неизвестен/)).toBeVisible();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Готов', exact: true })).toBeDisabled());
    expect(api.decide).toHaveBeenCalledExactlyOnceWith(ID, { action: 'ready', expectedRevision: 8, reason: '' });
    api.detail.mockResolvedValue({ data: { ...reserved, revision: 9, status: 'READY', accountingStatus: 'sold', actions: ['reject'] } });
    fireEvent.click(screen.getByRole('button', { name: 'Обновить заказ' }));
    expect(await screen.findByText('Учёт: Продажа завершена')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Готов', exact: true })).toBeNull();
    expect(api.decide).toHaveBeenCalledTimes(1);
  });

  it('does not roll a successful decision back when an older refresh resolves', async () => {
    vi.useFakeTimers(); const api = await open();
    const old = deferred(); api.detail.mockReturnValueOnce(old.promise);
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    fireEvent.click(screen.getByRole('button', { name: 'Принять', exact: true })); confirm(); await flush();
    await act(async () => old.resolve({ data: row }));
    expect(screen.getByText('Учёт: Зарезервирован')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Принять', exact: true })).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(screen.getByText('Учёт: Зарезервирован')).toBeVisible();
  });

  it('preserves the successful revision when returning to an older list response', async () => {
    const api = await open();
    fireEvent.click(screen.getByRole('button', { name: 'Принять', exact: true })); confirm();
    await screen.findByText('Учёт: Зарезервирован');
    fireEvent.click(screen.getByRole('button', { name: 'К списку Yandex', exact: true }));
    expect(screen.getByRole('button', { name: 'Открыть YA-LOCAL-001', exact: true })).toHaveFocus();
    expect(screen.getByText('Учёт: Зарезервирован')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Обновить Yandex', exact: true }));
    await flush();
    expect(screen.getByText('Учёт: Зарезервирован')).toBeVisible();
    expect(api.decide).toHaveBeenCalledTimes(1);
  });

  it('shows local list/detail/search errors and recovers through explicit refresh', async () => {
    const api = makeApi(); api.list.mockRejectedValueOnce(new Error('Список недоступен'));
    render(<YandexOrders api={api} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Список недоступен');
    fireEvent.click(screen.getByRole('button', { name: 'Обновить Yandex' }));
    api.detail.mockRejectedValueOnce(new Error('Детали недоступны'));
    fireEvent.click(await screen.findByRole('button', { name: 'Открыть YA-LOCAL-001' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Детали недоступны');
    fireEvent.click(screen.getByRole('button', { name: 'Обновить заказ' }));
    await screen.findByRole('heading', { name: 'Yandex · YA-LOCAL-001', level: 2 });
    vi.useFakeTimers(); api.products.mockRejectedValue(new Error('Поиск недоступен'));
    await search('маг');
    expect(screen.getByRole('alert')).toHaveTextContent('Поиск недоступен');
    expect(api.decide).not.toHaveBeenCalled();
  });
});
