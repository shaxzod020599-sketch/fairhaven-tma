import { describe, expect, it } from 'vitest';
import { attentionReason, nextActions, statusMeta } from './orderModel';

describe('order workflow presentation', () => {
  it.each([
    ['pending', ['confirmed', 'cancelled']],
    ['confirmed', ['preparing', 'cancelled']],
    ['preparing', ['delivering', 'cancelled']],
    ['delivering', ['delivered', 'cancelled']],
    ['delivered', ['returned']],
    ['cancelled', []],
    ['returned', []],
  ])('offers only legal next steps from %s', (status, expected) => {
    expect(nextActions(status).map((action) => action.to)).toEqual(expected);
  });

  it('uses plain Russian labels for every terminal and active state', () => {
    expect(statusMeta('preparing').label).toBe('Собирается');
    expect(statusMeta('returned').label).toBe('Возврат');
    expect(statusMeta('unknown').label).toBe('unknown');
  });

  it('prioritizes conflicts over age and flags stale pending orders', () => {
    const now = new Date('2026-08-02T10:00:00.000Z').getTime();
    expect(attentionReason({ status: 'confirmed', billzSync: { conflict: 'sale_failed' }, createdAt: '2026-08-02T09:59:00.000Z' }, now).key).toBe('billz');
    expect(attentionReason({ status: 'pending', createdAt: '2026-08-02T09:20:00.000Z' }, now).key).toBe('stale');
    expect(attentionReason({ status: 'delivered', createdAt: '2026-08-02T09:20:00.000Z' }, now)).toBeNull();
  });
});
