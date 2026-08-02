import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AccessGate } from './AccessGate';
import { LoginPage } from './LoginPage';

describe('AccessGate', () => {
  it('renders workspace after a verified admin session', async () => {
    const loadMe = vi.fn().mockResolvedValue({ data: { isAdmin: true, firstName: 'Aziza' } });
    render(
      <AccessGate loadMe={loadMe}>
        {(me) => <p>Здравствуйте, {me.firstName}</p>}
      </AccessGate>,
    );

    expect(screen.getByText('Проверяем доступ…')).toBeInTheDocument();
    expect(await screen.findByText('Здравствуйте, Aziza')).toBeInTheDocument();
  });

  it('offers bot-confirmed login when there is no admin session', async () => {
    const loadMe = vi.fn().mockResolvedValue({ data: { isAdmin: false } });
    render(<AccessGate loadMe={loadMe}>{() => null}</AccessGate>);

    expect(await screen.findByRole('button', { name: 'Войти через Telegram' })).toBeInTheDocument();
  });

  it('lets the operator retry when the access check itself fails', async () => {
    const loadMe = vi.fn().mockRejectedValue(new Error('Сервис временно недоступен'));
    render(<AccessGate loadMe={loadMe}>{() => null}</AccessGate>);

    expect(await screen.findByRole('heading', { name: 'Не удалось проверить доступ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });

  it('mints a real development session only on explicit local mode', async () => {
    const loadMe = vi.fn()
      .mockResolvedValueOnce({ data: { isAdmin: false } })
      .mockResolvedValueOnce({ data: { isAdmin: true, firstName: 'Local' } });
    const createDevSession = vi.fn().mockResolvedValue({ data: { status: 'ready' } });

    render(
      <AccessGate loadMe={loadMe} createDevSession={createDevSession} dev>
        {(me) => <p>Здравствуйте, {me.firstName}</p>}
      </AccessGate>,
    );

    expect(await screen.findByText('Здравствуйте, Local')).toBeInTheDocument();
    expect(createDevSession).toHaveBeenCalledTimes(1);
    expect(loadMe).toHaveBeenCalledTimes(2);
  });
});

describe('LoginPage', () => {
  const attempt = {
    pollToken: 'poll-token',
    userCode: '042731',
    botUrl: 'https://t.me/fairhaven_bot?start=admin_poll-token',
    expiresInSeconds: 180,
  };

  it('shows the comparison code the operator must match inside the bot', async () => {
    const api = {
      startLogin: vi.fn().mockResolvedValue({ data: attempt }),
      pollLogin: vi.fn().mockResolvedValue({ data: { status: 'pending' } }),
    };
    render(<LoginPage onLoggedIn={() => {}} api={api} />);

    await userEvent.click(screen.getByRole('button', { name: 'Войти через Telegram' }));

    expect(await screen.findByText('042731')).toBeInTheDocument();
    expect(screen.getByText(/Сверьте код/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Открыть бот' })).toHaveAttribute('href', attempt.botUrl);
  });

  it('enters the panel once the bot approves and stops polling', async () => {
    const onLoggedIn = vi.fn();
    const api = {
      startLogin: vi.fn().mockResolvedValue({ data: attempt }),
      pollLogin: vi.fn().mockResolvedValue({ data: { status: 'ready' } }),
    };
    render(<LoginPage onLoggedIn={onLoggedIn} api={api} />);

    await userEvent.click(screen.getByRole('button', { name: 'Войти через Telegram' }));
    await screen.findByText('042731');
    await vi.waitFor(() => expect(onLoggedIn).toHaveBeenCalled(), { timeout: 4000 });

    expect(api.pollLogin).toHaveBeenCalledWith('poll-token');
  });

  it('explains a rejection in the bot instead of retrying silently', async () => {
    const api = {
      startLogin: vi.fn().mockResolvedValue({ data: attempt }),
      pollLogin: vi.fn().mockResolvedValue({ data: { status: 'denied' } }),
    };
    render(<LoginPage onLoggedIn={() => {}} api={api} />);

    await userEvent.click(screen.getByRole('button', { name: 'Войти через Telegram' }));
    expect(await screen.findByText('Вход отклонён в боте.', undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Попробовать снова' })).toBeInTheDocument();
  });
});
