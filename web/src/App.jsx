import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { I18nProvider } from './i18n/index.jsx';
import { CartProvider } from './context/CartContext.jsx';
import { SettingsProvider } from './context/SettingsContext.jsx';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import AnnouncementBar from './components/AnnouncementBar.jsx';
import CartDrawer from './components/CartDrawer.jsx';
import ScrollToTop from './components/ScrollToTop.jsx';

// Eager: critical LCP path (home + shop + product + cart).
import Home from './pages/Home.jsx';
import Shop from './pages/Shop.jsx';
import Product from './pages/Product.jsx';
import Cart from './pages/Cart.jsx';

// Lazy: cold routes — split out of main bundle.
const Checkout = lazy(() => import('./pages/Checkout.jsx'));
const OrderSuccess = lazy(() => import('./pages/OrderSuccess.jsx'));
const About = lazy(() => import('./pages/About.jsx'));
const Contact = lazy(() => import('./pages/Contact.jsx'));
const FAQ = lazy(() => import('./pages/FAQ.jsx'));
const Blog = lazy(() => import('./pages/Blog.jsx'));
const BlogPost = lazy(() => import('./pages/BlogPost.jsx'));
const Account = lazy(() => import('./pages/Account.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

// Minimal Suspense fallback — keeps header/footer, just blanks main.
function RouteFallback() {
  return <div className="container" style={{ minHeight: '40vh' }} />;
}

export default function App() {
  const [cartOpen, setCartOpen] = useState(false);
  const location = useLocation();

  // Close drawer on navigation
  useEffect(() => {
    setCartOpen(false);
  }, [location.pathname]);

  const openCart = useCallback(() => setCartOpen(true), []);
  const closeCart = useCallback(() => setCartOpen(false), []);

  return (
    <I18nProvider>
      <SettingsProvider>
        <CartProvider>
          <ScrollToTop />
          <AnnouncementBar />
          <Header onOpenCart={openCart} />
          <main className="site-main">
            <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/shop" element={<Shop />} />
              <Route path="/shop/:stage" element={<Shop />} />
              <Route path="/product/:id" element={<Product onOpenCart={openCart} />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/order/:id" element={<OrderSuccess />} />
              <Route path="/about" element={<About />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/faq" element={<FAQ />} />
              <Route path="/learn" element={<Blog />} />
              <Route path="/learn/:slug" element={<BlogPost />} />
              <Route path="/account" element={<Account />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </main>
          <Footer />
          <CartDrawer open={cartOpen} onClose={closeCart} />
        </CartProvider>
      </SettingsProvider>
    </I18nProvider>
  );
}
