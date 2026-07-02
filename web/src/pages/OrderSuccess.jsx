import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchOrder } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import { formatPrice } from '../helpers.js';
import { Check } from '../components/Icons.jsx';

export default function OrderSuccess() {
  const { id } = useParams();
  const { t } = useI18n();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    // Guest orders are fetched with the one-time access token saved at checkout.
    const accessToken = sessionStorage.getItem(`order_t_${id}`) || '';
    fetchOrder(id, accessToken)
      .then((res) => { if (mounted) setOrder(res?.data || null); })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [id]);

  const shortId = order?._id ? String(order._id).slice(-6).toUpperCase() : '------';

  return (
    <div className="container order-success">
      <div className="order-success-card">
        <div className="order-success-icon" aria-hidden="true"><Check width={36} height={36} /></div>
        <h1 className="page-title">{t('orderSuccessTitle')}</h1>
        <p className="order-success-desc">{t('orderSuccessDesc')}</p>
        <div className="order-success-number">
          <span>{t('orderNumber')}</span>
          <strong>#{shortId}</strong>
        </div>

        {!loading && order && (
          <div className="order-success-summary">
            <div className="summary-row">
              <span>{t('total')}</span>
              <strong>{formatPrice(order.totalAmount)}</strong>
            </div>
            <div className="summary-row">
              <span>{t('paymentMethod')}</span>
              <span>{order.paymentMethod === 'card' ? t('payCard') : t('payCash')}</span>
            </div>
          </div>
        )}

        <Link to="/shop" className="btn btn-primary btn-lg">{t('orderContinue')}</Link>
      </div>
    </div>
  );
}
