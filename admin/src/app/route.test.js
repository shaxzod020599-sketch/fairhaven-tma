import { describe, expect, it } from 'vitest';
import { adminHref, matchRoute, normalizeAdminPath } from './route';

describe('native admin routing', () => {
  it('uses subdomain-root browser paths without an /admin prefix', () => {
    expect(normalizeAdminPath('/orders/abc')).toBe('/orders/abc');
    expect(normalizeAdminPath('/')).toBe('/');
    expect(normalizeAdminPath('/shop')).toBe('/shop');
  });

  it('builds safe admin links and extracts route parameters', () => {
    expect(adminHref('/products?page=2')).toBe('/products?page=2');
    expect(adminHref('//evil.example')).toBe('/evil.example');
    expect(matchRoute('/orders/507f1f77bcf86cd799439011', '/orders/:id')).toEqual({ id: '507f1f77bcf86cd799439011' });
    expect(matchRoute('/orders/x/extra', '/orders/:id')).toBeNull();
  });
});
