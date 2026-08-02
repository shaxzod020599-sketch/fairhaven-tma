import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

describe('Dialog', () => {
  it('moves focus inside and closes with Escape', async () => {
    const close = vi.fn();
    render(
      <Dialog open title="Отклонить заказ" onClose={close}>
        <button type="button">Подтвердить</button>
      </Dialog>,
    );

    expect(screen.getByRole('dialog', { name: 'Отклонить заказ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Закрыть' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(close).toHaveBeenCalledOnce();
  });
});
