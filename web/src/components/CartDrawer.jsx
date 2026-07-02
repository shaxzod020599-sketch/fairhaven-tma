import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { useCart } from '../context/CartContext.jsx';
import { formatPrice } from '../helpers.js';
import { Cart as CartIcon, Bottle } from './Icons.jsx';

export default function CartDrawer({ open, onClose }) {
  const { t, lang } = useI18n();
  const { items, subtotal, setQty, remove } = useCart();

  // Lock body scroll + Esc-to-close when drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <>
      <div className={`cart-overlay ${open ? 'open' : ''}`} onClick={onClose} aria-hidden={!open} />
      <aside
        className={`cart-drawer ${open ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={t('cart')}
        aria-hidden={!open}
      >
        <div className="cart-drawer-head">
          <h2 className="cart-drawer-title">{t('cart')} ({items.length})</h2>
          <button className="cart-drawer-close" onClick={onClose} aria-label={t('close')} type="button">×</button>
        </div>

        {items.length === 0 ? (
          <div className="cart-drawer-empty">
            <div className="cart-empty-art" aria-hidden="true"><CartIcon width={64} height={64} /></div>
            <p>{t('cartEmpty')}</p>
            <Link to="/shop" className="btn btn-primary" onClick={onClose}>{t('goToShop')}</Link>
          </div>
        ) : (
          <>
            <div className="cart-drawer-items">
              {items.map((item) => (
                <div className="cart-line" key={item._id}>
                  <div className="cart-line-thumb">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={lang === 'uz' ? item.nameUz || item.name : item.name} />
                    ) : (
                      <span aria-hidden="true"><Bottle width={32} height={32} /></span>
                    )}
                  </div>
                  <div className="cart-line-body">
                    <div className="cart-line-name">
                      {lang === 'uz' ? item.nameUz || item.name : item.name}
                    </div>
                    <div className="cart-line-price">{formatPrice(item.price)}</div>
                    <div className="cart-line-controls">
                      <div className="qty-stepper">
                        <button onClick={() => setQty(item._id, item.quantity - 1)} type="button" aria-label="−">−</button>
                        <span>{item.quantity}</span>
                        <button onClick={() => setQty(item._id, item.quantity + 1)} type="button" aria-label="+">+</button>
                      </div>
                      <button className="cart-line-remove" onClick={() => remove(item._id)} type="button">
                        {t('remove')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="cart-drawer-foot">
              <div className="cart-drawer-subtotal">
                <span>{t('subtotal')}</span>
                <strong>{formatPrice(subtotal)}</strong>
              </div>
              <Link to="/checkout" className="btn btn-primary btn-block" onClick={onClose}>
                {t('checkout')}
              </Link>
              <Link to="/cart" className="cart-drawer-view" onClick={onClose}>
                {t('cartTitle')} →
              </Link>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
