import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, m } from 'motion/react';
import { useI18n } from '../i18n/index.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { fetchMyOrders } from '../api.js';
import { formatPrice } from '../helpers.js';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { User as UserIcon } from '../components/Icons.jsx';

const STATUS_KEYS = {
  pending: 'statusPending',
  confirmed: 'statusConfirmed',
  preparing: 'statusConfirmed',
  delivering: 'statusConfirmed',
  delivered: 'statusDelivered',
  cancelled: 'statusCancelled',
};

function PlaneArt({ waiting }) {
  return (
    <m.div
      className="tg-login-art"
      aria-hidden="true"
      animate={waiting ? { scale: [1, 1.04, 1] } : { scale: 1 }}
      transition={waiting ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : {}}
    >
      <svg viewBox="0 0 240 240" width="96" height="96">
        <circle cx="120" cy="120" r="120" fill="#973961" opacity="0.08" />
        <m.circle
          cx="120" cy="120" r="88" fill="#973961" opacity="0.12"
          animate={waiting ? { opacity: [0.12, 0.22, 0.12] } : { opacity: 0.12 }}
          transition={waiting ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : {}}
        />
        <m.path
          d="M53 117l124-48c6-2 11 1 9 10l-21 99c-2 7-6 9-12 6l-32-24-16 15c-2 2-3 3-6 3l2-33 61-55c3-2-1-4-4-2l-76 48-33-10c-7-2-7-7 4-9z"
          fill="#973961"
          animate={waiting ? { x: [0, 5, 0], y: [0, -4, 0] } : { x: 0, y: 0 }}
          transition={waiting ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } : {}}
        />
      </svg>
    </m.div>
  );
}

const stageFade = {
  initial: { opacity: 0, y: 14, scale: 0.99 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -10, transition: { duration: 0.16, ease: 'easeIn' } },
  transition: { type: 'spring', stiffness: 300, damping: 26 },
};

function LoginPanel() {
  const { t } = useI18n();
  const { loginState, beginLogin, cancelLogin } = useAuth();
  const [botUrl, setBotUrl] = useState('');

  const start = async () => {
    const url = await beginLogin();
    if (url) {
      setBotUrl(url);
      window.open(url, '_blank', 'noopener');
    }
  };

  const waiting = loginState === 'waiting';

  return (
    <m.section
      className="tg-login-panel"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 220, damping: 26 }}
    >
      <PlaneArt waiting={waiting} />
      <h2 className="tg-login-title">{t('tgLoginTitle')}</h2>
      <p className="tg-login-desc">{t('tgLoginDesc')}</p>

      <div className="tg-login-stage">
        <AnimatePresence mode="wait" initial={false}>
          {!waiting ? (
            <m.div key="cta" {...stageFade}>
              <m.button
                type="button"
                className="btn btn-primary btn-lg tg-login-btn"
                onClick={start}
                whileHover={{ y: -2, scale: 1.015 }}
                whileTap={{ scale: 0.965 }}
                transition={{ type: 'spring', stiffness: 420, damping: 22 }}
              >
                <svg width="19" height="19" viewBox="0 0 240 240" fill="none" aria-hidden="true">
                  <path d="M53 117l124-48c6-2 11 1 9 10l-21 99c-2 7-6 9-12 6l-32-24-16 15c-2 2-3 3-6 3l2-33 61-55c3-2-1-4-4-2l-76 48-33-10c-7-2-7-7 4-9z" fill="currentColor" />
                </svg>
                {t('tgLoginCta')}
              </m.button>
              {loginState === 'error' && (
                <m.div
                  className="promo-msg error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  role="alert"
                >
                  {t('tgLoginExpired')}
                </m.div>
              )}
            </m.div>
          ) : (
            <m.div key="waiting" className="tg-login-waiting" {...stageFade}>
              <span className="tg-login-spinner" aria-hidden="true" />
              <p aria-live="polite">{t('tgLoginWaiting')}</p>
              {botUrl && (
                <a href={botUrl} target="_blank" rel="noopener noreferrer" className="tg-login-relink">
                  {t('tgLoginReopen')}
                </a>
              )}
              <button type="button" className="btn btn-outline btn-sm" onClick={cancelLogin}>
                {t('cancel')}
              </button>
            </m.div>
          )}
        </AnimatePresence>
      </div>

      <ol className="tg-login-steps">
        <li>{t('tgLoginStep1')}</li>
        <li>{t('tgLoginStep2')}</li>
        <li>{t('tgLoginStep3')}</li>
      </ol>
    </m.section>
  );
}

function OrdersList() {
  const { t } = useI18n();
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    let mounted = true;
    fetchMyOrders()
      .then((res) => { if (mounted) setOrders(res?.data || []); })
      .catch(() => { if (mounted) setOrders([]); });
    return () => { mounted = false; };
  }, []);

  if (orders === null) return <p>{t('loading')}</p>;
  if (orders.length === 0) {
    return (
      <div className="account-empty">
        <p>{t('noOrdersYet')}</p>
        <Link to="/shop" className="btn btn-primary">{t('goToShop')}</Link>
      </div>
    );
  }

  return (
    <div className="account-orders">
      {orders.map((o) => (
        <article className="account-order-card" key={o._id}>
          <header className="account-order-head">
            <strong>#{String(o._id).slice(-6).toUpperCase()}</strong>
            <span className={`order-status order-status-${o.status}`}>
              {t(STATUS_KEYS[o.status] || 'statusPending')}
            </span>
          </header>
          <ul className="account-order-items">
            {o.items.map((it, i) => (
              <li key={i}>
                {it.name} × {it.quantity}
              </li>
            ))}
          </ul>
          <footer className="account-order-foot">
            <span>{new Date(o.createdAt).toLocaleDateString('ru-RU')}</span>
            <strong>{formatPrice(o.totalAmount)}</strong>
          </footer>
        </article>
      ))}
    </div>
  );
}

export default function Account() {
  const { t } = useI18n();
  const { user, isLoading, logout } = useAuth();

  return (
    <div className="account-page">
      <div className="container container-narrow">
        <Breadcrumbs trail={[{ label: t('goHome'), to: '/' }, { label: t('account') }]} />
        <h1 className="page-title">{t('account')}</h1>

        {isLoading && <p>{t('loading')}</p>}

        {!isLoading && !user && <LoginPanel />}

        {!isLoading && user && (
          <m.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 240, damping: 26 }}
          >
            <section className="account-profile">
              <div className="account-avatar" aria-hidden="true">
                {user.photoUrl
                  ? <img src={user.photoUrl} alt="" width="56" height="56" />
                  : <UserIcon width={28} height={28} />}
              </div>
              <div className="account-identity">
                <strong>{[user.firstName, user.lastName].filter(Boolean).join(' ') || user.username}</strong>
                {user.phone && <span>{user.phone}</span>}
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={logout}>
                {t('logout')}
              </button>
            </section>

            <section className="account-history">
              <h2 className="summary-title">{t('myOrders')}</h2>
              <OrdersList />
            </section>
          </m.div>
        )}
      </div>
    </div>
  );
}
