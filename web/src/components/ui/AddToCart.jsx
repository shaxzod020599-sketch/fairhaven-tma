import React, { createContext, useCallback, useContext } from 'react';
import { useCart } from '../../context/CartContext.jsx';
import { useI18n } from '../../i18n/index.jsx';
import { useFlyToCart } from '../../motion/FlyToCart.jsx';
import { useToast } from './Toast.jsx';

const OpenCartContext = createContext(null);

/** Lets anything below open the cart drawer (App passes its own opener). */
export function OpenCartProvider({ onOpen, children }) {
  return <OpenCartContext.Provider value={onOpen}>{children}</OpenCartContext.Provider>;
}

/** () => void that opens the cart drawer, or null outside OpenCartProvider. */
export const useOpenCart = () => useContext(OpenCartContext);

/**
 * The one add-to-cart action: adds, flies the image to the header cart, and shows the
 * «Добавлено в корзину» toast with «Открыть». The drawer never opens by itself.
 *   const addToCart = useAddToCart();
 *   addToCart(product, { qty, sourceEl: imageRef.current });
 */
export function useAddToCart() {
  const { add } = useCart();
  const { t } = useI18n();
  const fly = useFlyToCart();
  const toast = useToast();
  const openCart = useOpenCart();

  return useCallback(
    (product, { qty = 1, sourceEl } = {}) => {
      if (!product || product.isAvailable === false) return;
      // The cart keeps the name it is given; give it the display title, never the ALL-CAPS catalogue name.
      add({ ...product, name: product.title || product.name, nameUz: product.titleUz || product.title || product.nameUz }, qty);
      fly(sourceEl);
      toast({
        id: 'cart',
        message: t('addedToCart'),
        action: openCart ? { label: t('open'), onClick: openCart } : undefined,
      });
    },
    [add, fly, toast, openCart, t]
  );
}
