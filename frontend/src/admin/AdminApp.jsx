import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { whoami, setAdminTgId, clearAdminTgId } from './adminApi';
import {
  pushBackButton,
  popBackButton,
  hapticFeedback,
} from '../utils/telegram';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import Products from './pages/Products';
import Admins from './pages/Admins';
import Customers from './pages/Customers';
import Collections from './pages/Collections';
import Settings from './pages/Settings';
import Gallery from './pages/Gallery';
import PromoCodes from './pages/PromoCodes';
import Channels from './pages/Channels';
import AdminToast from './components/Toast';
import Icon from './components/Icon';

// Icons are SVG rather than emoji: emoji render from the device's own font, so
// they changed shape between iOS, Android and desktop Telegram, ignored colour
// and weight, and sat off the text baseline.
const NAV = [
  { key: 'dashboard', label: 'Обзор', icon: 'dashboard' },
  { key: 'orders', label: 'Заказы', icon: 'orders' },
  { key: 'products', label: 'Товары', icon: 'products' },
  { key: 'channels', label: 'Каналы', icon: 'channels' },
  { key: 'collections', label: 'Подборки', icon: 'collections' },
  { key: 'promos', label: 'Промокоды', icon: 'promos' },
  { key: 'gallery', label: 'Галерея', icon: 'gallery' },
  { key: 'customers', label: 'Клиенты', icon: 'customers' },
  { key: 'admins', label: 'Админы', icon: 'admins' },
  { key: 'settings', label: 'Настройки', icon: 'settings' },
];

// Bottom nav stays at five items (Material guidance); everything else lives
// behind "Ещё". Channels replaces Promo here — it is checked daily, promo codes
// are not.
const MOBILE_NAV = [
  { key: 'dashboard', label: 'Обзор', icon: 'dashboard' },
  { key: 'orders', label: 'Заказы', icon: 'orders' },
  { key: 'products', label: 'Товары', icon: 'products' },
  { key: 'channels', label: 'Каналы', icon: 'channels' },
  { key: 'more', label: 'Ещё', icon: 'more' },
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

  // Memoised because pages put `toast` in useCallback/useEffect dependency
  // lists. A fresh object each render made those callbacks unstable, so a page
  // that refetches on failure and then shows a toast re-rendered this component,
  // produced a new `toast`, and refetched again — an unbounded loop that only
  // appeared once a request started failing.
  const toastApi = useMemo(
    () => ({ ok: (m) => showToast(m, 'ok'), err: (m) => showToast(m, 'err') }),
    [showToast]
  );

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

  // Wire Telegram BackButton to exit admin mode when embedded. We push
  // the handler onto the stack so child screens (e.g. order detail
  // modal) can override it with their own "close" action and have ours
  // restored automatically when they unmount.
  useEffect(() => {
    if (!embedded || !onExit) return;
    const handler = () => {
      hapticFeedback('light');
      onExit();
    };
    pushBackButton(handler);
    return () => popBackButton(handler);
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
      case 'customers': return <Customers toast={toastApi} />;
      case 'admins': return <Admins me={me} toast={toastApi} />;
      case 'collections': return <Collections toast={toastApi} />;
      case 'promos': return <PromoCodes toast={toastApi} />;
      case 'channels': return <Channels toast={toastApi} />;
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
          <div className="ap-brand-logo">
            <span className="ap-brand-logo-name">Fairhaven</span>
            <span className="ap-brand-logo-sub">Health<sup>®</sup></span>
          </div>
          <div className="ap-brand-tag">ADMIN · CMS</div>
        </div>
        <nav className="ap-nav">
          {NAV.map((n) => (
            <button
              key={n.key}
              className={`ap-nav-item ${page === n.key ? 'active' : ''}`}
              onClick={() => navigate(n.key)}
              aria-current={page === n.key ? 'page' : undefined}
            >
              <span className="ap-nav-icon"><Icon name={n.icon} size={19} /></span>
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
          const isMore = n.key === 'more';
          return (
            <button
              key={n.key}
              className={`ap-bn-item ${(isMore ? navOpen : isActive) ? 'active' : ''}`}
              onClick={() => (isMore ? setNavOpen((v) => !v) : navigate(n.key))}
              aria-current={!isMore && isActive ? 'page' : undefined}
              aria-expanded={isMore ? navOpen : undefined}
            >
              <span className="ap-bn-icon"><Icon name={n.icon} size={21} /></span>
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
        <div className="ap-brand-logo large">
          <span className="ap-brand-logo-name">Fairhaven</span>
          <span className="ap-brand-logo-sub">Health<sup>®</sup></span>
        </div>
        <h1 className="ap-login-title">Fairhaven · Админ-панель</h1>
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
