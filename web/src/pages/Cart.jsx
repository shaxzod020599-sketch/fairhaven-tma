import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { validatePromo } from '../api.js';
import { formatPrice } from '../helpers.js';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { Cart as CartIcon, Bottle } from '../components/Icons.jsx';

const DELIVERY_FEE = 25000;

export default function Cart() {
  const { t, lang } = useI18n();
  const { items, subtotal, setQty, remove, count, appliedPromo, setAppliedPromo, clearPromo } = useCart();
  const { get } = useSettings();

  const [promoInput, setPromoInput] = useState('');
  const [promoMsg, setPromoMsg] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);

  const threshold = Number(get('free_delivery_threshold')) || 500000;
  const discount = appliedPromo?.discount || 0;
  const deliveryFee = subtotal === 0 || subtotal >= threshold ? 0 : DELIVERY_FEE;
  const total = Math.max(0, subtotal - discount + deliveryFee);
  const remaining = Math.max(0, threshold - subtotal);
  const progress = Math.min(100, (subtotal / threshold) * 100);

  const applyPromo = async () => {
    if (!promoInput.trim()) return;
    setPromoLoading(true);
    setPromoMsg('');
    try {
      const res = await validatePromo({ code: promoInput.trim(), subtotal });
      if (res?.valid) {
        setAppliedPromo(res.data);
        setPromoMsg('');
      } else {
        setAppliedPromo(null);
        setPromoMsg(res?.message || t('promoInvalid'));
      }
    } catch (_) {
      setAppliedPromo(null);
      setPromoMsg(t('promoInvalid'));
    } finally {
      setPromoLoading(false);
    }
  };

  if (count === 0) {
    return (
      <div className="container cart-empty-page">
        <Breadcrumbs trail={[{ label: t('goHome'), to: '/' }, { label: t('cartTitle') }]} />
        <div className="cart-empty-block">
          <div className="empty-art" aria-hidden="true"><CartIcon width={72} height={72} /></div>
          <h1 className="page-title">{t('cartEmpty')}</h1>
          <p className="cart-empty-desc">{t('cartEmptyDesc')}</p>
          <Link to="/shop" className="btn btn-primary btn-lg">{t('goToShop')}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="cart-page">
      <div className="container">
        <Breadcrumbs trail={[{ label: t('goHome'), to: '/' }, { label: t('cartTitle') }]} />
        <h1 className="page-title">{t('cartTitle')}</h1>

        {/* Free delivery progress */}
        <div className="delivery-progress">
          {remaining > 0 ? (
            <p>{t('freeDeliveryProgress')} <strong>{formatPrice(remaining)}</strong></p>
          ) : (
            <p>★ {t('freeDeliveryReached')}</p>
          )}
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="cart-layout">
          {/* Items */}
          <div className="cart-items-col">
            {items.map((item) => (
              <div className="cart-line-card" key={item._id}>
                <div className="cart-line-thumb">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={lang === 'uz' ? item.nameUz || item.name : item.name} />
                    ) : (
                      <span aria-hidden="true"><Bottle width={36} height={36} /></span>
                    )}
                </div>
                <div className="cart-line-body">
                  <Link to={`/product/${item._id}`} className="cart-line-name">
                    {lang === 'uz' ? item.nameUz || item.name : item.name}
                  </Link>
                  <div className="cart-line-unit">{formatPrice(item.price)}</div>
                  <div className="cart-line-bottom">
                    <div className="qty-stepper">
                      <button onClick={() => setQty(item._id, item.quantity - 1)} type="button" aria-label="−">−</button>
                      <span>{item.quantity}</span>
                      <button onClick={() => setQty(item._id, item.quantity + 1)} type="button" aria-label="+">+</button>
                    </div>
                    <div className="cart-line-total">{formatPrice(item.price * item.quantity)}</div>
                    <button className="cart-line-remove" onClick={() => remove(item._id)} type="button">
                      {t('remove')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <aside className="cart-summary">
            <h2 className="summary-title">{t('orderSummary')}</h2>

            <div className="promo-row">
              <input
                type="text"
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value)}
                placeholder={t('promoCode')}
              />
              <button className="btn btn-outline btn-sm" onClick={applyPromo} disabled={promoLoading} type="button">
                {promoLoading ? '…' : t('promoApply')}
              </button>
            </div>
            {promoMsg && <div className="promo-msg error" role="alert">{promoMsg}</div>}
            {appliedPromo && (
              <div className="promo-msg ok">
                ✓ {appliedPromo.code}: −{formatPrice(appliedPromo.discount)}
              </div>
            )}

            <div className="summary-rows">
              <div className="summary-row">
                <span>{t('subtotal')}</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="summary-row discount">
                  <span>{t('discount')}</span>
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

            <Link to="/checkout" className="btn btn-primary btn-lg btn-block">
              {t('checkout')}
            </Link>
            <Link to="/shop" className="summary-continue">{t('goToShop')} →</Link>
          </aside>
        </div>
      </div>
    </div>
  );
}
