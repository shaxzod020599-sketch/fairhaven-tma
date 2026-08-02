import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProductsPage } from './ProductsPage';

const product = {
  _id: 'p1', name: 'OvaBoost for Women', brand: 'Fairhaven Health', sku: 'FH-1001',
  price: 420000, category: 'vitamins', imageUrl: '', images: [], isAvailable: true,
  billzProductId: 'b1', mxikCode: '',
  billz: { retailPrice: 425000, stock: 14, reservedQty: 2, pendingQty: 1, available: 11, syncedAt: '2026-08-02T09:00:00.000Z' },
  channels: {
    medicalka: { enabled: true, price: 450000, forceStatus: 'auto', minStock: 2, live: true },
    uzum: { enabled: false, price: 0, forceStatus: 'out', minStock: 3, live: false },
  },
  shop: { mode: 'auto', visible: true, reason: 'in_stock', image: true },
};

describe('ProductsPage', () => {
  it('keeps Billz truth and marketplace controls on one product dossier', async () => {
    const api = {
      list: vi.fn().mockResolvedValue({ data: [product], meta: { total: 1, page: 1, limit: 24 } }),
      summary: vi.fn().mockResolvedValue({ data: { counts: { total: 1, unlinked: 0, out_of_stock: 0, no_price: 0, no_mxik: 1 } } }),
      update: vi.fn(), updateMeta: vi.fn(), updateChannel: vi.fn(), link: vi.fn(), searchBillz: vi.fn(), create: vi.fn(), remove: vi.fn(),
    };
    render(<ProductsPage api={api} />);

    expect(await screen.findByText('OvaBoost for Women')).toBeInTheDocument();
    expect(screen.getByText('425 000 сум')).toBeInTheDocument();
    expect(screen.getByText('14 шт.')).toBeInTheDocument();
    expect(screen.getByText('Резерв 2')).toBeInTheDocument();
    expect(screen.getByText('Medicalka')).toBeInTheDocument();
    expect(screen.getByText('Uzum Tezkor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Все1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Без ИКПУ1' })).toBeInTheDocument();
  });

  it('opens Billz list before typing when linking an unlinked product', async () => {
    const unlinked = { ...product, _id: 'p2', billzProductId: '', billz: null };
    const api = {
      list: vi.fn().mockResolvedValue({ data: [unlinked], meta: { total: 1, page: 1, limit: 24 } }),
      summary: vi.fn().mockResolvedValue({ data: { counts: { total: 1, unlinked: 1 } } }),
      searchBillz: vi.fn().mockResolvedValue({ data: [{ billzProductId: 'b9', name: 'FertilAid for Men', sku: 'FH-2091', retailPrice: 520000, stock: 3, linkedTo: null }] }),
      link: vi.fn().mockResolvedValue({ data: { ...unlinked, billzProductId: 'b9' } }),
      update: vi.fn(), updateMeta: vi.fn(), updateChannel: vi.fn(), create: vi.fn(), remove: vi.fn(),
    };
    render(<ProductsPage api={api} />);
    await screen.findByText('OvaBoost for Women');

    await userEvent.click(screen.getByRole('button', { name: 'Связать с Billz' }));

    expect(api.searchBillz).toHaveBeenCalledWith({ search: '', limit: 50 });
    expect(await screen.findByText('FertilAid for Men')).toBeInTheDocument();
    expect(screen.getByText('3 шт.')).toBeInTheDocument();
  });
});
