import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { fetchOrder } from '../api.js';
import { formatPrice } from '../helpers.js';
import Breadcrumbs from '../components/Breadcrumbs.jsx';

/**
 * Account page — public site has no auth. Guests can look up an order by id
 * (from the success page). Full account/auth would integrate with the Telegram
 * mini-app user system later.
 */
export default function Account() {
  const { t } = useI18n();
  const [orderId, setOrderId] = useState('');
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const lookup = async (e) => {
    e.preventDefault();
    if (!orderId.trim()) return;
    setLoading(true);
    setError('');
    setOrder(null);
    try {
      const res = await fetchOrder(orderId.trim());
      setOrder(res?.data || null);
    } catch (_) {
      setError(t('notFoundDesc'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="account-page">
      <div className="container container-narrow">
        <Breadcrumbs trail={[{ label: t('goHome'), to: '/' }, { label: t('account') }]} />
        <h1 className="page-title">{t('account')}</h1>

        <div className="account-notice">
          <p>
            {t('contactDesc')}
          </p>
          <p>
            ★ {t('orderNumber')}:{' '}
            <Link to="/shop">{t('goToShop')}</Link>
          </p>
        </div>

        <section className="account-lookup">
          <h2 className="summary-title">{t('orderNumber')}</h2>
          <form className="account-lookup-form" onSubmit={lookup}>
            <input
              type="text"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="#ABC123"
            />
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? '…' : t('search')}
            </button>
          </form>

          {error && <div className="promo-msg error">{error}</div>}

          {order && (
            <div className="account-order">
              <div className="summary-row">
                <span>{t('orderNumber')}</span>
                <strong>#{String(order._id).slice(-6).toUpperCase()}</strong>
              </div>
              <div className="summary-row">
                <span>{t('total')}</span>
                <span>{formatPrice(order.totalAmount)}</span>
              </div>
              <div className="summary-row">
                <span>{t('paymentMethod')}</span>
                <span>{order.paymentMethod === 'card' ? t('payCard') : t('payCash')}</span>
              </div>
              <div className="summary-row">
                <span>{t('deliveryAddress')}</span>
                <span>{order.location?.addressString || '—'}</span>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
