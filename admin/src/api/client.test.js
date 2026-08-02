import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest, clearCsrfToken, downloadRequest, setCsrfToken } from './client';

afterEach(() => {
  vi.unstubAllGlobals();
  delete window.Telegram;
  clearCsrfToken();
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiRequest', () => {
  it('sends session-bound CSRF on mutations and never forwards Telegram initData', async () => {
    window.Telegram = { WebApp: { initData: 'signed=payload' } };
    setCsrfToken('session-csrf');
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { id: 1 } }));
    vi.stubGlobal('fetch', fetch);

    const result = await apiRequest('/orders', { method: 'POST', body: { status: 'confirmed' } });

    expect(result.data).toEqual({ id: 1 });
    expect(fetch).toHaveBeenCalledWith('/api/admin/orders', expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
      body: JSON.stringify({ status: 'confirmed' }),
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        'X-FH-CSRF': 'session-csrf',
      }),
    }));
    expect(fetch.mock.calls[0][1].headers['X-Telegram-Init-Data']).toBeUndefined();
  });

  it('does not add CSRF to read-only requests', async () => {
    setCsrfToken('session-csrf');
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    vi.stubGlobal('fetch', fetch);

    await apiRequest('/orders');

    expect(fetch.mock.calls[0][1].headers['X-FH-CSRF']).toBeUndefined();
  });

  it('keeps FormData content type under browser control', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    vi.stubGlobal('fetch', fetch);
    const body = new FormData();
    body.append('file', new Blob(['x']), 'catalog.xlsx');

    await apiRequest('/products/import', { method: 'POST', body });

    const request = fetch.mock.calls[0][1];
    expect(request.body).toBe(body);
    expect(request.headers['Content-Type']).toBeUndefined();
  });

  it('normalizes backend failures without exposing raw HTML', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<h1>proxy error</h1>', {
      status: 502,
      headers: { 'Content-Type': 'text/html' },
    })));

    await expect(apiRequest('/orders')).rejects.toMatchObject({
      name: 'ApiError',
      status: 502,
      code: 'request_failed',
      message: 'Сервис временно недоступен',
    });
    expect(ApiError.prototype).toBeInstanceOf(Error);
  });
});

describe('downloadRequest', () => {
  it('returns server filename and blob while preserving auth', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('sheet', {
      headers: { 'Content-Disposition': 'attachment; filename="fairhaven.xlsx"' },
    }));
    vi.stubGlobal('fetch', fetch);

    const result = await downloadRequest('/products/export');

    expect(result.filename).toBe('fairhaven.xlsx');
    expect(await result.blob.text()).toBe('sheet');
  });
});
