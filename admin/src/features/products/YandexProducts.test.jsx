import React from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ProductsPage } from './ProductsPage';
import { emptyProduct } from './productModel';

const product = {
  _id: 'p1', name: 'Local product', category: 'vitamins', price: 40000, images: [],
  mxikCode: '', packageCode: '', billzProductId: '', billz: null,
  channels: {
    medicalka: { enabled: true, price: 51000, forceStatus: 'auto', minStock: 1, live: false },
    uzum: { enabled: true, price: 62000, forceStatus: 'out', minStock: 2, live: false },
  },
};
function respond(data, status = 200) {
  return new Response(JSON.stringify({ success: status < 400, data, meta: { total: 1 } }), { status, headers: { 'Content-Type': 'application/json' } });
}
function stubRequests(update, row = product) {
  const fetch = vi.fn(async (url, options) => {
    if (options.method === 'PATCH') return update(JSON.parse(options.body));
    if (url.startsWith('/api/admin/channels/products?')) return respond([structuredClone(row)]);
    if (url === '/api/admin/channels/summary') return respond({ counts: { total: 1 } });
    if (url === '/api/admin/channels/settings') return respond({ defaultMxikCode: '', defaultPackageCode: '' });
    throw new Error(`Unexpected test request: ${options.method} ${url}`);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
async function yandexRow() {
  await screen.findByRole('heading', { name: product.name });
  return screen.getByRole('checkbox', { name: `Продавать «${product.name}» на Yandex` }).closest('.fh-channel-row');
}
afterEach(() => vi.unstubAllGlobals());

it('new drafts start Yandex disabled with independent settings and empty fiscal codes', () => {
  const draft = emptyProduct();
  expect(draft.channels.yandex).toEqual({ enabled: false, price: 0, forceStatus: 'auto', minStock: 0, measure: null, barcodeType: '' });
  draft.channels.uzum.enabled = true;
  draft.channels.uzum.price = 62000;
  expect(draft.channels.yandex.enabled).toBe(false);
  expect(draft.channels.yandex.price).toBe(0);
  expect(draft.mxikCode).toBe('');
  expect(draft.packageCode).toBe('');
});

it('edits and saves legacy Yandex settings through only its API route without changing other channels', async () => {
  const fetch = stubRequests((patch) => respond({ ...product, channels: { ...product.channels, yandex: { ...patch, live: false } } }));
  const user = userEvent.setup();
  render(<ProductsPage />);
  const row = await yandexRow();
  const controls = within(row);
  expect(controls.getByRole('checkbox')).not.toBeChecked();
  expect(controls.getByRole('spinbutton', { name: /Цена на этой площадке/ })).toBeDisabled();
  await user.click(controls.getByRole('checkbox'));
  expect(controls.getByText('Без цены товар не отправится')).toBeInTheDocument();
  await user.clear(controls.getByRole('spinbutton', { name: /Цена на этой площадке/ }));
  await user.type(controls.getByRole('spinbutton', { name: /Цена на этой площадке/ }), '73000');
  await user.clear(controls.getByRole('spinbutton', { name: /Оставлять себе/ }));
  await user.type(controls.getByRole('spinbutton', { name: /Оставлять себе/ }), '4');
  await user.selectOptions(controls.getByRole('combobox', { name: /Показывать как/ }), 'out');
  await user.click(controls.getByRole('button', { name: 'Сохранить' }));
  expect(controls.queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument();
  const writes = fetch.mock.calls.filter(([, options]) => options.method === 'PATCH');
  expect(writes).toHaveLength(1);
  expect(writes[0][0]).toBe('/api/admin/channels/products/p1/yandex');
  expect(JSON.parse(writes[0][1].body)).toEqual({ enabled: true, price: 73000, minStock: 4, forceStatus: 'out' });
  expect(screen.getByRole('checkbox', { name: /на Medicalka$/ })).toBeChecked();
  const uzum = screen.getByRole('checkbox', { name: /на Uzum Tezkor$/ }).closest('.fh-channel-row');
  expect(within(uzum).getByRole('spinbutton', { name: /Цена на этой площадке/ })).toHaveValue(62000);
});

it('guards pending Yandex saves against double clicks', async () => {
  let finish;
  const fetch = stubRequests((patch) => new Promise((resolve) => { finish = () => resolve(respond({ ...product, channels: { ...product.channels, yandex: { ...patch, live: false } } })); }));
  const user = userEvent.setup();
  render(<ProductsPage />);
  const row = await yandexRow();
  await user.click(within(row).getByRole('checkbox'));
  await user.dblClick(within(row).getByRole('button', { name: 'Сохранить' }));
  expect(within(row).getByRole('button', { name: 'Сохраняем…' })).toBeDisabled();
  expect(within(row).getByRole('checkbox')).toBeDisabled();
  await act(async () => finish());
  expect(fetch.mock.calls.filter(([, options]) => options.method === 'PATCH')).toHaveLength(1);
});

it.each([
  () => respond(undefined),
  () => respond({ ...product, _id: 'wrong-product' }),
  () => respond({ ...product, channels: { ...product.channels, yandex: {} } }),
  () => new Response(JSON.stringify({ message: 'private upstream detail' }), { status: 500, headers: { 'Content-Type': 'application/json' } }),
])('keeps unsaved Yandex edits and shows safe feedback for failed or malformed saves', async (update) => {
  stubRequests(update);
  const user = userEvent.setup();
  render(<ProductsPage />);
  const row = await yandexRow();
  await user.click(within(row).getByRole('checkbox'));
  await user.click(within(row).getByRole('button', { name: 'Сохранить' }));
  expect(await within(row).findByRole('alert')).toHaveTextContent('Не удалось сохранить');
  expect(within(row).getByRole('checkbox')).toBeChecked();
  expect(within(row).getByRole('button', { name: 'Сохранить' })).toBeEnabled();
  expect(screen.queryByText('private upstream detail')).not.toBeInTheDocument();
});

it('shows missing per-SKU fiscal codes and does not equate Yandex stock with launch readiness', async () => {
  stubRequests(undefined, { ...product, channels: { ...product.channels, yandex: { enabled: true, price: 73000, minStock: 0, forceStatus: 'auto', live: true } } });
  render(<ProductsPage />);
  const row = await yandexRow();
  expect(within(row).queryByText('Сейчас в продаже')).not.toBeInTheDocument();
  expect(within(row).getByText(/Для Yandex заполните ИКПУ и код упаковки у товара/)).toBeInTheDocument();
  expect(within(row).getByText(/Укажите реальный вес или объём упаковки и тип штрихкода/)).toBeInTheDocument();
});

const savedYandex = { enabled: false, price: 73000, oldPrice: 79000, minStock: 4, forceStatus: 'out', measure: { unit: 'MLT', value: 250 }, barcodeType: 'code128b' };

it('saves real packaging metadata while Yandex is disabled, using only its exact channel path', async () => {
  const fetch = stubRequests((patch) => respond({ ...product, channels: { ...product.channels, yandex: { ...patch, live: false } } }));
  const user = userEvent.setup();
  render(<ProductsPage />);
  const controls = within(await yandexRow());
  const unit = controls.getByRole('combobox', { name: /Единица измерения/ });
  const value = controls.getByRole('spinbutton', { name: /Вес или объём упаковки/ });
  const barcode = controls.getByRole('combobox', { name: /Тип штрихкода/ });
  expect(unit).toHaveValue('');
  expect(value).toHaveValue(null);
  expect(barcode).toHaveValue('');
  expect(unit).toBeEnabled();
  expect(value).toBeEnabled();
  expect(barcode).toBeEnabled();
  await user.selectOptions(unit, 'MLT');
  await user.type(value, '250');
  await user.selectOptions(barcode, 'ean13');
  await user.click(controls.getByRole('button', { name: 'Сохранить' }));
  expect(controls.queryByRole('alert')).not.toBeInTheDocument();
  expect(controls.queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument();
  expect(value).toHaveValue(250);
  expect(unit).toHaveValue('MLT');
  const writes = fetch.mock.calls.filter(([, options]) => options.method === 'PATCH');
  expect(writes).toHaveLength(1);
  expect(writes[0][0]).toBe('/api/admin/channels/products/p1/yandex');
  expect(JSON.parse(writes[0][1].body)).toEqual({ enabled: false, price: 0, forceStatus: 'auto', minStock: 0, measure: { unit: 'MLT', value: 250 }, barcodeType: 'ean13' });
  expect(screen.getByRole('checkbox', { name: /на Medicalka$/ })).toBeChecked();
  expect(within(screen.getByRole('checkbox', { name: /на Uzum Tezkor$/ }).closest('.fh-channel-row')).getByRole('spinbutton', { name: /Цена на этой площадке/ })).toHaveValue(62000);
});

it('retains less common stored barcode types and measurement during unrelated settings saves', async () => {
  const fetch = stubRequests((patch) => respond({ ...product, channels: { ...product.channels, yandex: { ...savedYandex, ...patch } } }), { ...product, channels: { ...product.channels, yandex: savedYandex } });
  const user = userEvent.setup();
  render(<ProductsPage />);
  const controls = within(await yandexRow());
  expect(controls.getByRole('combobox', { name: /Тип штрихкода/ })).toHaveValue('code128b');
  await user.click(controls.getByRole('checkbox'));
  await user.click(controls.getByRole('button', { name: 'Сохранить' }));
  expect(controls.queryByRole('alert')).not.toBeInTheDocument();
  expect(controls.getByRole('spinbutton', { name: /Вес или объём упаковки/ })).toHaveValue(250);
  expect(JSON.parse(fetch.mock.calls.find(([, options]) => options.method === 'PATCH')[1].body)).toEqual({ enabled: true, price: 73000, minStock: 4, forceStatus: 'out' });
});

it('clears measurement with null and barcode type with empty string, leaving price and stock controls intact', async () => {
  const fetch = stubRequests((patch) => respond({ ...product, channels: { ...product.channels, yandex: { ...savedYandex, ...patch } } }), { ...product, channels: { ...product.channels, yandex: savedYandex } });
  const user = userEvent.setup();
  render(<ProductsPage />);
  const controls = within(await yandexRow());
  await user.click(controls.getByRole('button', { name: 'Очистить вес / объём' }));
  await user.selectOptions(controls.getByRole('combobox', { name: /Тип штрихкода/ }), '');
  await user.click(controls.getByRole('button', { name: 'Сохранить' }));
  expect(controls.queryByRole('alert')).not.toBeInTheDocument();
  expect(controls.getByRole('spinbutton', { name: /Вес или объём упаковки/ })).toHaveValue(null);
  expect(controls.getByRole('combobox', { name: /Единица измерения/ })).toHaveValue('');
  expect(controls.getByText(/Укажите реальный вес или объём упаковки и тип штрихкода/)).toBeInTheDocument();
  expect(JSON.parse(fetch.mock.calls.find(([, options]) => options.method === 'PATCH')[1].body)).toEqual({ enabled: false, price: 73000, forceStatus: 'out', minStock: 4, measure: null, barcodeType: '' });
});

it.each(['', '0', '-1', '1.5'])('rejects incomplete or invalid packaging value %j before saving any channel setting', async (value) => {
  const fetch = stubRequests(() => { throw new Error('Invalid metadata must never reach API'); });
  const user = userEvent.setup();
  render(<ProductsPage />);
  const controls = within(await yandexRow());
  await user.click(controls.getByRole('checkbox'));
  await user.selectOptions(controls.getByRole('combobox', { name: /Единица измерения/ }), 'GRM');
  if (value) await user.type(controls.getByRole('spinbutton', { name: /Вес или объём упаковки/ }), value);
  await user.click(controls.getByRole('button', { name: 'Сохранить' }));
  expect(controls.getByRole('alert')).toHaveTextContent(/положительное целое/);
  expect(fetch.mock.calls.filter(([, options]) => options.method === 'PATCH')).toHaveLength(0);
});

it('keeps metadata on failed save, locks pending controls, and retries without losing edits', async () => {
  let finish;
  let attempt = 0;
  const fetch = stubRequests((patch) => {
    attempt += 1;
    if (attempt === 1) return new Promise((resolve) => { finish = () => resolve(respond(undefined, 500)); });
    return respond({ ...product, channels: { ...product.channels, yandex: patch } });
  });
  const user = userEvent.setup();
  render(<ProductsPage />);
  const controls = within(await yandexRow());
  await user.selectOptions(controls.getByRole('combobox', { name: /Единица измерения/ }), 'GRM');
  await user.type(controls.getByRole('spinbutton', { name: /Вес или объём упаковки/ }), '120');
  await user.selectOptions(controls.getByRole('combobox', { name: /Тип штрихкода/ }), 'datamatrix');
  await user.dblClick(controls.getByRole('button', { name: 'Сохранить' }));
  expect(controls.getByRole('button', { name: 'Сохраняем…' })).toBeDisabled();
  expect(controls.getByRole('combobox', { name: /Единица измерения/ })).toBeDisabled();
  expect(controls.getByRole('spinbutton', { name: /Вес или объём упаковки/ })).toBeDisabled();
  expect(controls.getByRole('combobox', { name: /Тип штрихкода/ })).toBeDisabled();
  expect(controls.getByRole('button', { name: 'Очистить вес / объём' })).toBeDisabled();
  await act(async () => finish());
  expect(controls.getByRole('alert')).toHaveTextContent('Не удалось сохранить');
  expect(controls.getByRole('spinbutton', { name: /Вес или объём упаковки/ })).toHaveValue(120);
  await user.click(controls.getByRole('button', { name: 'Сохранить' }));
  expect(controls.queryByRole('alert')).not.toBeInTheDocument();
  expect(controls.queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument();
  expect(fetch.mock.calls.filter(([, options]) => options.method === 'PATCH')).toHaveLength(2);
});

it('does not acknowledge a save whose response lost the requested measurement', async () => {
  stubRequests((patch) => respond({ ...product, channels: { ...product.channels, yandex: { ...patch, measure: null } } }));
  const user = userEvent.setup();
  render(<ProductsPage />);
  const controls = within(await yandexRow());
  await user.selectOptions(controls.getByRole('combobox', { name: /Единица измерения/ }), 'GRM');
  await user.type(controls.getByRole('spinbutton', { name: /Вес или объём упаковки/ }), '120');
  await user.click(controls.getByRole('button', { name: 'Сохранить' }));
  expect(controls.getByRole('alert')).toHaveTextContent('Не удалось сохранить');
  expect(controls.getByRole('spinbutton', { name: /Вес или объём упаковки/ })).toHaveValue(120);
});

it('explains product fiscal defaults exclude Yandex in the product editor', async () => {
  stubRequests();
  const user = userEvent.setup();
  render(<ProductsPage />);
  await screen.findByRole('heading', { name: product.name });
  await user.click(screen.getByRole('button', { name: 'Изменить', exact: true }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText(/Для Yandex нужны собственные ИКПУ и код упаковки/)).toBeInTheDocument();
});
