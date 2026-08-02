import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App, { PAGE_MAP } from './App';
import { NAV_ITEMS } from './navigation';

describe('App', () => {
  it('shows FairHaven operator workspace while access is checked', () => {
    render(<App />);

    expect(screen.getByRole('main', { name: 'Панель управления FairHaven' })).toBeInTheDocument();
    expect(screen.getByText('Проверяем доступ…')).toBeInTheDocument();
  });

  it('opens requested admin page inside full operator shell after access succeeds', async () => {
    window.history.replaceState({}, '', '/products');

    render(<App loadMe={async () => ({ data: { isAdmin: true, firstName: 'Timur', telegramId: 7 } })} />);

    expect(await screen.findByRole('heading', { name: 'Товары' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Глобальный поиск' })).toBeInTheDocument();
    expect(screen.getByText('Timur')).toBeInTheDocument();
  });

  it('navigation reserves first-class Sales and Billz workspaces', () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual(expect.arrayContaining(['Продажи', 'Billz']));
    expect(NAV_ITEMS.find((item) => item.label === 'Продажи')?.path).toBe('/sales');
    expect(NAV_ITEMS.find((item) => item.label === 'Billz')?.path).toBe('/billz');
    expect(PAGE_MAP['/sales']).toBeTypeOf('function');
    expect(PAGE_MAP['/billz']).toBeTypeOf('function');
  });
});
