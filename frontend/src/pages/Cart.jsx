import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { formatPrice, getProductIcon } from '../utils/helpers';
import {
  showMainButton,
  hideMainButton,
  hapticFeedback,
  hapticNotification,
  getTelegramUser,
} from '../utils/telegram';
import { createOrder, validatePromo } from '../utils/api';
import YandexMapCheckout from '../components/YandexMapCheckout';
import SmartImage from '../components/SmartImage';
import { primaryImage } from '../utils/productImages';

const DELIVERY_THRESHOLD = 500000;
const DELIVERY_FEE = 25000;

function CartThumb({ item }) {
  const src = primaryImage(item) || item.imageUrl;
  return <SmartImage src={src} alt={item.name} fallback={getProductIcon(item.category)} />;
}

/**
 * Steps
 *   'cart'   — items + promo + summary + "choose address"
 *   'map'    — Yandex map → pick address
 *   'review' — editable phone, payment method, comment, final confirm
 *
 * After a successful submit, we navigate the app to the orderDetail page
 * so the state survives reloads (backend is the source of truth).
 */
export default function Cart({ cart, onUpdateQty, onRemove, onClear, onNavigate, onOrderSubmitted, dbUser }) {
  const [step, setStep] = useState('cart');
  const [address, setAddress] = useState(null);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [promo, setPromo] = useState('');
  const [promoApplied, setPromoApplied] = useState(null);

  // Ref guard against rapid double-tap.
  const submittingRef = useRef(false);

  const items = Object.values(cart);

  useEffect(() => {
    if (dbUser?.phone && !phone) setPhone(dbUser.phone);
    const full = [dbUser?.firstName, dbUser?.lastName].filter(Boolean).join(' ').trim();
    if (full && !name) setName(full);
  }, [dbUser]);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discount = promoApplied?.discount || 0;
  const isFreeDelivery = subtotal >= DELIVERY_THRESHOLD;
  const deliveryFee = isFreeDelivery || subtotal === 0 ? 0 : DELIVERY_FEE;
  const total = Math.max(0, subtotal - discount + deliveryFee);

  useEffect(() => {
    if (promoApplied?.code && promoApplied.code !== 'invalid') {
      revalidatePromo(promoApplied.code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal]);

  const goToMap = useCallback(() => {
    if (items.length === 0) return;
    hapticFeedback('medium');
    setStep('map');
  }, [items.length]);

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

  const revalidatePromo = useCallback(async (code) => {
    try {
      const tg = getTelegramUser();
      const res = await validatePromo({ code, subtotal, telegramId: tg?.id });
      if (res?.valid && res.data) {
        setPromoApplied({
          code: res.data.code,
          discount: res.data.discount,
          discountType: res.data.discountType,
          discountValue: res.data.discountValue,
          description: res.data.description || '',
        });
      } else {
        setPromoApplied({ code: 'invalid', discount: 0, message: res?.message || 'Промокод не найден' });
      }
    } catch (err) {
      setPromoApplied({ code: 'invalid', discount: 0, message: 'Не удалось проверить промокод' });
    }
  }, [subtotal]);

  const applyPromo = async () => {
    const code = promo.trim().toUpperCase();
    if (!code) return;
    hapticFeedback('medium');
    try {
      const tg = getTelegramUser();
      const res = await validatePromo({ code, subtotal, telegramId: tg?.id });
      if (res?.valid && res.data) {
        setPromoApplied({
          code: res.data.code,
          discount: res.data.discount,
          discountType: res.data.discountType,
          discountValue: res.data.discountValue,
          description: res.data.description || '',
        });
        hapticNotification('success');
      } else {
        hapticNotification('error');
        setPromoApplied({ code: 'invalid', discount: 0, message: res?.message || 'Промокод не найден' });
        setTimeout(() => setPromoApplied(null), 2400);
      }
    } catch (err) {
      hapticNotification('error');
      setPromoApplied({ code: 'invalid', discount: 0, message: 'Не удалось проверить промокод' });
      setTimeout(() => setPromoApplied(null), 2400);
    }
  };

  const isPhoneValid = useMemo(() => {
    const digits = (phone || '').replace(/\D/g, '');
    return digits.length >= 9 && digits.length <= 15;
  }, [phone]);

  const canSubmit =
    items.length > 0 && !!address && isPhoneValid && !submitting;

  async function handleSubmit() {
    if (submittingRef.current) return;
    if (!canSubmit) {
      hapticNotification('error');
      return;
    }
    submittingRef.current = true;
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
        promoCode: promoApplied?.code && promoApplied.code !== 'invalid'
          ? promoApplied.code
          : '',
        location: {
          lat: address.lat,
          lng: address.lng,
          addressString: address.address || address.addressString || '',
        },
        customerName:
          name ||
          [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' '),
        customerPhone: phone,
        paymentMethod,
        notes: comment,
      };
      const res = await createOrder(payload);
      if (!res?.success) throw new Error(res?.error || 'Ошибка заказа');
      hapticNotification('success');
      // Hand off to App → navigates to OrderDetail (survives reload).
      onClear?.();
      setAddress(null);
      setComment('');
      setPromoApplied(null);
      setPromo('');
      setStep('cart');
      onOrderSubmitted?.(res.data._id);
    } catch (err) {
      console.error(err);
      hapticNotification('error');
      alert('Не удалось отправить заказ: ' + err.message);
    } finally {
      submittingRef.current = false;
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

        <div className="cart-summary">
          <div className="cart-summary-row">
            <span>Подытог</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          {discount > 0 && (
            <>
              <div className="cart-summary-row was-row">
                <span>Без скидки</span>
                <span>{formatPrice(subtotal + deliveryFee)}</span>
              </div>
              <div className="cart-summary-row discount-row">
                <span>Скидка<span className="promo-tag">{promoApplied.code}</span></span>
                <span>−{formatPrice(discount)}</span>
              </div>
            </>
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
          <p>Выберите продукты из каталога FairHaven Health — доставим по всему Узбекистану.</p>
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

      <div className="cart-items">
        {items.map((item) => (
          <div className="cart-item" key={item._id} id={`cart-item-${item._id}`}>
            <div className="cart-item-thumb">
              <CartThumb item={item} />
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
      {promoApplied && promoApplied.discount > 0 && (
        <div style={{ fontSize: '0.76rem', color: 'var(--sage)', fontWeight: 600, marginTop: 6, paddingLeft: 16 }}>
          ✓ {promoApplied.code} · −{formatPrice(promoApplied.discount)}
          {promoApplied.description ? ` · ${promoApplied.description}` : ''}
        </div>
      )}
      {promoApplied && promoApplied.code === 'invalid' && (
        <div style={{ fontSize: '0.76rem', color: 'var(--ruby)', fontWeight: 500, marginTop: 6, paddingLeft: 16 }}>
          {promoApplied.message || 'Промокод не найден'}
        </div>
      )}

      <div className="cart-summary">
        <div className="cart-summary-row">
          <span>Подытог</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
        {discount > 0 && (
          <>
            <div className="cart-summary-row was-row">
              <span>Без скидки</span>
              <span>{formatPrice(subtotal + deliveryFee)}</span>
            </div>
            <div className="cart-summary-row discount-row">
              <span>Скидка<span className="promo-tag">{promoApplied.code}</span></span>
              <span>−{formatPrice(discount)}</span>
            </div>
          </>
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
