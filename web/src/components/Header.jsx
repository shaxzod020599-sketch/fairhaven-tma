import React, { useState, useRef, useEffect } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { AnimatePresence, m } from 'motion/react';
import { useI18n } from '../i18n/index.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  Leaf, Flower, Sprout, Baby, Bottle, Gift, Search, User, Cart as CartIcon,
} from './Icons.jsx';

/** Life-stage families — mirrors fairhavenhealth.com "Products" dropdown. */
const FAMILIES = [
  { to: '/shop/fertility-women', key: 'famWomen', Icon: Flower },
  { to: '/shop/fertility-men', key: 'famMen', Icon: Sprout },
  { to: '/shop/pregnant', key: 'famPrenatal', Icon: Baby },
  { to: '/shop/nursing', key: 'famNursing', Icon: Bottle },
  { to: '/shop/menopause', key: 'famMenopause', Icon: Leaf },
  { to: '/shop?tag=bundle', key: 'famBundles', Icon: Gift },
];

/** Catalogue categories — the same set the bot admin assigns to products. */
const CATEGORIES = [
  { key: 'supplements', ru: 'Добавки', uz: 'Qo‘shimchalar' },
  { key: 'vitamins', ru: 'Витамины', uz: 'Vitaminlar' },
  { key: 'parapharmaceuticals', ru: 'Парафармация', uz: 'Parafarmatsiya' },
  { key: 'drinks', ru: 'Напитки', uz: 'Ichimliklar' },
  { key: 'hygiene', ru: 'Гигиена', uz: 'Gigiyena' },
  { key: 'cosmetics', ru: 'Косметика', uz: 'Kosmetika' },
];

const COMPANY_LINKS = [
  { to: '/about', key: 'navDifference' },
  { to: '/learn', key: 'navLearn' },
  { to: '/faq', key: 'faqTitle' },
  { to: '/contact', key: 'navContact' },
];

export default function Header({ onOpenCart }) {
  const { t, lang, toggle } = useI18n();
  const { count } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [megaOpen, setMegaOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const megaRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (megaRef.current && !megaRef.current.contains(e.target)) setMegaOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const submitSearch = (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    navigate(`/shop?q=${encodeURIComponent(query.trim())}`);
    setSearchOpen(false);
    setMobileOpen(false);
    setQuery('');
  };

  const closeAll = () => {
    setMegaOpen(false);
    setMobileOpen(false);
  };

  return (
    <header className="site-header">
      <div className="container header-row">
        <button
          className="header-icon-btn menu-toggle"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Menu"
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
          type="button"
        >
          <span />
          <span />
          <span />
        </button>

        <Link to="/" className="logo" onClick={closeAll}>
          <img
            className="logo-mark-img"
            src="/fh-mark.png"
            alt=""
            width="30"
            height="30"
          />
          <span className="logo-text">
            Fairhaven<span className="logo-accent">Health</span>
          </span>
        </Link>

        <nav className="main-nav" aria-label="Primary">
          <div className="nav-item has-mega" ref={megaRef}>
            <button
              className="nav-link"
              onClick={() => setMegaOpen((v) => !v)}
              onMouseEnter={() => setMegaOpen(true)}
              aria-expanded={megaOpen}
              aria-haspopup="true"
              type="button"
            >
              {t('navCatalog')} <span className="nav-caret">▾</span>
            </button>
            <AnimatePresence>
            {megaOpen && (
              <m.div
                className="mega-menu mega-menu-wide"
                onMouseLeave={() => setMegaOpen(false)}
                initial={{ opacity: 0, y: -12, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, transition: { duration: 0.15, ease: 'easeIn' } }}
                transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                style={{ transformOrigin: 'top center' }}
              >
                <div className="mega-columns">
                  <div className="mega-col">
                    <div className="mega-col-title">{t('navStage')}</div>
                    {FAMILIES.map((f) => (
                      <Link key={f.to} to={f.to} className="mega-link" onClick={closeAll}>
                        <span className="mega-icon"><f.Icon width={20} height={20} /></span>
                        <span className="mega-label">{t(f.key)}</span>
                      </Link>
                    ))}
                  </div>
                  <div className="mega-col">
                    <div className="mega-col-title">{t('filterCategory')}</div>
                    {CATEGORIES.map((c) => (
                      <Link
                        key={c.key}
                        to={`/shop?category=${c.key}`}
                        className="mega-link mega-link-plain"
                        onClick={closeAll}
                      >
                        <span className="mega-label">{lang === 'uz' ? c.uz : c.ru}</span>
                      </Link>
                    ))}
                  </div>
                  <div className="mega-col">
                    <div className="mega-col-title">{t('footerAbout2')}</div>
                    {COMPANY_LINKS.map((l) => (
                      <Link
                        key={l.to}
                        to={l.to}
                        className="mega-link mega-link-plain"
                        onClick={closeAll}
                      >
                        <span className="mega-label">{t(l.key)}</span>
                      </Link>
                    ))}
                    <Link to="/shop" className="mega-link featured" onClick={closeAll}>
                      <span className="mega-icon"><Search width={20} height={20} /></span>
                      <span className="mega-label">{t('famAll')}</span>
                    </Link>
                  </div>
                </div>
              </m.div>
            )}
            </AnimatePresence>
          </div>

          <NavLink to="/shop" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            {t('navProducts')}
          </NavLink>
          <NavLink to="/about" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            {t('navDifference')}
          </NavLink>
          <NavLink to="/learn" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            {t('navLearn')}
          </NavLink>
          <NavLink to="/contact" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            {t('navContact')}
          </NavLink>
        </nav>

        <div className="header-actions">
          <div className="header-search-wrap" ref={searchRef}>
            <button
              className="header-icon-btn"
              onClick={() => setSearchOpen((v) => !v)}
              aria-label={t('search')}
              aria-expanded={searchOpen}
              aria-controls="header-search"
              type="button"
            >
              <Search width={20} height={20} />
            </button>
            {searchOpen && (
              <form id="header-search" className="header-search-pop" onSubmit={submitSearch}>
                <input
                  autoFocus
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                />
                <button type="submit" className="btn btn-sm btn-primary">{t('search')}</button>
              </form>
            )}
          </div>

          <button className="header-lang" onClick={toggle} type="button" aria-label="Switch language">
            {lang === 'ru' ? 'UZ' : 'RU'}
          </button>

          <Link
            to="/account"
            className={`header-signin ${user ? 'header-user-authed' : ''}`}
            aria-label={t('account')}
          >
            {user && user.photoUrl
              ? <img className="header-avatar" src={user.photoUrl} alt="" width="24" height="24" />
              : <User width={20} height={20} />}
            <span className="header-signin-label">
              {user ? (user.firstName || t('account')) : t('signIn')}
            </span>
          </Link>

          <button className="header-cart-btn" onClick={onOpenCart} aria-label={t('cart')} type="button">
            <CartIcon width={22} height={22} />
            {count > 0 && <span className="cart-badge">{count}</span>}
          </button>
        </div>
      </div>

      <AnimatePresence>
      {mobileOpen && (
        <m.div
          className="mobile-nav"
          id="mobile-nav"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8, transition: { duration: 0.14, ease: 'easeIn' } }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
        >
          <div className="container">
            <div className="mobile-nav-group-title">{t('navStage')}</div>
            <div className="mobile-nav-sub">
              {FAMILIES.map((f) => (
                <Link key={f.to} to={f.to} onClick={closeAll} className="mobile-nav-sublink">
                  <f.Icon width={20} height={20} /> {t(f.key)}
                </Link>
              ))}
            </div>
            <div className="mobile-nav-group-title">{t('filterCategory')}</div>
            <div className="mobile-nav-sub">
              {CATEGORIES.map((c) => (
                <Link
                  key={c.key}
                  to={`/shop?category=${c.key}`}
                  onClick={closeAll}
                  className="mobile-nav-sublink"
                >
                  {lang === 'uz' ? c.uz : c.ru}
                </Link>
              ))}
            </div>
            <Link to="/shop" onClick={closeAll} className="mobile-nav-link">
              {t('famAll')}
            </Link>
            {COMPANY_LINKS.map((l) => (
              <Link key={l.to} to={l.to} onClick={closeAll} className="mobile-nav-link">
                {t(l.key)}
              </Link>
            ))}
            <Link to="/account" onClick={closeAll} className="mobile-nav-link">
              {t('account')}
            </Link>
            <form className="mobile-search" onSubmit={submitSearch}>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('searchPlaceholder')}
              />
              <button type="submit" className="btn btn-sm btn-primary">{t('search')}</button>
            </form>
          </div>
        </m.div>
      )}
      </AnimatePresence>
    </header>
  );
}
