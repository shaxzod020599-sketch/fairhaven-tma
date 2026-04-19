import React, { useState, useEffect, useCallback } from 'react';
import { initTelegram, getTelegramUser, hapticNotification } from './utils/telegram';
import { upsertUser } from './utils/api';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import Toast from './components/Toast';
import Home from './pages/Home';
import Catalog from './pages/Catalog';
import Cart from './pages/Cart';
import Profile from './pages/Profile';

export default function App() {
  const [page, setPage] = useState('home');
  const [catalogCategory, setCatalogCategory] = useState(null);
  const [cart, setCart] = useState({});
  const [toast, setToast] = useState({ message: '', visible: false });

  // Initialize TMA on mount
  useEffect(() => {
    initTelegram();
    syncUser();
  }, []);

  const syncUser = async () => {
    try {
      const tgUser = getTelegramUser();
      if (tgUser.id) {
        await upsertUser({
          telegramId: tgUser.id,
          firstName: tgUser.first_name || '',
          lastName: tgUser.last_name || '',
          username: tgUser.username || '',
          photoUrl: tgUser.photo_url || '',
          languageCode: tgUser.language_code || 'ru',
        });
      }
    } catch (err) {
      // Silent fail — user sync is non-critical
      console.warn('User sync failed:', err.message);
    }
  };

  // Toast helper
  const showToast = useCallback((message) => {
    setToast({ message, visible: true });
    setTimeout(() => setToast({ message: '', visible: false }), 2500);
  }, []);

  // Navigation
  const handleNavigate = useCallback((target, data) => {
    if (target === 'catalog' && data) {
      setCatalogCategory(data);
    } else if (target === 'catalog') {
      setCatalogCategory(null);
    }
    setPage(target);
  }, []);

  // Cart operations
  const addToCart = useCallback((product) => {
    setCart((prev) => {
      const existing = prev[product._id];
      if (existing) {
        return {
          ...prev,
          [product._id]: { ...existing, quantity: existing.quantity + 1 },
        };
      }
      return {
        ...prev,
        [product._id]: { ...product, quantity: 1 },
      };
    });
    hapticNotification('success');
    showToast(`✓ ${product.name} добавлен`);
  }, [showToast]);

  const updateCartQty = useCallback((productId, quantity) => {
    setCart((prev) => {
      if (quantity <= 0) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return {
        ...prev,
        [productId]: { ...prev[productId], quantity },
      };
    });
  }, []);

  const removeFromCart = useCallback((productId) => {
    setCart((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  }, []);

  const cartCount = Object.values(cart).reduce((sum, item) => sum + item.quantity, 0);

  // Render current page
  const renderPage = () => {
    switch (page) {
      case 'home':
        return <Home onNavigate={handleNavigate} />;
      case 'catalog':
        return (
          <Catalog
            initialCategory={catalogCategory}
            onAddToCart={addToCart}
          />
        );
      case 'cart':
        return (
          <Cart
            cart={cart}
            onUpdateQty={updateCartQty}
            onRemove={removeFromCart}
          />
        );
      case 'profile':
        return <Profile />;
      default:
        return <Home onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="app-container" id="app-root">
      <Header />
      {renderPage()}
      <BottomNav
        active={page}
        onNavigate={handleNavigate}
        cartCount={cartCount}
      />
      <Toast message={toast.message} visible={toast.visible} />
    </div>
  );
}
