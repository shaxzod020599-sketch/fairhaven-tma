import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { createOrder } from '../api.js';
import { formatPrice } from '../helpers.js';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { Cart as CartIcon, Bottle } from '../components/Icons.jsx';

const DELIVERY_FEE = 25000;

export default function Checkout() {
  const { t, lang } = useI18n();
  const { items, subtotal, clear, appliedPromo } = useCart();
  const { get } = useSettings();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    city: get('delivery_city') || 'Ташкент',
    address: '',
    payment: 'cash',
    comment: '',
  });

  // Logged-in Telegram users get their profile prefilled (only into
  // fields they haven't typed in yet).
  useEffect(() => {
    if (!user) return;
    setForm((f) => ({
      ...f,
      name: f.name || [user.firstName, user.lastName].filter(Boolean).join(' '),
      phone: f.phone || user.phone || '',
    }));
  }, [user]);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  const threshold = Number(get('free_delivery_threshold')) || 500000;
  const deliveryFee = subtotal >= threshold ? 0 : DELIVERY_FEE;
  const discount = appliedPromo?.discount || 0;
  const total = Math.max(0, subtotal - discount + deliveryFee);

  const set = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setErrors((er) => ({ ...er, [field]: '' }));
  };

  const validate = () => {
    const er = {};
    if (!form.name.trim()) er.name = t('requiredField');
    if (!form.phone.trim()) er.phone = t('requiredField');
    if (!form.address.trim()) er.address = t('requiredField');
    setErrors(er);
    return Object.keys(er).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    setServerError('');
    if (!validate()) return;

    // Server resolves names and prices from the DB — send ids + quantities only.
    const payload = {
      items: items.map((i) => ({
        productId: i._id,
        quantity: i.quantity,
      })),
      customerName: form.name.trim(),
      customerPhone: form.phone.trim(),
      email: form.email.trim(),
      paymentMethod: form.payment,
      notes: form.comment.trim(),
      promoCode: appliedPromo?.code || '',
      location: {
        // Lat/lng optional for guest (street address delivery); backend allows nulls in guest path
        lat: 0,
        lng: 0,
        addressString: `${form.city}, ${form.address}`,
      },
    };

    setSubmitting(true);
    try {
      const res = await createOrder(payload);
      // One-time capability token — lets the success page read this order.
      if (res.data?.accessToken) {
        sessionStorage.setItem(`order_t_${res.data._id}`, res.data.accessToken);
      }
      clear();
      navigate(`/order/${res.data._id}`);
    } catch (err) {
      // Translate common backend errors into friendly messages.
      const code = err?.payload?.error || '';
      let msg = err.message || 'Order failed';
      if (code === 'guest_fields_required') {
        msg = t('requiredField');
      } else if (/ObjectId|Cast/i.test(msg)) {
        msg = lang === 'uz'
          ? 'Savatdagi baʼzi mahsulotlar mavjud emas. Sahifani yangilang.'
          : 'Некоторые товары в корзине недоступны. Обновите страницу.';
      }
      setServerError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="container checkout-empty">
        <Breadcrumbs trail={[{ label: t('goHome'), to: '/' }, { label: t('checkoutTitle') }]} />
        <div className="cart-empty-block">
          <div className="empty-art" aria-hidden="true"><CartIcon width={72} height={72} /></div>
          <h1 className="page-title">{t('cartEmpty')}</h1>
          <Link to="/shop" className="btn btn-primary btn-lg">{t('goToShop')}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="checkout-page">
      <div className="container">
        <Breadcrumbs
          trail={[
            { label: t('goHome'), to: '/' },
            { label: t('cartTitle'), to: '/cart' },
            { label: t('checkoutTitle') },
          ]}
        />
        <h1 className="page-title">{t('checkoutTitle')}</h1>

        <form className="checkout-layout" onSubmit={submit}>
          {/* Form fields */}
          <div className="checkout-form-col">
          <fieldset className="checkout-fieldset">
            <legend>{t('contactInfo')}</legend>
            <div className="form-row">
              <label className="form-field">
                <span>{t('fullName')} *</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={set('name')}
                  className={errors.name ? 'error' : ''}
                  autoComplete="name"
                />
                {errors.name && <small className="form-err">{errors.name}</small>}
              </label>
              <label className="form-field">
                <span>{t('phone')} *</span>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={set('phone')}
                  className={errors.phone ? 'error' : ''}
                  placeholder="+998 90 123 45 67"
                  autoComplete="tel"
                />
                {errors.phone && <small className="form-err">{errors.phone}</small>}
              </label>
            </div>
            <label className="form-field">
              <span>{t('email')}</span>
              <input
                type="email"
                value={form.email}
                onChange={set('email')}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </label>
          </fieldset>

          <fieldset className="checkout-fieldset">
            <legend>{t('deliveryAddress')}</legend>
            <div className="form-row">
              <label className="form-field">
                <span>{t('city')}</span>
                <input type="text" value={form.city} onChange={set('city')} />
              </label>
              <label className="form-field">
                <span>{t('address')} *</span>
                <input
                  type="text"
                  value={form.address}
                  onChange={set('address')}
                  className={errors.address ? 'error' : ''}
                  autoComplete="street-address"
                />
                {errors.address && <small className="form-err">{errors.address}</small>}
              </label>
            </div>
            <label className="form-field">
              <span>{t('comment')}</span>
              <textarea
                value={form.comment}
                onChange={set('comment')}
                placeholder={t('commentPlaceholder')}
                rows={3}
              />
            </label>
          </fieldset>

          <fieldset className="checkout-fieldset">
            <legend>{t('paymentMethod')}</legend>
            <div className="pay-options">
              <label className={`pay-option ${form.payment === 'cash' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="payment"
                  value="cash"
                  checked={form.payment === 'cash'}
                  onChange={set('payment')}
                />
                <span className="pay-option-body">
                  <strong>{t('payCash')}</strong>
                </span>
              </label>
              <label className={`pay-option ${form.payment === 'card' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="payment"
                  value="card"
                  checked={form.payment === 'card'}
                  onChange={set('payment')}
                />
                <span className="pay-option-body">
                  <strong>{t('payCard')}</strong>
                </span>
              </label>
            </div>
          </fieldset>

          {serverError && <div className="form-server-err" role="alert">{serverError}</div>}
          </div>

          {/* Order summary */}
          <aside className="checkout-summary">
            <h2 className="summary-title">{t('orderSummary')}</h2>
            <div className="checkout-items">
              {items.map((i) => (
                <div className="checkout-item" key={i._id}>
                  <div className="checkout-item-thumb">
                    {i.imageUrl ? <img src={i.imageUrl} alt={lang === 'uz' ? i.nameUz || i.name : i.name} /> : <span aria-hidden="true"><Bottle width={28} height={28} /></span>}
                  </div>
                  <div className="checkout-item-body">
                    <div className="checkout-item-name">{i.name}</div>
                    <div className="checkout-item-meta">{i.quantity} × {formatPrice(i.price)}</div>
                  </div>
                  <div className="checkout-item-total">{formatPrice(i.price * i.quantity)}</div>
                </div>
              ))}
            </div>
            <div className="summary-rows">
              <div className="summary-row">
                <span>{t('subtotal')}</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="summary-row discount">
                  <span>{t('discount')} ({appliedPromo?.code})</span>
                  <span>−{formatPrice(discount)}</span>
                </div>
              )}
              <div className="summary-row">
                <span>{t('delivery')}</span>
                <span>{deliveryFee === 0 ? t('free') : formatPrice(deliveryFee)}</span>
              </div>
            </div>
            <div className="summary-total">
              <span>{t('total')}</span>
              <strong>{formatPrice(total)}</strong>
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-lg btn-block"
              disabled={submitting}
            >
              {submitting ? '…' : t('placeOrder')}
            </button>
          </aside>
        </form>
      </div>
    </div>
  );
}
