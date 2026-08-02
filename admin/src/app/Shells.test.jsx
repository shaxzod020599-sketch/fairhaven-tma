import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FullShell } from './FullShell';

const me = { firstName: 'Aziza', telegramId: 10001 };

describe('application shell', () => {
  it('gives direct access to daily work areas and marks the active one', () => {
    render(<FullShell route="/orders" me={me}><p>Рабочая область</p></FullShell>);

    const navigation = screen.getByRole('navigation', { name: 'Основная навигация' });
    expect(within(navigation).getByRole('link', { name: 'Заказы' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Глобальный поиск' })).toBeInTheDocument();
    expect(screen.getByText('Aziza')).toBeInTheDocument();
    expect(screen.getByText('Рабочая область')).toBeInTheDocument();
  });

  it('surfaces the attention count on orders and offers sign-out', () => {
    const onSignOut = vi.fn();
    render(<FullShell route="/" me={me} alertCount={3} onSignOut={onSignOut}><p>Обзор</p></FullShell>);

    const navigation = screen.getByRole('navigation', { name: 'Основная навигация' });
    expect(within(navigation).getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
  });
});
