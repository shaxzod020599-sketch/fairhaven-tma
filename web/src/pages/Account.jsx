import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { useI18n } from '../i18n/index.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { fetchMyOrders } from '../api.js';
import { formatSum } from '../catalog/index.js';
import { EASE_OUT } from '../motion/index.js';
import { Button, EmptyState, Skeleton } from '../components/ui/index.js';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { ChevronDown, ChevronRight, Package, Phone, Shield, User } from '../components/Icons.jsx';
import { useSeo } from '../seo/useSeo.js';
import TelegramLogin from './account/TelegramLogin.jsx';
import OrderDetails from './cart/OrderDetails.jsx';
import './account/Account.css';

const STATUSES = ['pending', 'confirmed', 'preparing', 'delivering', 'delivered', 'cancelled', 'returned'];

function OrderCard({ order }) {
  const { t, tf, lang } = useI18n();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const status = STATUSES.includes(order.status) ? order.status : 'pending';
  const panelId = `acc-order-${order._id}`;
  const date = order.createdAt
    ? new Date(order.createdAt).toLocaleDateString(lang === 'uz' ? 'uz-Latn-UZ' : 'ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  return (
    <article className={`acc-order${open ? ' is-open' : ''}`}>
      <header className="acc-order-head">
        <div className="acc-order-id">
          <h3 className="acc-order-no">{tf('account.orderNo', { n: String(order._id).slice(-6).toUpperCase() })}</h3>
          {date && <span className="acc-order-date">{tf('account.placedOn', { date })}</span>}
        </div>
        <span className={`acc-status acc-status--${status}`}>{t(`account.status.${status}`)}</span>
        <span className="acc-order-total t-price">{formatSum(order.totalAmount, lang)}</span>
        <button
          type="button"
          className="acc-order-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          <span>{open ? t('account.hide') : t('account.details')}</span>
          <ChevronDown size={18} />
        </button>
      </header>
      <AnimatePresence initial={false}>
        {open && (
          <m.div
            key="details"
            id={panelId}
            className="acc-order-body"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.28, ease: EASE_OUT }}
          >
            <OrderDetails order={order} />
          </m.div>
        )}
      </AnimatePresence>
    </article>
  );
}

function Orders() {
  const { t, tf, plural } = useI18n();
  const [orders, setOrders] = useState(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    let mounted = true;
    setFailed(false);
    setOrders(null);
    fetchMyOrders()
      .then((res) => { if (mounted) setOrders(res?.data || []); })
      .catch(() => { if (mounted) { setOrders([]); setFailed(true); } });
    return () => { mounted = false; };
  }, []);

  useEffect(() => load(), [load]);

  return (
    <section className="acc-orders" aria-labelledby="acc-orders-h">
      <div className="acc-orders-head">
        <h2 id="acc-orders-h" className="t-h3">{t('account.orders')}</h2>
        {orders?.length > 0 && (
          <span className="acc-orders-count t-num">
            {tf('account.ordersCount', { n: orders.length, unit: plural(orders.length, t('account.ordersUnit')) })}
          </span>
        )}
      </div>

      {orders === null && (
        <div className="acc-orders-list" aria-busy="true">
          <Skeleton h={88} r={20} />
          <Skeleton h={88} r={20} />
        </div>
      )}
      {failed && (
        <div className="acc-orders-error" role="alert">
          <p>{t('account.ordersError')}</p>
          <Button variant="secondary" size="sm" onClick={load}>{t('retry')}</Button>
        </div>
      )}
      {orders && !failed && orders.length === 0 && (
        <EmptyState
          as="h3"
          icon={<Package size={40} />}
          title={t('account.noOrders')}
          text={t('account.noOrdersText')}
          action={<Button to="/shop">{t('goToShop')}</Button>}
        />
      )}
      {orders?.length > 0 && (
        <div className="acc-orders-list">
          {orders.map((o) => <OrderCard key={o._id} order={o} />)}
        </div>
      )}
    </section>
  );
}

export default function Account() {
  useSeo();
  const { t } = useI18n();
  const { user, isLoading, logout } = useAuth();
  const reduce = useReducedMotion();
  const name = user ? [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username : '';

  return (
    <div className="acc-page">
      <div className="container container-narrow">
        <Breadcrumbs trail={[{ label: t('home'), to: '/' }, { label: t('account.title') }]} />
        <h1 className="t-h1 acc-title">{t('account.title')}</h1>

        {isLoading && (
          <div className="acc-loading" aria-busy="true">
            <span className="sr-only">{t('loading')}</span>
            <Skeleton h={112} r={20} />
            <Skeleton h={88} r={20} />
          </div>
        )}

        {!isLoading && !user && <TelegramLogin variant="full" />}

        {!isLoading && user && (
          <m.div
            className="acc-signed"
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
          >
            <section className="acc-profile" aria-label={t('account.signedIn')}>
              <span className="acc-avatar">
                {user.photoUrl ? <img src={user.photoUrl} alt="" width="64" height="64" /> : <User size={28} />}
              </span>
              <div className="acc-identity">
                <span className="acc-signed-label">{t('account.signedIn')}</span>
                <strong className="acc-name">{name}</strong>
                {user.phone && (
                  <span className="acc-phone t-num"><Phone size={16} />{user.phone}</span>
                )}
              </div>
              <Button variant="secondary" size="sm" onClick={logout} className="acc-logout">
                {t('account.logout')}
              </Button>
            </section>

            {user.role === 'admin' && (
              <Link to="/admin" className="acc-admin">
                <span className="acc-admin-icon" aria-hidden="true"><Shield size={20} /></span>
                <span className="acc-admin-text">
                  <strong>{t('account.admin')}</strong>
                  <span>{t('account.adminText')}</span>
                </span>
                <ChevronRight size={20} />
              </Link>
            )}

            <Orders />
          </m.div>
        )}
      </div>
    </div>
  );
}
