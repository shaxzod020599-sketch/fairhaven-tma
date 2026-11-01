import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { m } from 'motion/react';
import { I18nProvider, useI18n } from './i18n/index.jsx';
import { CartProvider } from './context/CartContext.jsx';
import { SettingsProvider } from './context/SettingsContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { SiteContentProvider } from './context/SiteContentContext.jsx';
import { CatalogProvider } from './catalog/index.js';
import { MotionProvider, FlyToCartProvider, RouteProgress, RouteFallback, inViewTransition, EASE_OUT } from './motion/index.js';
import { ToastProvider, OpenCartProvider } from './components/ui/index.js';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import AnnouncementBar from './components/AnnouncementBar.jsx';
import CartDrawer from './components/CartDrawer.jsx';
import { HeaderToneProvider } from './components/shell/HeaderTone.jsx';
import { SearchProvider } from './components/shell/SearchContext.jsx';
import ScrollToTop from './components/ScrollToTop.jsx';

// Eager: the home page is the main landing page, so its first paint must not wait for a second chunk.
import Home from './pages/Home.jsx';

// Lazy: every other route is split out of the main bundle.
const Shop = lazy(() => import('./pages/Shop.jsx'));
const Product = lazy(() => import('./pages/Product.jsx'));
const Cart = lazy(() => import('./pages/Cart.jsx'));
const Checkout = lazy(() => import('./pages/Checkout.jsx'));
const OrderSuccess = lazy(() => import('./pages/OrderSuccess.jsx'));
const About = lazy(() => import('./pages/About.jsx'));
const Contact = lazy(() => import('./pages/Contact.jsx'));
const FAQ = lazy(() => import('./pages/FAQ.jsx'));
const Blog = lazy(() => import('./pages/Blog.jsx'));
const BlogPost = lazy(() => import('./pages/BlogPost.jsx'));
const Account = lazy(() => import('./pages/Account.jsx'));
const Brands = lazy(() => import('./pages/Brands.jsx'));
const Brand = lazy(() => import('./pages/Brand.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));
const AdminPanel = lazy(() => import('./pages/AdminPanel.jsx'));

const PAGE_IN = { opacity: 0.001, y: 6 };
const PAGE_SHOWN = { opacity: 1, y: 0 };

function Shell() {
  const { t } = useI18n();
  const [cartOpen, setCartOpen] = useState(false);
  const location = useLocation();

  // Close drawer on navigation
  useEffect(() => {
    setCartOpen(false);
  }, [location.pathname]);

  const openCart = useCallback(() => setCartOpen(true), []);
  const closeCart = useCallback(() => setCartOpen(false), []);

  return (
    <OpenCartProvider onOpen={openCart}>
      <a className="skip-link" href="#main">{t('skipToContent')}</a>
      <ScrollToTop />
      <RouteProgress />
      <AnnouncementBar />
      <Header onOpenCart={openCart} />
      <main id="main" className="site-main" tabIndex={-1}>
        <Suspense fallback={<RouteFallback />}>
          {/* Light fade-in per page, no exit phase. Inside a view transition the browser morphs the page, so
              the new page must be fully visible when its snapshot is taken. */}
          <m.div
            key={location.pathname}
            initial={inViewTransition() ? false : PAGE_IN}
            animate={PAGE_SHOWN}
            transition={{ duration: 0.26, ease: EASE_OUT }}
          >
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/shop" element={<Shop />} />
              <Route path="/shop/:stage" element={<Shop />} />
              <Route path="/product/:id" element={<Product />} />
              <Route path="/brands" element={<Brands />} />
              <Route path="/brands/:slug" element={<Brand />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/order/:id" element={<OrderSuccess />} />
              <Route path="/about" element={<About />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/faq" element={<FAQ />} />
              <Route path="/learn" element={<Blog />} />
              <Route path="/learn/:slug" element={<BlogPost />} />
              <Route path="/account" element={<Account />} />
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </m.div>
        </Suspense>
      </main>
      <Footer />
      <CartDrawer open={cartOpen} onClose={closeCart} />
    </OpenCartProvider>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <SettingsProvider>
        <AuthProvider>
          <SiteContentProvider>
            <CartProvider>
              <CatalogProvider>
                <MotionProvider>
                  <ToastProvider>
                    <FlyToCartProvider>
                      <HeaderToneProvider>
                        <SearchProvider>
                          <Shell />
                        </SearchProvider>
                      </HeaderToneProvider>
                    </FlyToCartProvider>
                  </ToastProvider>
                </MotionProvider>
              </CatalogProvider>
            </CartProvider>
          </SiteContentProvider>
        </AuthProvider>
      </SettingsProvider>
    </I18nProvider>
  );
}
