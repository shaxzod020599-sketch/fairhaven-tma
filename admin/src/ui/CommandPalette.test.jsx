import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandPalette } from './CommandPalette';

describe('CommandPalette', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('lists sections before typing and searches the server after two characters', async () => {
    const search = vi.fn().mockResolvedValue({
      data: {
        orders: [{ _id: '507f1f77bcf86cd799439011', customerName: 'Dilnoza', totalAmount: 440000 }],
        customers: [], products: [], promos: [],
      },
    });
    render(<CommandPalette open onClose={() => {}} search={search} />);

    expect(screen.getByRole('button', { name: /Заказы/ })).toBeInTheDocument();
    expect(search).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Глобальный поиск'), '439011');

    expect(await screen.findByText('#439011 · Dilnoza')).toBeInTheDocument();
    expect(search).toHaveBeenCalledWith('439011');
  });

  it('opens the highlighted result with the keyboard', async () => {
    const onClose = vi.fn();
    const search = vi.fn().mockResolvedValue({
      data: { orders: [{ _id: '507f1f77bcf86cd799439011', customerName: 'Dilnoza', totalAmount: 440000 }], customers: [], products: [], promos: [] },
    });
    render(<CommandPalette open onClose={onClose} search={search} />);

    const input = screen.getByLabelText('Глобальный поиск');
    await userEvent.type(input, '439011');
    await screen.findByText('#439011 · Dilnoza');
    await userEvent.type(input, '{Enter}');

    expect(onClose).toHaveBeenCalled();
    expect(window.location.pathname).toBe('/orders/507f1f77bcf86cd799439011');
  });
});
