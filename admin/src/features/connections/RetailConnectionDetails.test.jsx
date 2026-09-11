import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ConnectionsPage } from './ConnectionsPage';
const id = '111111111111111111111111';
const secret = 'synthetic-retail-secret';
const metadata = { place: 'store-1', channels: [
  { channel: 'uzum', host: 'https://api.fairhaven.uz/uzum', enabled: false, runtimePlace: '', placeConfigured: false,
    keys: [{ id, clientId: 'uzum-client', label: '', secretAvailable: true }] },
  { channel: 'yandex', host: 'https://api.fairhaven.uz/yandex', enabled: false, runtimePlace: '', placeConfigured: false, keys: [] },
] };
function setup(reveal) {
  const requests = [];
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    requests.push([url, options]);
    let data = {};
    if (url.endsWith('/connections') && options.method === 'GET') data = metadata;
    else if (url.endsWith('/reveal')) return reveal ? reveal() : response({ id, channel: 'uzum', clientId: 'uzum-client', clientSecret: secret });
    else if (url.endsWith('/connections/place')) data = { place: JSON.parse(options.body).place };
    else if (url.endsWith('/secret')) data = { saved: true };
    else if (url.endsWith('/keys')) data = [];
    return response(data);
  }));
  return requests;
}
const response = data => new Response(JSON.stringify({ success: true, data }), { headers: { 'Content-Type': 'application/json' } });
afterEach(() => vi.unstubAllGlobals());
it('shows both handoff cards, copies all four fields only after explicit reveal, clears on close', async () => {
  const requests = setup(); const user = userEvent.setup(); const clipboard = vi.spyOn(navigator.clipboard, 'writeText');
  const storage = vi.spyOn(Storage.prototype, 'setItem');
  render(<ConnectionsPage />);
  await user.click(screen.getByRole('button', { name: 'Данные подключения' }));
  expect(await screen.findByDisplayValue('store-1')).toBeInTheDocument();
  expect(screen.getByText('uzum-client')).toBeInTheDocument();
  expect(screen.queryByText(secret)).not.toBeInTheDocument();
  expect(requests.some(([url]) => url.endsWith('/reveal'))).toBe(false);
  expect(screen.getByRole('button', { name: 'Скопировать данные Uzum' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Показать Client secret' }));
  expect(await screen.findByText(secret)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Скопировать данные Uzum' }));
  expect(clipboard).toHaveBeenCalledWith('Host: https://api.fairhaven.uz/uzum\nClient ID: uzum-client\nClient secret: synthetic-retail-secret\nPlace: store-1');
  expect(storage).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Закрыть данные' }));
  expect(screen.queryByText(secret)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Данные подключения' }));
  expect(await screen.findByText('uzum-client')).toBeInTheDocument();
  expect(screen.queryByText(secret)).not.toBeInTheDocument();
});
it('ignores delayed reveal after dialog is closed', async () => {
  let finish; setup(() => new Promise(r => { finish = r; })); const user = userEvent.setup();
  render(<ConnectionsPage />); await user.click(screen.getByRole('button', { name: 'Данные подключения' }));
  await screen.findByText('uzum-client'); await user.click(screen.getByRole('button', { name: 'Показать Client secret' }));
  await user.click(screen.getByRole('button', { name: 'Закрыть данные' }));
  await act(async () => finish(response({ id, channel: 'uzum', clientId: 'uzum-client', clientSecret: secret })));
  expect(screen.queryByText(secret)).not.toBeInTheDocument();
});
it('rejects foreign identity and hides arbitrary server diagnostics', async () => {
  setup(() => response({ id, channel: 'yandex', clientId: 'uzum-client', clientSecret: secret }));
  const user = userEvent.setup(); render(<ConnectionsPage />);
  await user.click(screen.getByRole('button', { name: 'Данные подключения' })); await screen.findByText('uzum-client');
  await user.click(screen.getByRole('button', { name: 'Показать Client secret' }));
  expect(await screen.findByRole('alert')).toBeInTheDocument(); expect(screen.queryByText(secret)).not.toBeInTheDocument();
});
it('hides secrets and cancels delayed reveal when document becomes hidden', async () => {
  let finish; setup(() => new Promise(r => { finish = r; })); const user = userEvent.setup();
  render(<ConnectionsPage />); await user.click(screen.getByRole('button', { name: 'Данные подключения' }));
  await screen.findByText('uzum-client'); await user.click(screen.getByRole('button', { name: 'Показать Client secret' }));
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  await act(async () => finish(response({ id, channel: 'uzum', clientId: 'uzum-client', clientSecret: secret })));
  expect(screen.queryByText(secret)).not.toBeInTheDocument();
  vi.restoreAllMocks();
});
it('copies only saved Place, never an unsaved edit', async () => {
  setup(); const user = userEvent.setup(); const clipboard = vi.spyOn(navigator.clipboard, 'writeText');
  render(<ConnectionsPage />); await user.click(screen.getByRole('button', { name: 'Данные подключения' }));
  const input = await screen.findByDisplayValue('store-1'); await user.clear(input); await user.type(input, 'store-2');
  await user.click(screen.getByRole('button', { name: 'Показать Client secret' })); await screen.findByText(secret);
  await user.click(screen.getByRole('button', { name: 'Скопировать данные Uzum' }));
  expect(clipboard.mock.calls.at(-1)[0]).toContain('Place: store-1');
  await user.click(screen.getByRole('button', { name: 'Сохранить Place' }));
  await user.click(screen.getByRole('button', { name: 'Скопировать данные Uzum' }));
  expect(clipboard.mock.calls.at(-1)[0]).toContain('Place: store-2');
});
it('clears missing-copy warning after restoring the same secret', async () => {
  metadata.channels[0].keys[0].secretAvailable = false;
  try {
    setup(); const user = userEvent.setup(); render(<ConnectionsPage />);
    await user.click(screen.getByRole('button', { name: 'Данные подключения' })); await screen.findByText('uzum-client');
    expect(screen.getByText(/Сохранённой копии нет/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Восстановить копию' }));
    await user.type(screen.getByLabelText(/Ранее выданный Client secret/), secret);
    await user.click(screen.getByRole('button', { name: 'Сохранить защищённую копию' }));
    await screen.findByText(/Копия сохранена/);
    expect(screen.queryByText(/Сохранённой копии нет/)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(secret)).not.toBeInTheDocument();
  } finally { metadata.channels[0].keys[0].secretAvailable = true; }
});
