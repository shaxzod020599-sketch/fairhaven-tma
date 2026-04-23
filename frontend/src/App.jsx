import React, { useState, useEffect, useCallback } from 'react';
import { initTelegram, getTelegramUser, hapticNotification } from './utils/telegram';
import { upsertUser, fetchUser } from './utils/api';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import Toast from './components/Toast';
import Loading from './components/Loading';
import RegistrationGate from './components/RegistrationGate';
import Home from './pages/Home';
import Catalog from './pages/Catalog';
import Cart from './pages/Cart';
import Profile from './pages/Profile';

// Auth states
//   'loading'        → fetching profile
//   'not_started'    → user not in DB — hasn't /start'd the bot
//   'incomplete'     → user exists, registration wizard not finished
//   'ready'          → registered, can use the app
const AUTH = {
  LOADING: 'loading',
  NOT_STARTED: 'not_started',
  INCOMPLETE: 'incomplete',
  READY: 'ready',
};

export default function App() {
  const [page, setPage] = useState('home');
  const [cart, setCart] = useState({});
  const [toast, setToast] = useState({ message: '', visible: false });
  const [dbUser, setDbUser] = useState(null);
  const [authStatus, setAuthStatus] = useState(AUTH.LOADING);

  useEffect(() => {
    initTelegram();
    syncUser();
  }, []);

  const syncUser = async () => {
    try {
      const tgUser = getTelegramUser();

      // No Telegram user at all (e.g. opened outside Telegram) — block.
      if (!tgUser.id) {
        setAuthStatus(AUTH.NOT_STARTED);
        return;
      }

      // Keep Telegram-native fields fresh; do NOT create a record —
      // registration happens only through the bot wizard.
      try {
        await upsertUser({
          telegramId: tgUser.id,
          username: tgUser.username || '',
          photoUrl: tgUser.photo_url || '',
          languageCode: tgUser.language_code || 'ru',
        });
      } catch (_) {
        /* non-fatal */
      }

      // Load the full DB profile.
      let res = null;
      try {
        res = await fetchUser(tgUser.id);
      } catch (err) {
        // 404 = user hasn't /start'd the bot.
        setAuthStatus(AUTH.NOT_STARTED);
        return;
      }

      const user = res?.data;
      if (!user) {
        setAuthStatus(AUTH.NOT_STARTED);
        return;
      }
      setDbUser(user);

      const registered =
        user.registrationStep === 'done' && user.consentAccepted === true;
      setAuthStatus(registered ? AUTH.READY : AUTH.INCOMPLETE);
    } catch (err) {
      console.warn('User sync failed:', err.message);
      setAuthStatus(AUTH.NOT_STARTED);
    }
  };

  const showToast = useCallback((message) => {
    setToast({ message, visible: true });
    setTimeout(() => setToast({ message: '', visible: false }), 2500);
  }, []);

  const handleNavigate = useCallback((target) => {
    setPage(target);
  }, []);

  const addToCart = useCallback(
    (product) => {
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
      showToast(`${product.name} — в корзине`);
    },
    [showToast]
  );

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

  const clearCart = useCallback(() => setCart({}), []);

  const cartCount = Object.values(cart).reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  // ─── Gate: block the entire app until registration is complete ──────────
  if (authStatus === AUTH.LOADING) {
    return (
      <div className="app-container" id="app-root">
        <Loading text="Загрузка…" />
      </div>
    );
  }

  if (authStatus !== AUTH.READY) {
    return (
      <div className="app-container" id="app-root">
        <RegistrationGate reason={authStatus} />
      </div>
    );
  }

  // ─── Full app (registered users only) ────────────────────────────────────
  const renderPage = () => {
    switch (page) {
      case 'home':
        return <Home onNavigate={handleNavigate} onAddToCart={addToCart} />;
      case 'catalog':
        return <Catalog onAddToCart={addToCart} />;
      case 'cart':
        return (
          <Cart
            cart={cart}
            onUpdateQty={updateCartQty}
            onRemove={removeFromCart}
            onClear={clearCart}
            onNavigate={handleNavigate}
            dbUser={dbUser}
          />
        );
      case 'profile':
        return <Profile dbUser={dbUser} />;
      default:
        return <Home onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="app-container" id="app-root">
      <Header
        onOpenSearch={() => handleNavigate('catalog')}
        onOpenNotifications={() => showToast('Новых уведомлений нет')}
      />
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
