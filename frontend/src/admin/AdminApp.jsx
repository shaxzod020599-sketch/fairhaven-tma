import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { openAdminSession, rememberCsrfToken, whoami } from './adminApi';
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
import AdminToast from './components/Toast';
import Icon from './components/Icon';

// Icons are SVG rather than emoji: emoji render from the device's own font, so
// they changed shape between iOS, Android and desktop Telegram, ignored colour
// and weight, and sat off the text baseline.
// Marketplace channels are absent on purpose: that screen configures the
// Billz/Uzum/Medicalka integrations and hands out their credentials, which is
// desk work, not phone work. It stays on admin.fairhaven.uz, and the server
// refuses /channels on this host regardless of what the UI offers.
const NAV = [
  { key: 'dashboard', label: 'Обзор', icon: 'dashboard' },
  { key: 'orders', label: 'Заказы', icon: 'orders' },
  { key: 'products', label: 'Товары', icon: 'products' },
  { key: 'collections', label: 'Подборки', icon: 'collections' },
  { key: 'promos', label: 'Промокоды', icon: 'promos' },
  { key: 'gallery', label: 'Галерея', icon: 'gallery' },
  { key: 'customers', label: 'Клиенты', icon: 'customers' },
  { key: 'admins', label: 'Админы', icon: 'admins' },
  { key: 'settings', label: 'Настройки', icon: 'settings' },
];

// Bottom nav stays at five items (Material guidance); everything else lives
// behind "Ещё".
const MOBILE_NAV = [
  { key: 'dashboard', label: 'Обзор', icon: 'dashboard' },
  { key: 'orders', label: 'Заказы', icon: 'orders' },
  { key: 'products', label: 'Товары', icon: 'products' },
  { key: 'collections', label: 'Подборки', icon: 'collections' },
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

  // Reuse the session this web view already has before spending initData on a
  // new one: Telegram signs that payload once, and the server refuses a repeat.
  const check = useCallback(async () => {
    const accept = (data) => {
      rememberCsrfToken(data.csrfToken);
      setMe(data);
      setStatus('ready');
    };
    try {
      const existing = await whoami();
      if (existing?.data?.isAdmin) return accept(existing.data);

      await openAdminSession();
      const opened = await whoami();
      if (opened?.data?.isAdmin) return accept(opened.data);
      return setStatus('login');
    } catch (_) {
      return setStatus('login');
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  /**
   * Telegram's Back button, wired to the section you came from.
   *
   * It used to call `onExit` from anywhere, so Back on the Orders page threw
   * you out of the panel and back to the storefront instead of returning one
   * step. Now it walks the trail of sections and only leaves the panel from
   * the first one — which is what Back means everywhere else in Telegram.
   */
  const trail = useRef([]);

  const goBack = useCallback(() => {
    hapticFeedback('light');
    const previous = trail.current.pop();
    if (previous) {
      setPage(previous.page);
      setPageArgs(previous.args);
      return;
    }
    onExit?.();
  }, [onExit]);

  useEffect(() => {
    if (!embedded || !onExit) return undefined;
    pushBackButton(goBack);
    return () => popBackButton(goBack);
  }, [embedded, onExit, goBack]);

  const navigate = useCallback((target, args = null) => {
    setPage((current) => {
      // Re-selecting the section you are already on is not a step.
      if (current !== target) trail.current.push({ page: current, args: pageArgs });
      return target;
    });
    setPageArgs(args);
    setNavOpen(false);
  }, [pageArgs]);

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
      case 'gallery': return <Gallery toast={toastApi} />;
      case 'settings': return <Settings toast={toastApi} />;
      default: return <Dashboard onNavigate={navigate} />;
    }
  };

  const activeNav = NAV.find((n) => n.key === page);

  return (
    <div className={`ap-shell ${embedded ? 'embedded' : ''}`}>
      <aside className="ap-sidebar">
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
              onClick={() => window.location.reload()}
            >
              Обновить
            </button>
          )}
        </div>
      </aside>

      <main className="ap-main">
        <header className="ap-topbar">
          {embedded ? (
            <button
              className="ap-hamburger"
              onClick={goBack}
              aria-label={trail.current.length ? 'Назад' : 'Назад в магазин'}
              title={trail.current.length ? 'Назад' : 'Назад в магазин'}
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

      {navOpen && (
        <MoreSheet
          page={page}
          me={me}
          embedded={embedded}
          onExit={onExit}
          onNavigate={navigate}
          onClose={() => setNavOpen(false)}
        />
      )}
      <AdminToast toast={toast} />
    </div>
  );
}

/**
 * Mobile navigation, as a light bottom sheet.
 *
 * The first version reused the desktop sidebar as a slide-in drawer. On a
 * phone that reads as a wall of black covering the whole screen — operators
 * described it as "a black window with nothing in it" — and the drawer's own
 * footer button was white-on-white on top of it. A sheet in the panel's own
 * light palette fixes both, and behaves like every other overlay here: tap
 * outside to close, Telegram's Back closes it first.
 */
function MoreSheet({ page, me, embedded, onExit, onNavigate, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    const back = () => onClose();
    pushBackButton(back);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      popBackButton(back);
    };
  }, [onClose]);

  return (
    <div className="ap-sheet-backdrop" onClick={onClose}>
      <div
        className="ap-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Все разделы"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ap-sheet-grip" aria-hidden="true" />
        <nav className="ap-sheet-grid" aria-label="Разделы панели">
          {NAV.map((n) => (
            <button
              key={n.key}
              type="button"
              className={`ap-sheet-item ${page === n.key ? 'active' : ''}`}
              onClick={() => { hapticFeedback('light'); onNavigate(n.key); }}
              aria-current={page === n.key ? 'page' : undefined}
            >
              <span className="ap-sheet-icon"><Icon name={n.icon} size={22} /></span>
              <span className="ap-sheet-label">{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="ap-sheet-foot">
          <div className="ap-sheet-user">
            <div className="ap-sheet-user-name">
              {[me.firstName, me.lastName].filter(Boolean).join(' ') || me.username || 'admin'}
            </div>
            <div className="ap-muted-sm">ID: {me.telegramId}</div>
          </div>
          {embedded ? (
            <button type="button" className="ap-btn ap-btn-ghost ap-btn-xs" onClick={onExit}>
              ← В магазин
            </button>
          ) : (
            <button
              type="button"
              className="ap-btn ap-btn-ghost ap-btn-xs"
              onClick={() => window.location.reload()}
            >
              Обновить
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Shown when the panel is opened outside Telegram.
 *
 * There is deliberately no login form. The only credential the API accepts is
 * Telegram's signed initData, which a plain browser cannot produce — the field
 * that used to sit here promised a way in that could not work, and making it
 * work would have meant accepting a typed Telegram ID as proof of identity,
 * which is no proof at all.
 */
function LoginPage() {
  const botUsername = (import.meta.env.VITE_BOT_USERNAME || 'Fairhaven_uzbot').replace(/^@/, '');

  return (
    <div className="ap-login">
      <div className="ap-login-card">
        <div className="ap-brand-logo large">
          <span className="ap-brand-logo-name">Fairhaven</span>
          <span className="ap-brand-logo-sub">Health<sup>&reg;</sup></span>
        </div>
        <h1 className="ap-login-title">Панель управления</h1>
        <p className="ap-muted" style={{ marginBottom: 18 }}>
          Панель открывается только внутри Telegram — так вход подтверждается
          подписью самого Telegram, а не паролем, который можно подобрать.
        </p>

        <ol className="ap-login-steps">
          <li>Откройте бота <b>@{botUsername}</b></li>
          <li>Нажмите <b>&laquo;Открыть магазин&raquo;</b></li>
          <li>Внизу выберите <b>Профиль</b> &rarr; <b>Админ-панель</b></li>
        </ol>

        <a
          className="ap-btn ap-btn-primary"
          style={{ marginTop: 14, width: '100%' }}
          href={`https://t.me/${botUsername}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Открыть бота
        </a>

        <div className="ap-muted-sm" style={{ marginTop: 16 }}>
          Если кнопка &laquo;Админ-панель&raquo; не появилась — ваш Telegram ID
          ещё не в списке администраторов. Первый администратор назначается
          переменной <code>ADMIN_TELEGRAM_IDS</code> на сервере, остальных
          добавляет действующий администратор в разделе <b>Админы</b>.
        </div>
      </div>
    </div>
  );
}
