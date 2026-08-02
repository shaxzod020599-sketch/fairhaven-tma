import { describe, expect, it } from 'vitest';
import { formatDateTime, formatMoney, shortId } from './format';

describe('operator formatters', () => {
  it('formats money and identifiers as stable operator data', () => {
    expect(formatMoney(1250000)).toBe('1 250 000 сум');
    expect(shortId('507f1f77bcf86cd799439011')).toBe('439011');
  });

  it('uses Tashkent time for operational timestamps', () => {
    expect(formatDateTime('2026-08-02T07:05:00.000Z')).toBe('02.08.2026, 12:05');
  });
});
