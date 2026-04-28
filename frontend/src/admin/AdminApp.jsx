import React, { useEffect, useState, useCallback } from 'react';
import { whoami, setAdminTgId, clearAdminTgId } from './adminApi';
import {
  showBackButton,
  hideBackButton,
  hapticFeedback,
} from '../utils/telegram';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import Products from './pages/Products';
import Admins from './pages/Admins';
import Collections from './pages/Collections';
import Settings from './pages/Settings';
import Gallery from './pages/Gallery';
import PromoCodes from './pages/PromoCodes';
import AdminToast from './components/Toast';

const NAV = [
  { key: 'dashboard', label: 'Обзор', icon: '◉' },
  { key: 'orders', label: 'Заказы', icon: '📦' },
  { key: 'products', label: 'Товары', icon: '🌿' },
  { key: 'collections', label: 'Подборки', icon: '✦' },
  { key: 'promos', label: 'Промокоды', icon: '🎟' },
  { key: 'gallery', label: 'Галерея', icon: '🖼' },
  { key: 'admins', label: 'Админы', icon: '👑' },
  { key: 'settings', label: 'Настройки', icon: '⚙' },
];

// Mobile bottom-nav — the 5 primary sections.
const MOBILE_NAV = [
  { key: 'dashboard', label: 'Обзор', icon: '◉' },
  { key: 'orders', label: 'Заказы', icon: '📦' },
  { key: 'products', label: 'Товары', icon: '🌿' },
  { key: 'promos', label: 'Промо', icon: '🎟' },
  { key: 'more', label: 'Ещё', icon: '⋯' },
];

export default function AdminApp({ onExit, embedded }) {
  const [status, setStatus] = useState('loading'); // loading | login | ready
  const [me, setMe] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [toast, setToast] = useState({ visible: false });
  const [pageArgs, setPageArgs] = useState(null);
  const [navOpen, setNavOpen] = useState(false);

  const showToast = useCallback((message, tone = 'ok') => {
    setToast({ visible: true, message, tone });
    setTimeout(() => setToast({ visible: false }), 2800);
  }, []);

  const toastApi = { ok: (m) => showToast(m, 'ok'), err: (m) => showToast(m, 'err') };

  const check = useCallback(async () => {
    try {
      const res = await whoami();
      if (res?.data?.isAdmin) {
        setMe(res.data);
        setStatus('ready');
      } else {
        setStatus('login');
      }
    } catch (_) {
      setStatus('login');
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  // Wire Telegram BackButton to exit admin mode when embedded.
  useEffect(() => {
    if (!embedded || !onExit) return;
    showBackButton(() => {
      hapticFeedback('light');
      onExit();
    });
    return () => hideBackButton();
  }, [embedded, onExit]);

  const navigate = useCallback((target, args = null) => {
    setPage(target);
    setPageArgs(args);
    setNavOpen(false);
  }, []);

  if (status === 'loading') {
    return (
      <div className="ap-shell"><div className="ap-muted" style={{ padding: 48 }}>Загрузка…</div></div>
    );
  }

  if (status === 'login') {
    return <LoginPage onLoggedIn={check} />;
  }

  const renderPage = () => {
    switch (page) {
      case 'orders': return <Orders initial={pageArgs} toast={toastApi} />;
      case 'products': return <Products toast={toastApi} />;
      case 'admins': return <Admins me={me} toast={toastApi} />;
      case 'collections': return <Collections toast={toastApi} />;
      case 'promos': return <PromoCodes toast={toastApi} />;
      case 'gallery': return <Gallery toast={toastApi} />;
      case 'settings': return <Settings toast={toastApi} />;
      default: return <Dashboard onNavigate={navigate} />;
    }
  };

  const activeNav = NAV.find((n) => n.key === page);

  return (
    <div className={`ap-shell ${embedded ? 'embedded' : ''}`}>
      <aside className={`ap-sidebar ${navOpen ? 'open' : ''}`}>
        <div className="ap-brand">
          <div className="ap-brand-mark">FH</div>
          <div>
            <div className="ap-brand-name">FairHaven</div>
            <div className="ap-brand-tag">ADMIN · CMS</div>
          </div>
        </div>
        <nav className="ap-nav">
          {NAV.map((n) => (
            <button
              key={n.key}
              className={`ap-nav-item ${page === n.key ? 'active' : ''}`}
              onClick={() => navigate(n.key)}
            >
              <span className="ap-nav-icon">{n.icon}</span>
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="ap-user">
          <div className="ap-user-body">
            <div className="ap-user-name">
              {[me.firstName, me.lastName].filter(Boolean).join(' ') || me.username || 'admin'}
            </div>
            <div className="ap-muted-sm">ID: {me.telegramId}</div>
          </div>
          {embedded ? (
            <button
              className="ap-btn ap-btn-xs ap-btn-ghost"
              onClick={onExit}
            >
              ← В магазин
            </button>
          ) : (
            <button
              className="ap-btn ap-btn-xs ap-btn-ghost"
              onClick={() => {
                clearAdminTgId();
                window.location.reload();
              }}
            >
              Выйти
            </button>
          )}
        </div>
      </aside>

      <main className="ap-main">
        <header className="ap-topbar">
          {embedded ? (
            <button
              className="ap-hamburger"
              onClick={onExit}
              aria-label="Назад в магазин"
              title="Назад в магазин"
            >
              ←
            </button>
          ) : (
            <button
              className="ap-hamburger"
              onClick={() => setNavOpen((v) => !v)}
              aria-label="Меню"
            >
              ☰
            </button>
          )}
          <div className="ap-topbar-title">
            {activeNav?.label || 'Панель'}
          </div>
          {embedded ? (
            <button
              className="ap-hamburger ap-topbar-nav-btn"
              onClick={() => setNavOpen((v) => !v)}
              aria-label="Меню"
              title="Меню"
            >
              ☰
            </button>
          ) : (
            <a href="/" className="ap-btn ap-btn-ghost ap-topbar-goto">↗ На сайт</a>
          )}
        </header>
        {renderPage()}
      </main>

      {/* Mobile bottom nav */}
      <nav className="ap-bottom-nav">
        {MOBILE_NAV.map((n) => {
          const isActive = page === n.key;
          if (n.key === 'more') {
            return (
              <button
                key={n.key}
                className={`ap-bn-item ${navOpen ? 'active' : ''}`}
                onClick={() => setNavOpen((v) => !v)}
              >
                <span className="ap-bn-icon">{n.icon}</span>
                <span className="ap-bn-label">{n.label}</span>
              </button>
            );
          }
          return (
            <button
              key={n.key}
              className={`ap-bn-item ${isActive ? 'active' : ''}`}
              onClick={() => navigate(n.key)}
            >
              <span className="ap-bn-icon">{n.icon}</span>
              <span className="ap-bn-label">{n.label}</span>
            </button>
          );
        })}
      </nav>

      {navOpen && <div className="ap-backdrop" onClick={() => setNavOpen(false)} />}
      <AdminToast toast={toast} />
    </div>
  );
}

function LoginPage({ onLoggedIn }) {
  const [tgId, setTgId] = useState('');
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    if (!/^\d+$/.test(tgId.trim())) {
      setErr('Введите числовой Telegram ID');
      return;
    }
    setAdminTgId(tgId.trim());
    try {
      const res = await whoami();
      if (res?.data?.isAdmin) {
        onLoggedIn();
      } else {
        setErr('Этот Telegram ID не назначен администратором');
        clearAdminTgId();
      }
    } catch (e) {
      setErr(e.message || 'Ошибка');
      clearAdminTgId();
    }
  };

  return (
    <div className="ap-login">
      <div className="ap-login-card">
        <div className="ap-brand-mark large">FH</div>
        <h1 className="ap-login-title">FairHaven · Админ-панель</h1>
        <p className="ap-muted" style={{ marginBottom: 18 }}>
          Введите ваш Telegram ID, чтобы войти. Чтобы получить ID — откройте бота <b>@FairHavenHealthBot</b> и отправьте <code>/start</code>.
        </p>
        {err && <div className="ap-error">{err}</div>}
        <label className="ap-label">Telegram ID</label>
        <input
          type="text"
          className="ap-input"
          placeholder="например, 123456789"
          value={tgId}
          onChange={(e) => setTgId(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          autoFocus
        />
        <button className="ap-btn ap-btn-primary" style={{ marginTop: 14, width: '100%' }} onClick={submit}>
          Войти
        </button>
        <div className="ap-muted-sm" style={{ marginTop: 16 }}>
          Первый администратор назначается через переменную среды{' '}
          <code>ADMIN_TELEGRAM_IDS</code> на сервере.
        </div>
      </div>
    </div>
  );
}
