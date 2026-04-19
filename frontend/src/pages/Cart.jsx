import React, { useState, useEffect, useCallback } from 'react';
import { formatPrice, getProductIcon } from '../utils/helpers';
import { showMainButton, hideMainButton, sendData, hapticFeedback, hapticNotification } from '../utils/telegram';
import { getTelegramUser } from '../utils/telegram';
import YandexMapCheckout from '../components/YandexMapCheckout';

export default function Cart({ cart, onUpdateQty, onRemove }) {
  const [showMap, setShowMap] = useState(false);
  const items = Object.values(cart);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // MainButton integration
  useEffect(() => {
    if (items.length > 0) {
      showMainButton(`Оформить — ${formatPrice(totalAmount)}`, handleCheckout);
    } else {
      hideMainButton();
    }
    return () => hideMainButton();
  }, [items.length, totalAmount]);

  const handleCheckout = useCallback(() => {
    if (items.length === 0) return;
    hapticFeedback('medium');
    setShowMap(true);
  }, [items]);

  const handleMapConfirm = useCallback((location) => {
    const user = getTelegramUser();

    const payload = {
      items: items.map((item) => ({
        productId: item._id,
        name: item.name,
        qty: item.quantity,
        price: item.price,
      })),
      total: totalAmount,
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
  }, [items, totalAmount]);

  const handleQtyChange = (item, delta) => {
    hapticFeedback('light');
    const newQty = item.quantity + delta;
    if (newQty <= 0) {
      onRemove(item._id);
    } else {
      onUpdateQty(item._id, newQty);
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
        <h1 className="page-title">Корзина</h1>
        <div className="cart-empty">
          <div className="empty-icon">🛒</div>
          <h3>Корзина пуста</h3>
          <p>Добавьте товары из каталога</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page" id="page-cart">
      <h1 className="page-title">Корзина</h1>

      {/* Cart Items */}
      {items.map((item) => (
        <div className="cart-item" key={item._id} id={`cart-item-${item._id}`}>
          <div className="cart-item-thumb">
            {item.imageUrl ? (
              <img src={item.imageUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} />
            ) : (
              getProductIcon(item.category)
            )}
          </div>

          <div className="cart-item-details">
            <div className="cart-item-name">{item.name}</div>
            <div className="cart-item-price">{formatPrice(item.price)}</div>
          </div>

          <div className="cart-qty-controls">
            <button
              className="cart-qty-btn minus"
              onClick={() => handleQtyChange(item, -1)}
              id={`qty-minus-${item._id}`}
            >
              −
            </button>
            <span className="cart-qty-value">{item.quantity}</span>
            <button
              className="cart-qty-btn plus"
              onClick={() => handleQtyChange(item, 1)}
              id={`qty-plus-${item._id}`}
            >
              +
            </button>
          </div>
        </div>
      ))}

      {/* Summary */}
      <div className="cart-summary">
        <div className="cart-summary-row">
          <span>Товаров</span>
          <span>{totalItems} шт.</span>
        </div>
        <div className="cart-summary-row">
          <span>Доставка</span>
          <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>Бесплатно</span>
        </div>
        <div className="cart-summary-row total">
          <span>Итого</span>
          <span>{formatPrice(totalAmount)}</span>
        </div>
      </div>

      {/* Fallback checkout button (for dev outside Telegram) */}
      <button
        className="checkout-btn"
        onClick={handleCheckout}
        id="checkout-btn"
      >
        📍 Выбрать адрес и оформить
      </button>
    </div>
  );
}
