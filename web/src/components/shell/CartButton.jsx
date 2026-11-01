import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { useCart } from '../../context/CartContext.jsx';
import { Bag } from '../Icons.jsx';

/**
 * Header cart button. data-cart-target / data-cart-badge are the landing point and the badge that
 * FlyToCart pops when a product lands; this component never animates the badge itself, so it pops once.
 */
export default function CartButton({ onOpen }) {
  const { t, tf, plural } = useI18n();
  const { count } = useCart();
  const label = count > 0 ? tf('shell.cartWithCount', { n: count, unit: plural(count, t('unitProducts')) }) : t('cart');
  return (
    <button type="button" className="sh-cart" onClick={onOpen} aria-label={label} title={t('cart')} data-cart-target>
      <Bag size={22} />
      <span className={`sh-cart-badge t-num${count > 0 ? '' : ' is-empty'}`} data-cart-badge aria-hidden="true">
        {count > 99 ? '99+' : count}
      </span>
    </button>
  );
}
