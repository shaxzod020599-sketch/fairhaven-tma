import React, { useState, useEffect, useCallback } from 'react';
import { initTelegram, getTelegramUser, hapticNotification } from './utils/telegram';
import { upsertUser, fetchUser, fetchOrdersByUser, fetchProductById } from './utils/api';
import { isActive } from './utils/orderStatus';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import Toast from './components/Toast';
import Loading from './components/Loading';
import RegistrationGate from './components/RegistrationGate';
import ProductDetail from './components/ProductDetail';
import Home from './pages/Home';
import Catalog from './pages/Catalog';
import Cart from './pages/Cart';
import Profile from './pages/Profile';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import AdminApp from './admin/AdminApp';
import './admin/admin.css';

const AUTH = {
  LOADING: 'loading',
  NOT_STARTED: 'not_started',
  INCOMPLETE: 'incomplete',
  READY: 'ready',
};

// Keep the set of pages that should show the top header + bottom nav.
const CHROME_PAGES = new Set(['home', 'catalog', 'cart', 'profile', 'orders']);

export default function App() {
  const [page, setPage] = useState('home');
  const [activeOrderId, setActiveOrderId] = useState(null);
  const [cart, setCart] = useState({});
  const [toast, setToast] = useState({ message: '', visible: false });
  const [dbUser, setDbUser] = useState(null);
  const [authStatus, setAuthStatus] = useState(AUTH.LOADING);
  const [orders, setOrders] = useState([]);
  const [adminMode, setAdminMode] = useState(false);
  const [deepLinkProduct, setDeepLinkProduct] = useState(null);

  useEffect(() => {
    initTelegram();
    syncUser();
  }, []);

  // Deep-link: ?product=<id> opens the product detail sheet on top of any page.
  useEffect(() => {
    if (authStatus !== AUTH.READY) return;
    const params = new URLSearchParams(window.location.search);
    let pid = params.get('product');
    if (!pid) {
      const tg = window.Telegram?.WebApp;
      const start = tg?.initDataUnsafe?.start_param || '';
      const m = /^product[_-]?([a-fA-F0-9]{24})$/.exec(start);
      if (m) pid = m[1];
    }
    if (!pid) return;
    fetchProductById(pid)
      .then((res) => {
        if (res?.data) setDeepLinkProduct(res.data);
      })
      .catch(() => {})
      .finally(() => {
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete('product');
          window.history.replaceState({}, '', url.toString());
        } catch (_) {}
      });
  }, [authStatus]);

  const syncUser = async () => {
    try {
      const tgUser = getTelegramUser();
      if (!tgUser.id) {
        setAuthStatus(AUTH.NOT_STARTED);
        return;
      }

      try {
        await upsertUser({
          telegramId: tgUser.id,
          username: tgUser.username || '',
          photoUrl: tgUser.photo_url || '',
          languageCode: tgUser.language_code || 'ru',
        });
      } catch (_) { /* non-fatal */ }

      let res = null;
      try {
        res = await fetchUser(tgUser.id);
      } catch (_) {
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

      if (registered) {
        refreshOrders(tgUser.id);
      }
    } catch (err) {
      console.warn('User sync failed:', err.message);
      setAuthStatus(AUTH.NOT_STARTED);
    }
  };

  const refreshOrders = useCallback(async (tgId) => {
    try {
      const id = tgId || getTelegramUser()?.id;
      if (!id) return;
      const res = await fetchOrdersByUser(id);
      setOrders(res?.data || []);
    } catch (err) {
      console.warn('refreshOrders:', err.message);
    }
  }, []);

  // Light background refresh whenever authenticated — keeps the home banner
  // and the profile count in sync without forcing users onto the orders tab.
  useEffect(() => {
    if (authStatus !== AUTH.READY) return;
    const id = setInterval(() => refreshOrders(), 15_000);
    return () => clearInterval(id);
  }, [authStatus, refreshOrders]);

  const showToast = useCallback((message) => {
    setToast({ message, visible: true });
    setTimeout(() => setToast({ message: '', visible: false }), 2500);
  }, []);

  const handleNavigate = useCallback((target, data) => {
    if (target === 'orderDetail') setActiveOrderId(data);
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

  const handleOrderSubmitted = useCallback(
    async (orderId) => {
      clearCart();
      await refreshOrders();
      handleNavigate('orderDetail', orderId);
    },
    [clearCart, handleNavigate, refreshOrders]
  );

  const cartCount = Object.values(cart).reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  const activeOrders = orders.filter((o) => isActive(o.status));

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

  if (adminMode && dbUser?.role === 'admin') {
    return <AdminApp onExit={() => setAdminMode(false)} embedded />;
  }

  const showChrome = CHROME_PAGES.has(page);

  const renderPage = () => {
    switch (page) {
      case 'home':
        return (
          <Home
            onNavigate={handleNavigate}
            onAddToCart={addToCart}
            activeOrders={activeOrders}
            dbUser={dbUser}
          />
        );
      case 'catalog':
        return <Catalog onAddToCart={addToCart} dbUser={dbUser} />;
      case 'cart':
        return (
          <Cart
            cart={cart}
            onUpdateQty={updateCartQty}
            onRemove={removeFromCart}
            onClear={clearCart}
            onNavigate={handleNavigate}
            onOrderSubmitted={handleOrderSubmitted}
            dbUser={dbUser}
          />
        );
      case 'orders':
        return (
          <Orders
            onNavigate={handleNavigate}
            onOpenOrder={(orderId) => handleNavigate('orderDetail', orderId)}
          />
        );
      case 'orderDetail':
        return (
          <OrderDetail
            orderId={activeOrderId}
            onNavigate={handleNavigate}
          />
        );
      case 'profile':
        return (
          <Profile
            dbUser={dbUser}
            ordersCount={orders.length}
            activeOrdersCount={activeOrders.length}
            onNavigate={handleNavigate}
            onOpenAdmin={() => setAdminMode(true)}
          />
        );
      default:
        return (
          <Home
            onNavigate={handleNavigate}
            onAddToCart={addToCart}
            activeOrders={activeOrders}
          />
        );
    }
  };

  return (
    <div className="app-container" id="app-root">
      {showChrome && (
        <Header
          onOpenSearch={() => handleNavigate('catalog')}
          onOpenNotifications={() => showToast('Новых уведомлений нет')}
        />
      )}
      {renderPage()}
      {showChrome && (
        <BottomNav
          active={page}
          onNavigate={handleNavigate}
          cartCount={cartCount}
          activeOrdersCount={activeOrders.length}
        />
      )}
      {deepLinkProduct && (
        <ProductDetail
          product={deepLinkProduct}
          onClose={() => setDeepLinkProduct(null)}
          onAdd={addToCart}
          dbUser={dbUser}
        />
      )}
      <Toast message={toast.message} visible={toast.visible} />
    </div>
  );
}
