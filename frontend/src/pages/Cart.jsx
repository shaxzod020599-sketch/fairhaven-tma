import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { formatPrice, getProductIcon } from '../utils/helpers';

function CartThumb({ src, alt, category }) {
  const [errored, setErrored] = useState(false);
  if (!src || errored) {
    return <span aria-hidden="true">{getProductIcon(category)}</span>;
  }
  return <img src={src} alt={alt} onError={() => setErrored(true)} />;
}

import {
  showMainButton,
  hideMainButton,
  hapticFeedback,
  hapticNotification,
  getTelegramUser,
} from '../utils/telegram';
import { createOrder } from '../utils/api';
import YandexMapCheckout from '../components/YandexMapCheckout';

const DELIVERY_THRESHOLD = 500000;
const DELIVERY_FEE = 25000;

/**
 * Steps
 *   'cart'    — items + promo + summary + "choose address"
 *   'map'     — Yandex map → pick address
 *   'review'  — editable phone, payment method, comment, final confirm
 *   'success' — waiting for channel approval
 */
export default function Cart({ cart, onUpdateQty, onRemove, onClear, onNavigate, dbUser }) {
  const [step, setStep] = useState('cart');
  const [address, setAddress] = useState(null);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null); // { orderId }
  const [promo, setPromo] = useState('');
  const [promoApplied, setPromoApplied] = useState(null);

  const items = Object.values(cart);

  // Pre-fill phone + name from the registered user whenever dbUser arrives.
  useEffect(() => {
    if (dbUser?.phone && !phone) setPhone(dbUser.phone);
    const full = [dbUser?.firstName, dbUser?.lastName].filter(Boolean).join(' ').trim();
    if (full && !name) setName(full);
  }, [dbUser]);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discount = promoApplied ? Math.round(subtotal * (promoApplied.pct / 100)) : 0;
  const isFreeDelivery = subtotal >= DELIVERY_THRESHOLD;
  const deliveryFee = isFreeDelivery || subtotal === 0 ? 0 : DELIVERY_FEE;
  const total = Math.max(0, subtotal - discount + deliveryFee);

  // Main button
  useEffect(() => {
    if (step === 'cart' && items.length > 0) {
      showMainButton(`Оформить — ${formatPrice(total)}`, goToMap);
    } else if (step === 'review') {
      showMainButton('Отправить заказ', handleSubmit);
    } else {
      hideMainButton();
    }
    return () => hideMainButton();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, total, items.length, phone, paymentMethod, address, comment]);

  const goToMap = useCallback(() => {
    if (items.length === 0) return;
    hapticFeedback('medium');
    setStep('map');
  }, [items.length]);

  const handleMapConfirm = useCallback((loc) => {
    setAddress(loc);
    setStep('review');
    hapticFeedback('light');
  }, []);

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

  const isPhoneValid = useMemo(() => {
    const digits = (phone || '').replace(/\D/g, '');
    return digits.length >= 9 && digits.length <= 15;
  }, [phone]);

  const canSubmit = items.length > 0 && !!address && isPhoneValid && !submitting;

  async function handleSubmit() {
    if (!canSubmit) {
      hapticNotification('error');
      return;
    }
    setSubmitting(true);
    hapticFeedback('medium');
    try {
      const tgUser = getTelegramUser();
      const payload = {
        telegramId: tgUser.id,
        items: items.map((i) => ({
          productId: i._id,
          name: i.name,
          price: i.price,
          quantity: i.quantity,
        })),
        totalAmount: total,
        location: {
          lat: address.lat,
          lng: address.lng,
          addressString: address.address || address.addressString || '',
        },
        customerName: name || [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' '),
        customerPhone: phone,
        paymentMethod,
        notes: comment,
      };
      const res = await createOrder(payload);
      if (!res?.success) throw new Error(res?.error || 'Ошибка заказа');
      hapticNotification('success');
      setSubmitted({ orderId: res.data._id.slice(-6).toUpperCase() });
      setStep('success');
      onClear?.();
    } catch (err) {
      console.error(err);
      hapticNotification('error');
      alert('Не удалось отправить заказ: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ─── MAP STEP ──────────────────────────────────────────────────────────────
  if (step === 'map') {
    return (
      <YandexMapCheckout
        onConfirm={handleMapConfirm}
        onClose={() => setStep('cart')}
      />
    );
  }

  // ─── SUCCESS STEP ──────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div className="page" id="page-cart">
        <div className="order-success" role="status">
          <div className="order-success-art" aria-hidden="true">✓</div>
          <h2>Заказ отправлен!</h2>
          <div className="order-success-id">
            <span>Номер заказа</span>
            <strong>#{submitted?.orderId}</strong>
          </div>
          <p>
            Мы передали заказ в FairHaven. Как только оператор подтвердит его,
            вы получите сообщение в Telegram — обычно это занимает до 15 минут
            в рабочее время.
          </p>
          <button
            className="checkout-btn"
            onClick={() => {
              setStep('cart');
              setSubmitted(null);
              setAddress(null);
              setComment('');
              setPromoApplied(null);
              setPromo('');
              onNavigate?.('home');
            }}
            id="order-success-done"
          >
            На главную
            <span className="arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    );
  }

  // ─── REVIEW STEP ───────────────────────────────────────────────────────────
  if (step === 'review') {
    return (
      <div className="page" id="page-cart">
        <div className="review-header">
          <button
            className="review-back"
            onClick={() => setStep('cart')}
            id="review-back"
            aria-label="Назад"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M12 4 6 10l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h1 className="page-title" style={{ marginBottom: 0 }}>Оформление</h1>
        </div>
        <p className="page-subtitle">Проверьте детали перед отправкой</p>

        {/* Delivery address */}
        <div className="review-block">
          <div className="review-block-head">
            <span className="review-block-eyebrow">📍 Адрес доставки</span>
            <button
              className="review-block-edit"
              onClick={() => setStep('map')}
              id="review-edit-address"
            >
              Изменить
            </button>
          </div>
          <div className="review-address-text">
            {address?.address || address?.addressString || '—'}
          </div>
        </div>

        {/* Contact */}
        <div className="review-block">
          <div className="review-block-head">
            <span className="review-block-eyebrow">👤 Получатель</span>
          </div>
          <label className="review-field">
            <span className="review-field-label">Имя</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Имя и фамилия"
              id="review-name"
            />
          </label>
          <label className="review-field">
            <span className="review-field-label">Телефон для связи</span>
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+998 __ ___ __ __"
              id="review-phone"
            />
            {!isPhoneValid && phone.length > 0 && (
              <span className="review-field-error">Введите корректный номер</span>
            )}
          </label>
        </div>

        {/* Payment */}
        <div className="review-block">
          <div className="review-block-head">
            <span className="review-block-eyebrow">💳 Способ оплаты</span>
          </div>
          <div className="payment-options">
            <button
              className={`payment-option ${paymentMethod === 'cash' ? 'active' : ''}`}
              onClick={() => { hapticFeedback('light'); setPaymentMethod('cash'); }}
              id="payment-cash"
              type="button"
            >
              <span className="payment-option-icon" aria-hidden="true">💵</span>
              <span className="payment-option-text">
                <span className="payment-option-title">Наличными</span>
                <span className="payment-option-desc">Курьеру при получении</span>
              </span>
              <span className={`payment-option-radio ${paymentMethod === 'cash' ? 'on' : ''}`} />
            </button>
            <button
              className={`payment-option ${paymentMethod === 'card' ? 'active' : ''}`}
              onClick={() => { hapticFeedback('light'); setPaymentMethod('card'); }}
              id="payment-card"
              type="button"
            >
              <span className="payment-option-icon" aria-hidden="true">💳</span>
              <span className="payment-option-text">
                <span className="payment-option-title">Картой</span>
                <span className="payment-option-desc">Uzcard · Humo · Visa</span>
              </span>
              <span className={`payment-option-radio ${paymentMethod === 'card' ? 'on' : ''}`} />
            </button>
          </div>
        </div>

        {/* Comment */}
        <div className="review-block">
          <div className="review-block-head">
            <span className="review-block-eyebrow">📝 Комментарий курьеру</span>
          </div>
          <textarea
            className="review-textarea"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Этаж, домофон, ориентир, удобное время…"
            rows={3}
            maxLength={500}
            id="review-comment"
          />
        </div>

        {/* Items summary */}
        <div className="review-block">
          <div className="review-block-head">
            <span className="review-block-eyebrow">
              📦 Товары · {totalItems}
            </span>
          </div>
          <div className="review-items">
            {items.map((item) => (
              <div key={item._id} className="review-item">
                <span className="review-item-name">
                  {item.name} <span className="review-item-qty">× {item.quantity}</span>
                </span>
                <span className="review-item-price">
                  {formatPrice(item.price * item.quantity)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div className="cart-summary">
          <div className="cart-summary-row">
            <span>Подытог</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="cart-summary-row">
              <span>Скидка ({promoApplied.code})</span>
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

        <button
          className="checkout-btn"
          onClick={handleSubmit}
          disabled={!canSubmit}
          id="review-submit"
        >
          {submitting ? 'Отправляем…' : 'Подтвердить заказ'}
          <span className="arrow" aria-hidden="true">→</span>
        </button>

        <div style={{ height: 20 }} />
      </div>
    );
  }

  // ─── CART STEP (empty) ─────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className="page" id="page-cart">
        <div className="cart-header">
          <h1 className="page-title">Корзина</h1>
        </div>
        <div className="cart-empty">
          <div className="empty-art" aria-hidden="true">🧺</div>
          <h3>Пока пусто</h3>
          <p>Выберите продукты из каталога FairHaven — доставим в течение 2 часов по Ташкенту.</p>
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

  // ─── CART STEP (populated) ─────────────────────────────────────────────────
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
              <CartThumb src={item.imageUrl} alt={item.name} category={item.category} />
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

      {/* Promo */}
      <div className="promo-input-row">
        <input
          type="text"
          placeholder="Промокод"
          value={promo}
          onChange={(e) => setPromo(e.target.value)}
          id="promo-input"
        />
        <button onClick={applyPromo} id="promo-apply">
          Применить
        </button>
      </div>
      {promoApplied && promoApplied.pct > 0 && (
        <div style={{ fontSize: '0.76rem', color: 'var(--sage)', fontWeight: 600, marginTop: 6, paddingLeft: 16 }}>
          ✓ Промокод {promoApplied.code} · скидка {promoApplied.pct}%
        </div>
      )}
      {promoApplied && promoApplied.pct === 0 && (
        <div style={{ fontSize: '0.76rem', color: 'var(--ruby)', fontWeight: 500, marginTop: 6, paddingLeft: 16 }}>
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

      <button className="checkout-btn" onClick={goToMap} id="checkout-btn">
        Выбрать адрес и оформить
        <span className="arrow" aria-hidden="true">→</span>
      </button>
    </div>
  );
}
