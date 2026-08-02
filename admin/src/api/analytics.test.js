import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyticsApi } from './analytics';

afterEach(() => vi.unstubAllGlobals());

function json(body) {
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
}

describe('analyticsApi', () => {
  it('builds source summary and history queries from explicit fields', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ success: true, data: {} }));
    vi.stubGlobal('fetch', fetch);
    await analyticsApi.summary({ source: 'fairhaven.uz', period: '7d' });
    await analyticsApi.history({ source: 'medicalka', preset: '30d', search: 'Ova & Boost', page: 2 });

    expect(fetch.mock.calls[0][0]).toBe('/api/admin/sales/summary?source=fairhaven.uz&preset=7d');
    expect(fetch.mock.calls[0][0]).not.toContain('period=');
    expect(fetch.mock.calls[1][0]).toContain('/api/admin/sales/history?');
    expect(fetch.mock.calls[1][0]).toContain('search=Ova+%26+Boost');
  });

  it('sales export uses same-origin credentials and server filename', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('xlsx', {
      headers: { 'Content-Disposition': 'attachment; filename="fairhaven-uz-sales.xlsx"' },
    }));
    vi.stubGlobal('fetch', fetch);
    const result = await analyticsApi.exportSales({ source: 'fairhaven.uz', preset: '7d' });
    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/sales/export?source=fairhaven.uz&preset=7d',
      expect.objectContaining({ credentials: 'same-origin', method: 'GET' })
    );
    expect(result.filename).toBe('fairhaven-uz-sales.xlsx');
  });
});
