import React from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ConnectionsPage } from './ConnectionsPage';
import { ToastProvider } from '../../ui/ToastProvider';

const pair = {
  id: 'yandex-test-key', channel: 'yandex', kind: 'oauth', label: 'Yandex fixture',
  fingerprint: 'test…5678', clientId: 'yandex-test-client', clientSecret: 'yandex-test-only-secret',
};
const uzum = { id: 'uzum-test-key', channel: 'uzum', kind: 'oauth', label: 'Uzum fixture', fingerprint: 'test…1234', active: true };
function respond(data, status = 200) {
  return new Response(JSON.stringify({ success: status < 400, data }), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
function stubRequests({ keys = [], issue = () => respond(pair), revoke = () => respond({ ok: true, id: pair.id }) } = {}) {
  const fetch = vi.fn(async (url, options) => {
    if (options.method === 'POST' && url === '/api/admin/channels/keys') return issue();
    if (options.method === 'POST' && url.endsWith('/revoke')) return revoke();
    if (url === '/api/admin/channels/keys') return typeof keys === 'function' ? keys() : respond(keys);
    if (url === '/api/admin/channels/sync') return respond({ mirrorTotal: 0, last: null });
    if (url === '/api/admin/channels/settings') return respond({ defaultMxikCode: '', defaultPackageCode: '', channels: ['medicalka', 'uzum', 'yandex'] });
    if (url === '/api/admin/channels/medicalka/partner') return respond({ activeEnvironment: '', profiles: [] });
    throw new Error(`Unexpected test request: ${options.method} ${url}`);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
async function openCreate(user) {
  await user.click(screen.getByRole('button', { name: 'Создать доступ Yandex' }));
  return screen.getByRole('dialog');
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('issues only Yandex credentials on explicit click, copies on demand and discards secret on close', async () => {
  const fetch = stubRequests();
  const user = userEvent.setup();
  const clipboard = vi.spyOn(navigator.clipboard, 'writeText');
  const storage = vi.spyOn(Storage.prototype, 'setItem');
  render(<ConnectionsPage />);
  const dialog = await openCreate(user);
  expect(fetch.mock.calls.some(([, options]) => options.method === 'POST')).toBe(false);
  await user.clear(within(dialog).getByLabelText(/Название подключения/));
  await user.type(within(dialog).getByLabelText(/Название подключения/), '  Yandex fixture  ');
  await user.click(within(dialog).getByRole('button', { name: 'Создать Client ID и secret' }));
  expect(await screen.findByText(pair.clientSecret)).toBeInTheDocument();
  const writes = fetch.mock.calls.filter(([, options]) => options.method === 'POST');
  expect(writes).toHaveLength(1);
  expect(JSON.parse(writes[0][1].body)).toEqual({ channel: 'yandex', kind: 'oauth', label: 'Yandex fixture' });
  expect(clipboard).not.toHaveBeenCalled();
  expect(storage).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Скопировать Client secret' }));
  expect(clipboard).toHaveBeenCalledExactlyOnceWith(pair.clientSecret);
  await user.click(screen.getByRole('button', { name: 'Закрыть окно' }));
  await user.click(screen.getByRole('button', { name: 'Создать доступ Uzum' }));
  expect(screen.queryByText(pair.clientSecret)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Отмена' }));
  await openCreate(user);
  expect(screen.queryByText(pair.clientSecret)).not.toBeInTheDocument();
});

it('groups keys by channel, labels OAuth per channel and keeps configured Yandex inactive', async () => {
  const fetch = stubRequests({ keys: [{ ...pair, active: true }, uzum] });
  const user = userEvent.setup();
  render(<ConnectionsPage />);
  const label = await screen.findByText('Доступ Yandex');
  const group = label.closest('.fh-keys-group');
  expect(within(group).getByRole('heading', { name: 'Yandex' })).toBeInTheDocument();
  expect(within(group).queryByText('Доступ Uzum')).not.toBeInTheDocument();
  expect(screen.getByText('Доступ Uzum').closest('.fh-keys-group')).not.toBe(group);
  expect(screen.queryByText(pair.clientSecret)).not.toBeInTheDocument();
  const card = screen.getByRole('heading', { name: 'Yandex', level: 2 }).closest('.fh-connection-card');
  expect(within(card).getByText(/Ключи настроены/)).toHaveClass('is-idle');
  expect(within(card).getByText(/Запуск не подтверждён/)).toBeInTheDocument();
  expect(within(card).getByText('https://api.fairhaven.uz/yandex')).toBeInTheDocument();
  await user.click(within(group).getByRole('button', { name: 'Отозвать' }));
  expect(within(screen.getByRole('dialog')).getByText(/Yandex/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Да, отозвать' }));
  expect(fetch.mock.calls.filter(([, options]) => options.method === 'POST').map(([url]) => url)).toEqual(['/api/admin/channels/keys/yandex-test-key/revoke']);
});

it('does not treat an Uzum key or revoked Yandex key as Yandex configuration', async () => {
  stubRequests({ keys: [uzum, { ...pair, active: false }] });
  render(<ConnectionsPage />);
  await screen.findByText('Доступ Yandex');
  const card = screen.getByRole('heading', { name: 'Yandex', level: 2 }).closest('.fh-connection-card');
  expect(within(card).getByText(/Ключи не настроены/)).toHaveClass('is-idle');
});

it('blocks double-click issuance and discards a late response after unmount', async () => {
  let finish;
  const fetch = stubRequests({ issue: () => new Promise((resolve) => { finish = resolve; }) });
  const user = userEvent.setup();
  const view = render(<ConnectionsPage />);
  await openCreate(user);
  await user.dblClick(screen.getByRole('button', { name: 'Создать Client ID и secret' }));
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

it.each([
  undefined,
  { ...pair, clientSecret: '' },
  { ...pair, channel: 'uzum' },
  { ...pair, kind: 'token' },
  { clientId: pair.clientId, clientSecret: pair.clientSecret },
])('rejects malformed or wrong-channel issuance data without revealing a secret (%j)', async (data) => {
  stubRequests({ issue: () => respond(data) });
  const user = userEvent.setup();
  render(<ConnectionsPage />);
  await openCreate(user);
  await user.click(screen.getByRole('button', { name: 'Создать Client ID и secret' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось подтвердить');
  expect(screen.queryByText(pair.clientSecret)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Скопировать Client secret' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Создать Client ID и secret' })).toBeDisabled();
});

it('redacts issuance failures, blocks retry and refreshes list on close', async () => {
  const fetch = stubRequests({ issue: () => new Response(JSON.stringify({ success: false, message: pair.clientSecret }), { status: 500, headers: { 'Content-Type': 'application/json' } }) });
  const user = userEvent.setup();
  render(<ConnectionsPage />);
  await openCreate(user);
  await user.click(screen.getByRole('button', { name: 'Создать Client ID и secret' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Ключ мог быть создан');
  expect(screen.queryByText(pair.clientSecret)).not.toBeInTheDocument();
  const reads = () => fetch.mock.calls.filter(([url, options]) => url.endsWith('/keys') && options.method === 'GET').length;
  const before = reads();
  await user.click(screen.getByRole('button', { name: 'Закрыть и обновить список' }));
  expect(reads()).toBe(before + 1);
});

it.each([
  () => respond({ unexpected: true }),
  () => respond([{ ...pair, channel: '__proto__', active: true }]),
  () => respond([{ ...pair, active: 'false' }]),
  () => new Response(JSON.stringify({ message: pair.clientSecret }), { status: 500, headers: { 'Content-Type': 'application/json' } }),
])('handles malformed or failed key lists without raw errors or false readiness', async (keys) => {
  stubRequests({ keys });
  render(<ConnectionsPage />);
  expect(await screen.findByText(/Список ключей сейчас недоступен/)).toBeInTheDocument();
  expect(screen.queryByText(pair.clientSecret)).not.toBeInTheDocument();
  const card = screen.getByRole('heading', { name: 'Yandex', level: 2 }).closest('.fh-connection-card');
  expect(within(card).getByText(/Ключи не настроены/)).toHaveClass('is-idle');
});

it('keeps revocation tied to selected Yandex key while pending and rejects malformed acknowledgement', async () => {
  let finish;
  const fetch = stubRequests({ keys: [{ ...pair, active: true }, uzum], revoke: () => new Promise((resolve) => { finish = resolve; }) });
  const user = userEvent.setup();
  render(<ToastProvider><ConnectionsPage /></ToastProvider>);
  const group = (await screen.findByText('Доступ Yandex')).closest('.fh-keys-group');
  await user.click(within(group).getByRole('button', { name: 'Отозвать' }));
  await user.dblClick(screen.getByRole('button', { name: 'Да, отозвать' }));
  expect(screen.getByRole('button', { name: 'Отмена' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Закрыть' })).toBeDisabled();
  await act(async () => finish(respond({ ok: true, id: uzum.id })));
  expect(await screen.findByText(/Не удалось отозвать ключ/)).toBeInTheDocument();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(fetch.mock.calls.filter(([, options]) => options.method === 'POST').map(([url]) => url)).toEqual(['/api/admin/channels/keys/yandex-test-key/revoke']);
});
