import React, { useCallback, useEffect, useState } from 'react';
import { fetchOrdersByUser } from '../utils/api';
import { getTelegramUser, hapticFeedback } from '../utils/telegram';
import { formatPrice } from '../utils/helpers';
import { statusMeta, shortId, formatDate, isActive } from '../utils/orderStatus';

const POLL_INTERVAL_MS = 10_000;

export default function Orders({ onNavigate, onOpenOrder }) {
  const [orders, setOrders] = useState(null); // null = loading
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const tg = getTelegramUser();
      if (!tg?.id) return;
      const res = await fetchOrdersByUser(tg.id);
      setOrders(res?.data || []);
      setError(null);
    } catch (err) {
      setError(err.message);
      setOrders([]);
    }
  }, []);

  useEffect(() => {
    load();
    // Light polling — any active order might progress while the user sits here.
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  const open = (orderId) => {
    hapticFeedback('light');
    onOpenOrder?.(orderId);
  };

  if (orders === null) {
    return (
      <div className="page" id="page-orders">
        <h1 className="page-title">Мои заказы</h1>
        <p className="page-subtitle">Загружаем историю…</p>
        <div className="orders-skeleton">
          {[0, 1, 2].map((i) => (
            <div key={i} className="orders-skeleton-card">
              <div className="skeleton-line short" />
              <div className="skeleton-line long" />
              <div className="skeleton-line mid" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="page" id="page-orders">
        <h1 className="page-title">Мои заказы</h1>
        <p className="page-subtitle">История пока пуста</p>
        <div className="orders-empty">
          <div className="empty-art" aria-hidden="true">📦</div>
          <h3>Пока нет заказов</h3>
          <p>
            Первый заказ появится здесь сразу после оформления.
            Статус и детали будут обновляться автоматически.
          </p>
          <button
            className="ghost-btn"
            onClick={() => { hapticFeedback('medium'); onNavigate?.('catalog'); }}
            id="orders-empty-cta"
          >
            Открыть каталог
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M5 10h10M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  const active = orders.filter((o) => isActive(o.status));
  const archive = orders.filter((o) => !isActive(o.status));

  return (
    <div className="page" id="page-orders">
      <h1 className="page-title">Мои заказы</h1>
      <p className="page-subtitle">
        Всего: {orders.length} · активных: {active.length}
      </p>

      {active.length > 0 && (
        <>
          <div className="orders-group-label">Активные</div>
          <div className="orders-list">
            {active.map((o) => (
              <OrderCard key={o._id} order={o} onClick={() => open(o._id)} highlight />
            ))}
          </div>
        </>
      )}

      {archive.length > 0 && (
        <>
          <div className="orders-group-label">История</div>
          <div className="orders-list">
            {archive.map((o) => (
              <OrderCard key={o._id} order={o} onClick={() => open(o._id)} />
            ))}
          </div>
        </>
      )}

      {error && (
        <div className="orders-error">
          Не удалось обновить историю. Проверьте подключение.
        </div>
      )}
    </div>
  );
}

function OrderCard({ order, onClick, highlight }) {
  const meta = statusMeta(order.status);
  const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);
  const firstItems = order.items.slice(0, 2).map((i) => i.name).join(', ');
  const extraCount = order.items.length - 2;

  return (
    <button
      className={`order-card ${highlight ? 'highlight' : ''}`}
      onClick={onClick}
      id={`order-card-${order._id}`}
      type="button"
    >
      <div className="order-card-head">
        <span className="order-card-id">#{shortId(order)}</span>
        <span className={`order-card-status ${meta.tone}`}>
          <span className="order-card-status-glyph" aria-hidden="true">{meta.glyph}</span>
          {meta.label}
        </span>
      </div>
      <div className="order-card-items">
        {firstItems}{extraCount > 0 ? ` · ещё ${extraCount}` : ''}
      </div>
      <div className="order-card-meta">
        <span>{formatDate(order.createdAt)}</span>
        <span className="order-card-dot" aria-hidden="true">·</span>
        <span>{itemCount} {itemCount === 1 ? 'товар' : 'товаров'}</span>
        <span className="order-card-total">{formatPrice(order.totalAmount)}</span>
      </div>
    </button>
  );
}
