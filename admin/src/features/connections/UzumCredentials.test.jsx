import React from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionsPage } from './ConnectionsPage';

const pair = {
  id: 'uzum-test-key', channel: 'uzum', kind: 'oauth',
  label: 'Основное подключение Uzum', fingerprint: 'fhu_o…test',
  clientId: 'uzum-test-client', clientSecret: 'uzum-test-only-secret',
};

function respond(data, status = 200) {
  return new Response(JSON.stringify({ success: status < 400, data }), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

// Only the HTTP boundary is replaced: UI, dialogs, and API serialization stay real.
function stubRequests({ keys = [], issue = () => respond(pair) } = {}) {
  const fetch = vi.fn(async (url, options) => {
    if (options.method === 'POST' && url === '/api/admin/channels/keys') return issue();
    if (options.method === 'POST' && url === '/api/admin/channels/keys/import') return respond({ id: pair.id });
    if (options.method === 'GET' && url === '/api/admin/channels/keys') return respond(keys);
    if (options.method === 'GET' && url === '/api/admin/channels/sync') return respond({ mirrorTotal: 0, last: null });
    if (options.method === 'GET' && url === '/api/admin/channels/settings') return respond({ defaultMxikCode: '', defaultPackageCode: '' });
    if (options.method === 'GET' && url === '/api/admin/channels/medicalka/partner') return respond({ activeEnvironment: '', profiles: [] });
    throw new Error(`Unexpected test request: ${options.method} ${url}`);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

async function openCreate(user) {
  await user.click(screen.getByRole('button', { name: 'Создать доступ Uzum' }));
  return screen.getByRole('dialog');
}

afterEach(() => vi.unstubAllGlobals());

describe('Uzum credential setup', () => {
  it('issues the FairHaven OAuth pair only on confirmation and copies only on user request', async () => {
    const fetch = stubRequests();
    const user = userEvent.setup();
    const clipboard = vi.spyOn(navigator.clipboard, 'writeText');
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    render(<ConnectionsPage />);
    const dialog = await openCreate(user);
    expect(fetch.mock.calls.some(([, options]) => options.method === 'POST')).toBe(false);
    await user.clear(within(dialog).getByLabelText(/Название подключения/));
    await user.type(within(dialog).getByLabelText(/Название подключения/), '  Тест Uzum  ');
    await user.click(within(dialog).getByRole('button', { name: 'Создать Client ID и secret' }));
    expect(await screen.findByText(pair.clientSecret)).toBeInTheDocument();
    const writes = fetch.mock.calls.filter(([, options]) => options.method === 'POST');
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toBe('/api/admin/channels/keys');
    expect(JSON.parse(writes[0][1].body)).toEqual({ channel: 'uzum', kind: 'oauth', label: 'Тест Uzum' });
    expect(clipboard).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Скопировать Client secret' }));
    expect(clipboard).toHaveBeenCalledExactlyOnceWith(pair.clientSecret);
    await user.click(screen.getByRole('button', { name: 'Закрыть окно' }));
    expect(screen.queryByText(pair.clientSecret)).not.toBeInTheDocument();
    await openCreate(user);
    expect(screen.queryByText(pair.clientSecret)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Создать Client ID и secret' })).toBeEnabled();
  });

  it('reports configured OAuth keys without claiming a live connection', async () => {
    stubRequests({ keys: [{ ...pair, clientSecret: undefined, active: true, lastUsedAt: null }] });
    render(<ConnectionsPage />);
    const status = await screen.findByText('Ключи настроены');
    expect(status).toHaveClass('is-idle');
    const card = screen.getByRole('heading', { name: 'Uzum Tezkor', level: 2 }).closest('.fh-connection-card');
    expect(within(card).queryByText('Подключено')).not.toBeInTheDocument();
    expect(within(card).getByText(/обработка реальных заказов согласуется отдельно/)).toBeInTheDocument();
    expect(screen.queryByText(pair.clientSecret)).not.toBeInTheDocument();
  });

  it('imports an agreed existing pair and clears cancelled and saved input', async () => {
    const fetch = stubRequests();
    const user = userEvent.setup();
    render(<ConnectionsPage />);
    const openImport = () => user.click(screen.getByRole('button', { name: 'Импорт согласованной пары' }));
    await openImport();
    expect(screen.getByText(/Необязательный шаг/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Client secret/), pair.clientSecret);
    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    await openImport();
    expect(screen.getByLabelText(/^Client secret/)).toHaveValue('');
    await user.type(screen.getByLabelText(/^Client ID/), pair.clientId);
    await user.type(screen.getByLabelText(/^Client secret/), pair.clientSecret);
    await user.click(screen.getByRole('button', { name: 'Сохранить согласованную пару' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const writes = fetch.mock.calls.filter(([, options]) => options.method === 'POST');
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toBe('/api/admin/channels/keys/import');
    expect(JSON.parse(writes[0][1].body)).toEqual({ channel: 'uzum', clientId: pair.clientId, clientSecret: pair.clientSecret, label: pair.label });
    await openImport();
    expect(screen.getByLabelText(/^Client ID/)).toHaveValue('');
    expect(screen.getByLabelText(/^Client secret/)).toHaveValue('');
  });

  it('does not reveal a late response after unmount or issue twice while waiting', async () => {
    let finish;
    const fetch = stubRequests({ issue: () => new Promise((resolve) => { finish = resolve; }) });
    const user = userEvent.setup();
    const view = render(<ConnectionsPage />);
    await openCreate(user);
    await user.click(screen.getByRole('button', { name: 'Создать Client ID и secret' }));
    expect(screen.getByRole('button', { name: 'Сохраняем…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Закрыть' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    view.unmount();
    await act(async () => finish(respond(pair)));
    render(<ConnectionsPage />);
    await openCreate(user);
    expect(screen.queryByText(pair.clientSecret)).not.toBeInTheDocument();
    expect(fetch.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
  });

  it('does not display raw server error details that may contain credentials', async () => {
    stubRequests({ issue: () => new Response(JSON.stringify({ success: false, message: pair.clientSecret }), { status: 500, headers: { 'Content-Type': 'application/json' } }) });
    const user = userEvent.setup();
    render(<ConnectionsPage />);
    await openCreate(user);
    await user.click(screen.getByRole('button', { name: 'Создать Client ID и secret' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Обновите список ключей');
    expect(screen.queryByText(pair.clientSecret)).not.toBeInTheDocument();
  });

  it.each([
    undefined,
    { clientId: pair.clientId },
    { clientSecret: pair.clientSecret },
    { clientId: pair.clientId, clientSecret: ' ' },
    { clientId: 1234, clientSecret: pair.clientSecret },
  ])('rejects incomplete issuance data without offering a blank credential to copy (%j)', async (data) => {
    stubRequests({ issue: () => respond(data) });
    const user = userEvent.setup();
    render(<ConnectionsPage />);
    await openCreate(user);
    await user.click(screen.getByRole('button', { name: 'Создать Client ID и secret' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось подтвердить');
    expect(screen.queryByRole('button', { name: 'Скопировать Client secret' })).not.toBeInTheDocument();
    expect(screen.queryByText(pair.clientSecret)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Создать Client ID и secret' })).toBeDisabled();
  });

  it('blocks an immediate second issuance after a lost response and refreshes keys on close', async () => {
    const fetch = stubRequests({ issue: () => { throw new TypeError('Failed to fetch'); } });
    const user = userEvent.setup();
    render(<ConnectionsPage />);
    await openCreate(user);
    await user.click(screen.getByRole('button', { name: 'Создать Client ID и secret' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ключ мог быть создан');
    const create = screen.getByRole('button', { name: 'Создать Client ID и secret' });
    expect(create).toBeDisabled();
    await user.click(create);
    expect(fetch.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
    const keyReads = () => fetch.mock.calls.filter(([url, options]) => url === '/api/admin/channels/keys' && options.method === 'GET').length;
    const beforeClose = keyReads();
    await user.click(screen.getByRole('button', { name: 'Закрыть и обновить список' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(keyReads()).toBe(beforeClose + 1);
  });
});
