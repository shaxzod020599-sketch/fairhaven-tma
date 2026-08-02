import { describe, expect, it } from 'vitest';
import {
  parseSalesRoute,
  salesRoute,
  sourceMeta,
  statusMeta,
  statusOptions,
} from './salesModel';

describe('salesModel', () => {
  it('uses exact fairhaven.uz and 7-day defaults', () => {
    expect(parseSalesRoute('/sales')).toEqual({
      source: 'fairhaven.uz', period: '7d', status: '', search: '', page: 1,
    });
    expect(sourceMeta('fairhaven.uz').label).toBe('fairhaven.uz');
  });

  it('fails closed to allowlisted source, period and source statuses', () => {
    expect(parseSalesRoute('/sales?source=magazine&period=365d&status=sold')).toEqual({
      source: 'fairhaven.uz', period: '7d', status: '', search: '', page: 1,
    });
    expect(parseSalesRoute('/sales?source=medicalka&period=30d&status=sold&page=2')).toMatchObject({
      source: 'medicalka', period: '30d', status: 'sold', page: 2,
    });
    expect(parseSalesRoute('/sales?source=medicalka&status=delivered').status).toBe('');
  });

  it('URL writer preserves filters and resets page for filter changes', () => {
    const current = parseSalesRoute('/sales?source=medicalka&period=30d&status=sold&search=Ova&page=4');
    expect(salesRoute(current, { period: '7d' })).toBe('/sales?source=medicalka&period=7d&status=sold&search=Ova');
    expect(salesRoute(current, { source: 'uzum' })).toBe('/sales?source=uzum&period=30d&search=Ova');
    expect(salesRoute(current, { page: 3 })).toContain('page=3');
  });

  it('status labels distinguish revenue, returns and failures', () => {
    expect(statusMeta('fairhaven.uz', 'returned')).toEqual(expect.objectContaining({ label: 'Возврат', tone: 'warning' }));
    expect(statusMeta('medicalka', 'failed')).toEqual(expect.objectContaining({ label: 'Ошибка', tone: 'danger' }));
    expect(statusMeta('uzum', 'sold')).toEqual(expect.objectContaining({ label: 'Продан', tone: 'success' }));
    expect(statusOptions('fairhaven.uz').map((item) => item.value)).toContain('delivered');
  });
});
