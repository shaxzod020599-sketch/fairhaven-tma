import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cancelOrder, fetchOrder } from '../utils/api';
import { getTelegramUser, hapticFeedback, hapticNotification, showConfirm } from '../utils/telegram';
import { formatPrice, getProductIcon } from '../utils/helpers';
import {
  STATUS_META,
  TIMELINE_STEPS,
  canCancel,
  formatDate,
  isActive,
  shortId,
  statusMeta,
} from '../utils/orderStatus';

const POLL_INTERVAL_MS = 3000;

function Thumb({ src, alt, category }) {
  const [err, setErr] = useState(false);
  if (!src || err) return <span aria-hidden="true">{getProductIcon(category)}</span>;
  return <img src={src} alt={alt} onError={() => setErr(true)} />;
}

export default function OrderDetail({ orderId, onNavigate }) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState(null);

  const pollRef = useRef(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await fetchOrder(orderId);
      if (!mountedRef.current) return;
      setOrder(res?.data || null);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message || 'Ошибка');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Initial fetch
  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Live polling while the order is still active.
  useEffect(() => {
    if (!order) return;
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (isActive(order.status)) {
      pollRef.current = setInterval(load, POLL_INTERVAL_MS);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
      };
    }
  }, [order?.status, load]);

  const handleCancel = useCallback(() => {
    if (!order || !canCancel(order.status) || cancelling) return;
    hapticFeedback('medium');
    showConfirm(
      'Отменить заказ? Это действие нельзя отменить.',
      async (ok) => {
        if (!ok) return;
        setCancelling(true);
        try {
          const tg = getTelegramUser();
          const res = await cancelOrder(order._id, tg.id);
          if (!res?.success) throw new Error(res?.error || 'Ошибка');
          hapticNotification('success');
          setOrder(res.data);
        } catch (err) {
          hapticNotification('error');
          alert('Не удалось отменить: ' + err.message);
        } finally {
          if (mountedRef.current) setCancelling(false);
        }
      }
    );
  }, [order, cancelling]);

  const goBack = () => {
    hapticFeedback('light');
    onNavigate?.('orders');
  };

  if (loading) {
    return (
      <div className="page" id="page-order-detail">
        <DetailHeader onBack={goBack} title="Заказ" />
        <div className="loading-container" style={{ padding: 40 }}>
          <div className="spinner" />
          <span className="loading-text">Загружаем…</span>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="page" id="page-order-detail">
        <DetailHeader onBack={goBack} title="Заказ" />
        <div className="empty-generic">
          <div className="art" aria-hidden="true">🌾</div>
          <p>{error ? `Ошибка: ${error}` : 'Заказ не найден.'}</p>
        </div>
      </div>
    );
  }

  const meta = statusMeta(order.status);
  const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const deliveryFee = Math.max(0, order.totalAmount - subtotal);
  const paymentText = order.paymentMethod === 'card' ? 'Картой' : 'Наличными';
  const mapsLink = order.location
    ? `https://yandex.uz/maps/?pt=${order.location.lng},${order.location.lat}&z=17&l=map`
    : null;

  return (
    <div className="page" id="page-order-detail">
      <DetailHeader
        onBack={goBack}
        title={`Заказ #${shortId(order)}`}
      />

      {/* Status hero */}
      <section className={`order-status order-status-${meta.tone}`} role="status" aria-live="polite">
        <div className="order-status-art" aria-hidden="true">
          {order.status === 'pending' ? (
            <span className="order-status-spinner">{meta.glyph}</span>
          ) : (
            meta.glyph
          )}
        </div>
        <div className="order-status-kicker">{meta.short}</div>
        <h2 className="order-status-title">{meta.label}</h2>
        <p className="order-status-msg">{meta.desc}</p>
        {isActive(order.status) && (
          <div className="order-status-live">
            <span className="order-status-live-dot" />
            Живое обновление
          </div>
        )}
      </section>

      {/* Timeline */}
      {order.status !== 'cancelled' && (
        <Timeline status={order.status} />
      )}

      {/* Cancel button (only while pending) */}
      {canCancel(order.status) && (
        <button
          className="order-cancel-btn"
          onClick={handleCancel}
          disabled={cancelling}
          id="order-cancel-btn"
        >
          {cancelling ? 'Отменяем…' : 'Отменить заказ'}
        </button>
      )}

      {/* Items */}
      <div className="detail-block">
        <div className="detail-block-head">
          <span className="detail-block-eyebrow">📦 Товары · {itemCount}</span>
        </div>
        <div className="detail-items">
          {order.items.map((item, i) => {
            const populated = item.productId && typeof item.productId === 'object'
              ? item.productId
              : null;
            return (
              <div className="detail-item" key={i}>
                <div className="detail-item-thumb">
                  <Thumb
                    src={populated?.imageUrl}
                    alt={item.name}
                    category={populated?.category}
                  />
                </div>
                <div className="detail-item-info">
                  <div className="detail-item-name">{item.name}</div>
                  <div className="detail-item-meta">
                    <span>{formatPrice(item.price)} × {item.quantity}</span>
                    <span className="detail-item-total">
                      {formatPrice(item.price * item.quantity)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Delivery */}
      <div className="detail-block">
        <div className="detail-block-head">
          <span className="detail-block-eyebrow">📍 Адрес доставки</span>
        </div>
        <div className="detail-address">{order.location?.addressString || '—'}</div>
        {mapsLink && (
          <a
            className="detail-map-link"
            href={mapsLink}
            target="_blank"
            rel="noopener"
            id="order-map-link"
          >
            Открыть на карте →
          </a>
        )}
      </div>

      {/* Receipt */}
      <div className="detail-block">
        <div className="detail-block-head">
          <span className="detail-block-eyebrow">🧾 Детали</span>
        </div>
        <div className="detail-rows">
          <Row label="Получатель" value={order.customerName || '—'} />
          <Row label="Телефон" value={order.customerPhone || '—'} mono />
          <Row label="Оплата" value={paymentText} />
          <Row label="Дата заказа" value={formatDate(order.createdAt)} />
          {order.notes ? (
            <Row label="Комментарий" value={order.notes} wrap />
          ) : null}
        </div>
      </div>

      {/* Totals */}
      <div className="cart-summary">
        <div className="cart-summary-row">
          <span>Товары</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
        <div className="cart-summary-row">
          <span>Доставка</span>
          <span className={deliveryFee === 0 ? 'free' : ''}>
            {deliveryFee === 0 ? 'Бесплатно' : formatPrice(deliveryFee)}
          </span>
        </div>
        <div className="cart-summary-divider" />
        <div className="cart-summary-row total">
          <span>Итого</span>
          <span>{formatPrice(order.totalAmount)}</span>
        </div>
      </div>

      <div style={{ height: 28 }} />
    </div>
  );
}

function DetailHeader({ onBack, title }) {
  return (
    <div className="review-header">
      <button
        className="review-back"
        onClick={onBack}
        id="order-detail-back"
        aria-label="Назад"
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M12 4 6 10l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <h1 className="page-title" style={{ marginBottom: 0 }}>{title}</h1>
    </div>
  );
}

function Row({ label, value, mono, wrap }) {
  return (
    <div className="profile-data-row">
      <span className="profile-data-label">{label}</span>
      <span
        className={`profile-data-value ${mono ? 'mono' : ''}`}
        style={wrap ? { whiteSpace: 'normal', textAlign: 'right' } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

function Timeline({ status }) {
  const activeIdx = TIMELINE_STEPS.indexOf(status);
  return (
    <div className="order-timeline" aria-label="Прогресс заказа">
      {TIMELINE_STEPS.map((step, idx) => {
        const meta = STATUS_META[step];
        const reached = idx <= activeIdx;
        const isCurrent = idx === activeIdx;
        return (
          <React.Fragment key={step}>
            <div className={`timeline-step ${reached ? 'reached' : ''} ${isCurrent ? 'current' : ''}`}>
              <div className="timeline-dot" aria-hidden="true">
                {reached ? meta.glyph : idx + 1}
              </div>
              <div className="timeline-label">{meta.short}</div>
            </div>
            {idx < TIMELINE_STEPS.length - 1 && (
              <div className={`timeline-bar ${idx < activeIdx ? 'reached' : ''}`} aria-hidden="true" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
