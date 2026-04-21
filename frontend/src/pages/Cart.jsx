import React, { useState, useEffect, useCallback } from 'react';
import { formatPrice, getProductIcon } from '../utils/helpers';
import {
  showMainButton,
  hideMainButton,
  sendData,
  hapticFeedback,
  hapticNotification,
  getTelegramUser,
} from '../utils/telegram';
import YandexMapCheckout from '../components/YandexMapCheckout';

const DELIVERY_THRESHOLD = 200000;

export default function Cart({ cart, onUpdateQty, onRemove, onNavigate }) {
  const [showMap, setShowMap] = useState(false);
  const [promo, setPromo] = useState('');
  const [promoApplied, setPromoApplied] = useState(null); // { code, pct }
  const items = Object.values(cart);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discount = promoApplied ? Math.round(subtotal * (promoApplied.pct / 100)) : 0;
  const isFreeDelivery = subtotal >= DELIVERY_THRESHOLD;
  const deliveryFee = isFreeDelivery || subtotal === 0 ? 0 : 15000;
  const total = Math.max(0, subtotal - discount + deliveryFee);

  useEffect(() => {
    if (items.length > 0) {
      showMainButton(`Оформить — ${formatPrice(total)}`, handleCheckout);
    } else {
      hideMainButton();
    }
    return () => hideMainButton();
  }, [items.length, total]);

  const handleCheckout = useCallback(() => {
    if (items.length === 0) return;
    hapticFeedback('medium');
    setShowMap(true);
  }, [items]);

  const handleMapConfirm = useCallback(
    (location) => {
      const user = getTelegramUser();
      const payload = {
        items: items.map((item) => ({
          productId: item._id,
          name: item.name,
          qty: item.quantity,
          price: item.price,
        })),
        subtotal,
        discount,
        delivery: deliveryFee,
        total,
        promo: promoApplied?.code || null,
        location: {
          lat: location.lat,
          lng: location.lng,
          address: location.address,
        },
        user: {
          telegramId: user.id,
          name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
          phone: '',
        },
      };

      hapticNotification('success');
      sendData(payload);
      setShowMap(false);
    },
    [items, subtotal, discount, deliveryFee, total, promoApplied]
  );

  const handleQtyChange = (item, delta) => {
    hapticFeedback('light');
    const newQty = item.quantity + delta;
    if (newQty <= 0) onRemove(item._id);
    else onUpdateQty(item._id, newQty);
  };

  const applyPromo = () => {
    const code = promo.trim().toUpperCase();
    if (!code) return;
    hapticFeedback('medium');
    if (code === 'FAIR10') {
      setPromoApplied({ code, pct: 10 });
      hapticNotification('success');
    } else {
      hapticNotification('error');
      setPromoApplied({ code: 'invalid', pct: 0 });
      setTimeout(() => setPromoApplied(null), 1800);
    }
  };

  if (showMap) {
    return (
      <YandexMapCheckout
        onConfirm={handleMapConfirm}
        onClose={() => setShowMap(false)}
      />
    );
  }

  if (items.length === 0) {
    return (
      <div className="page" id="page-cart">
        <div className="cart-header">
          <h1 className="page-title">Корзина</h1>
        </div>
        <div className="cart-empty">
          <div className="empty-art" aria-hidden="true">🧺</div>
          <h3>Пока пусто</h3>
          <p>Выберите витамины и добавки из нашей коллекции — мы доставим в течение 2 часов.</p>
          <button
            className="ghost-btn"
            id="cart-empty-cta"
            onClick={() => onNavigate?.('catalog')}
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

  const toFree = Math.max(0, DELIVERY_THRESHOLD - subtotal);

  return (
    <div className="page" id="page-cart">
      <div className="cart-header">
        <h1 className="page-title">Корзина</h1>
        <span className="cart-count-badge">
          {totalItems} {totalItems === 1 ? 'товар' : 'товаров'}
        </span>
      </div>

      {/* Delivery progress */}
      {!isFreeDelivery && (
        <div
          style={{
            padding: '12px 14px',
            background: 'var(--butter)',
            border: '1px solid var(--clay)',
            borderRadius: 'var(--r-md)',
            marginBottom: 14,
            fontSize: '0.78rem',
            color: 'var(--ink)',
            lineHeight: 1.4,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span>
              До бесплатной доставки: <strong>{formatPrice(toFree)}</strong>
            </span>
            <span aria-hidden="true">🚚</span>
          </div>
          <div
            style={{
              height: 4,
              background: 'rgba(14, 43, 31, 0.1)',
              borderRadius: 'var(--r-pill)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.min(100, (subtotal / DELIVERY_THRESHOLD) * 100)}%`,
                height: '100%',
                background: 'var(--ink)',
                borderRadius: 'var(--r-pill)',
                transition: 'width 400ms var(--ease-out)',
              }}
            />
          </div>
        </div>
      )}

      {/* Items */}
      <div className="cart-items">
        {items.map((item) => (
          <div className="cart-item" key={item._id} id={`cart-item-${item._id}`}>
            <div className="cart-item-thumb">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.name} />
              ) : (
                <span aria-hidden="true">{getProductIcon(item.category)}</span>
              )}
            </div>

            <div className="cart-item-details">
              {item.brand && <div className="cart-item-brand">{item.brand}</div>}
              <div className="cart-item-name">{item.name}</div>
              <div className="cart-item-price">{formatPrice(item.price * item.quantity)}</div>
            </div>

            <div className="cart-qty" aria-label="Количество">
              <button
                className="cart-qty-btn"
                onClick={() => handleQtyChange(item, -1)}
                id={`qty-minus-${item._id}`}
                aria-label="Уменьшить"
              >
                −
              </button>
              <span className="cart-qty-value">{item.quantity}</span>
              <button
                className="cart-qty-btn"
                onClick={() => handleQtyChange(item, 1)}
                id={`qty-plus-${item._id}`}
                aria-label="Увеличить"
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Promo code */}
      <div className="promo-input-row">
        <input
          type="text"
          placeholder="Промокод (попробуйте FAIR10)"
          value={promo}
          onChange={(e) => setPromo(e.target.value)}
          id="promo-input"
        />
        <button onClick={applyPromo} id="promo-apply">
          Применить
        </button>
      </div>
      {promoApplied && promoApplied.pct > 0 && (
        <div
          style={{
            fontSize: '0.76rem',
            color: 'var(--sage)',
            fontWeight: 600,
            marginTop: 6,
            paddingLeft: 16,
          }}
        >
          ✓ Промокод {promoApplied.code} · скидка {promoApplied.pct}%
        </div>
      )}
      {promoApplied && promoApplied.pct === 0 && (
        <div
          style={{
            fontSize: '0.76rem',
            color: 'var(--ruby)',
            fontWeight: 500,
            marginTop: 6,
            paddingLeft: 16,
          }}
        >
          Промокод не найден
        </div>
      )}

      {/* Summary */}
      <div className="cart-summary">
        <div className="cart-summary-row">
          <span>Подытог</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
        {discount > 0 && (
          <div className="cart-summary-row">
            <span>Скидка</span>
            <span style={{ color: 'var(--terracotta)', fontWeight: 600 }}>
              −{formatPrice(discount)}
            </span>
          </div>
        )}
        <div className="cart-summary-row">
          <span>Доставка</span>
          <span className={isFreeDelivery ? 'free' : ''}>
            {deliveryFee === 0 ? 'Бесплатно' : formatPrice(deliveryFee)}
          </span>
        </div>
        <div className="cart-summary-divider" />
        <div className="cart-summary-row total">
          <span>Итого</span>
          <span>{formatPrice(total)}</span>
        </div>
      </div>

      {/* Main checkout button (also serves as fallback outside Telegram) */}
      <button className="checkout-btn" onClick={handleCheckout} id="checkout-btn">
        Выбрать адрес и оформить
        <span className="arrow" aria-hidden="true">→</span>
      </button>
    </div>
  );
}
