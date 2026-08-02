import React, { useEffect, useRef, useState } from 'react';
import { devLogin, pollLogin, startLogin } from '../api/auth';
import { Button } from '../ui/Button';

const POLL_INTERVAL_MS = 2000;
// The matching server route refuses to exist outside development, so this
// button is a convenience, not a second door into production.
const DEV_BUILD = Boolean(import.meta.env?.DEV);

/**
 * Passwordless sign-in for the standalone panel.
 *
 * The browser asks for an attempt, shows a six-digit code, and the operator
 * confirms in the FairHaven bot — but only after checking that the code on
 * screen matches the one the bot quotes. That comparison is the whole point:
 * it stops an attacker who talked an admin into opening a login link from
 * having their own session approved.
 */
export function LoginPage({ onLoggedIn, api = { startLogin, pollLogin, devLogin } }) {
  const [phase, setPhase] = useState('idle');
  const [attempt, setAttempt] = useState(null);
  const [message, setMessage] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timers = useRef({ poll: null, tick: null });

  const stop = () => {
    window.clearInterval(timers.current.poll);
    window.clearInterval(timers.current.tick);
  };
  useEffect(() => stop, []);

  const begin = async () => {
    setPhase('working');
    setMessage('');
    try {
      const { data } = await api.startLogin();
      setAttempt(data);
      setSecondsLeft(data.expiresInSeconds || 180);
      setPhase('waiting');

      timers.current.tick = window.setInterval(() => {
        setSecondsLeft((current) => {
          if (current <= 1) { stop(); setPhase('expired'); return 0; }
          return current - 1;
        });
      }, 1000);

      timers.current.poll = window.setInterval(async () => {
        try {
          const status = await api.pollLogin(data.pollToken);
          if (status.data.status === 'ready') {
            stop();
            onLoggedIn?.();
          } else if (status.data.status === 'denied') {
            stop();
            setPhase('denied');
          } else if (status.data.status === 'expired') {
            stop();
            setPhase('expired');
          }
        } catch (error) {
          stop();
          setPhase('idle');
          setMessage(error.message);
        }
      }, POLL_INTERVAL_MS);
    } catch (error) {
      setPhase('idle');
      setMessage(error.message);
    }
  };

  const restart = () => { stop(); setAttempt(null); setPhase('idle'); setMessage(''); };

  return (
    <main className="fh-access" aria-label="Панель управления FairHaven">
      <div className="fh-access__seal">FH</div>
      <p className="fh-eyebrow">FAIRHAVEN / OPERATIONS</p>
      <h1>Вход для команды</h1>

      {phase === 'waiting' && attempt ? (
        <>
          <p>Откройте FairHaven-бот и подтвердите вход. <b>Сверьте код</b> — в боте должен быть ровно этот:</p>
          <p className="fh-login-code" aria-label={`Код подтверждения ${attempt.userCode.split('').join(' ')}`}>{attempt.userCode}</p>
          <p className="fh-login-hint">Если в боте другой код — нажмите там «Отклонить»: вход запрашивает кто-то другой.</p>
          <a className="fh-button fh-button--primary fh-button--md" href={attempt.botUrl} target="_blank" rel="noopener noreferrer">Открыть бот</a>
          <p className="fh-login-timer">Ждём подтверждение · осталось {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</p>
          <Button variant="ghost" onClick={restart}>Отменить</Button>
        </>
      ) : phase === 'denied' ? (
        <>
          <p className="fh-error-text">Вход отклонён в боте.</p>
          <p>Если это были не вы — ничего делать не нужно, доступ не выдан.</p>
          <Button variant="primary" onClick={restart}>Попробовать снова</Button>
        </>
      ) : phase === 'expired' ? (
        <>
          <p className="fh-error-text">Время подтверждения истекло.</p>
          <Button variant="primary" onClick={restart}>Начать заново</Button>
        </>
      ) : (
        <>
          <p>Пароля нет. Вход подтверждается в FairHaven-боте — только для администраторов.</p>
          <Button variant="primary" onClick={begin} disabled={phase === 'working'}>
            {phase === 'working' ? 'Готовим вход…' : 'Войти через Telegram'}
          </Button>
          {DEV_BUILD && api.devLogin && (
            <Button
              variant="ghost"
              onClick={async () => {
                try { await api.devLogin(); onLoggedIn?.(); }
                catch (error) { setMessage(error.message); }
              }}
            >Локальный вход (только разработка)</Button>
          )}
          {message && <p className="fh-error-text">{message}</p>}
        </>
      )}
    </main>
  );
}
