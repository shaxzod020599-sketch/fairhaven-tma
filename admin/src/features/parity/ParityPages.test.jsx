import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CustomersPage } from '../customers/CustomersPage';
import { AdminsPage } from '../admins/AdminsPage';
import { PromosPage } from '../promos/PromosPage';
import { CollectionsPage } from '../collections/CollectionsPage';
import { SettingsPage } from '../settings/SettingsPage';
import { GalleryPage } from '../gallery/GalleryPage';

describe('parity pages', () => {
  it('shows customer identity and contact data', async () => {
    const api = { list: vi.fn().mockResolvedValue({ data: [{ telegramId: 20001, firstName: 'Dilnoza', lastName: 'Karimova', phone: '+998901112233', role: 'user', registrationStep: 'done' }], meta: { total: 1 } }), detail: vi.fn() };
    render(<CustomersPage api={api} />);
    expect(await screen.findByText('Dilnoza Karimova')).toBeInTheDocument();
    expect(screen.getByText('+998901112233')).toBeInTheDocument();
  });

  it('shows admins and customer-search promotion entry point', async () => {
    const api = { list: vi.fn().mockResolvedValue({ data: [{ telegramId: 10001, firstName: 'Aziza', lastName: '', username: 'aziza' }] }), search: vi.fn(), promote: vi.fn(), demote: vi.fn() };
    render(<AdminsPage api={api} />);
    expect(await screen.findByText('Aziza')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Добавить администратора' })).toBeInTheDocument();
  });

  it('shows promo value and actual usage', async () => {
    const api = { list: vi.fn().mockResolvedValue({ data: [{ _id: 'pr1', code: 'WELCOME15', discountType: 'percentage', discountValue: 15, usedCount: 12, maxUses: 200, isActive: true, currentlyActive: true }] }), create: vi.fn(), update: vi.fn(), remove: vi.fn(), toggle: vi.fn() };
    render(<PromosPage api={api} />);
    expect(await screen.findByText('WELCOME15')).toBeInTheDocument();
    expect(screen.getByText('12 из 200 использований')).toBeInTheDocument();
  });

  it('shows collection and its ordered products', async () => {
    const api = { list: vi.fn().mockResolvedValue({ data: [{ _id: 'c1', name: 'Для планирования', visible: true, productIds: [{ _id: 'p1', name: 'OvaBoost' }] }] }), create: vi.fn(), update: vi.fn(), remove: vi.fn(), products: vi.fn() };
    render(<CollectionsPage api={api} />);
    expect(await screen.findByText('Для планирования')).toBeInTheDocument();
    expect(screen.getByText('1 товар')).toBeInTheDocument();
  });

  it('groups human-readable settings', async () => {
    const api = { list: vi.fn().mockResolvedValue({ data: [{ _id: 's1', key: 'support.phone', label: 'Телефон поддержки', value: '+998 78 150 04 40' }] }), save: vi.fn(), remove: vi.fn() };
    render(<SettingsPage api={api} />);
    expect(await screen.findByDisplayValue('+998 78 150 04 40')).toBeInTheDocument();
    expect(screen.getByText('Телефон поддержки')).toBeInTheDocument();
    expect(screen.getAllByText(/fairhaven\.uz/i).length).toBeGreaterThan(0);
    expect(document.body).not.toHaveTextContent(/магазин/i);
  });

  it('shows gallery assets without forcing square crops', async () => {
    const api = { list: vi.fn().mockResolvedValue({ data: [{ filename: 'wide.webp', url: '/uploads/wide.webp', size: 2048, createdAt: '2026-08-02T10:00:00Z' }] }), upload: vi.fn(), remove: vi.fn() };
    render(<GalleryPage api={api} />);
    expect(await screen.findByAltText('wide.webp')).toHaveAttribute('src', '/uploads/wide.webp');
    expect(screen.getByLabelText('Загрузить изображения')).toHaveAttribute('multiple');
  });
});
