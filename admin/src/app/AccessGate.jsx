import React, { useCallback, useEffect, useRef, useState } from 'react';
import { devLogin, whoAmI } from '../api/auth';
import { DataState } from '../ui/DataState';
import { LoginPage } from './LoginPage';

/**
 * The panel is a standalone desktop web application on its own host. There is
 * no Telegram Mini App surface here: the only way in is an admin session
 * cookie issued after a bot-confirmed login.
 *
 * `dev` skips that handshake once per page load by asking the server for a
 * local session. The matching route refuses to exist outside development, so
 * this is a convenience during local work, not a second door.
 */
export function AccessGate({
  children,
  loadMe = whoAmI,
  createDevSession = devLogin,
  dev = Boolean(import.meta.env?.DEV),
}) {
  const [state, setState] = useState({ phase: 'loading', me: null, error: '' });
  const devTried = useRef(false);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, phase: 'loading', error: '' }));
    try {
      let response = await loadMe();
      if (!response.data?.isAdmin && dev && createDevSession && !devTried.current) {
        devTried.current = true;
        try {
          await createDevSession();
          response = await loadMe();
        } catch (_) { /* fall through to the normal login screen */ }
      }
      setState({ phase: response.data?.isAdmin ? 'ready' : 'denied', me: response.data, error: '' });
    } catch (error) {
      setState({ phase: 'error', me: null, error: error.message });
    }
  }, [createDevSession, dev, loadMe]);

  useEffect(() => { load(); }, [load]);

  if (state.phase === 'loading') {
    return (
      <main className="fh-boot" aria-label="Панель управления FairHaven">
        <span className="fh-boot__mark">FH</span>
        <div><p className="fh-boot__eyebrow">FAIRHAVEN / OPERATIONS</p><h1>Проверяем доступ…</h1></div>
      </main>
    );
  }
  if (state.phase === 'error') {
    return <DataState tone="error" title="Не удалось проверить доступ" message={state.error} actionLabel="Повторить" onAction={load} />;
  }
  if (state.phase === 'denied') return <LoginPage onLoggedIn={load} />;
  return children(state.me);
}
