import React, { createContext, useContext, useEffect, useMemo, useCallback, useState } from 'react';

const STORAGE_KEY = 'fh-web-cart';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [cart, setCart] = useState(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch (_) {}
  }, [cart]);

  const add = useCallback((product, qty = 1) => {
    setCart((prev) => {
      const existing = prev[product._id];
      if (existing) {
        return {
          ...prev,
          [product._id]: { ...existing, quantity: existing.quantity + qty },
        };
      }
      return {
        ...prev,
        [product._id]: {
          _id: product._id,
          name: product.name,
          nameUz: product.nameUz,
          price: Number(product.price) || 0,
          imageUrl: product.imageUrl,
          quantity: qty,
        },
      };
    });
  }, []);

  const setQty = useCallback((id, quantity) => {
    setCart((prev) => {
      if (quantity <= 0) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: { ...prev[id], quantity } };
    });
  }, []);

  const remove = useCallback((id) => {
    setCart((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const clear = useCallback(() => setCart({}), []);

  // Promo is lifted here so it survives navigation Cart → Checkout.
  const [promo, setPromo] = useState(null);
  const setAppliedPromo = useCallback((p) => setPromo(p), []);
  const clearPromo = useCallback(() => setPromo(null), []);

  const { items, count, subtotal } = useMemo(() => {
    const list = Object.values(cart);
    return {
      items: list,
      count: list.reduce((s, i) => s + i.quantity, 0),
      subtotal: list.reduce((s, i) => s + i.price * i.quantity, 0),
    };
  }, [cart]);

  // Memoize value so consumers (ProductCard grid) don't re-render on unrelated renders.
  const value = useMemo(() => ({
    cart, items, count, subtotal,
    add, setQty, remove, clear,
    appliedPromo: promo, setAppliedPromo, clearPromo,
  }), [cart, items, count, subtotal, add, setQty, remove, clear, promo, setAppliedPromo, clearPromo]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
