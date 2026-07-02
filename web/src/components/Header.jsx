import React, { useState, useRef, useEffect } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { useCart } from '../context/CartContext.jsx';
import { Leaf, Flower, Sprout, Baby, Bottle, Gift, Search, User, Cart as CartIcon } from './Icons.jsx';

/** Mega-menu product families — matches fairhavenhealth.com "Products" dropdown. */
const FAMILIES = [
  { to: '/shop/fertility-women', key: 'famWomen', Icon: Flower },
  { to: '/shop/fertility-men', key: 'famMen', Icon: Sprout },
  { to: '/shop/pregnant', key: 'famPrenatal', Icon: Baby },
  { to: '/shop/nursing', key: 'famNursing', Icon: Bottle },
  { to: '/shop/menopause', key: 'famMenopause', Icon: Leaf },
  { to: '/shop?tag=bundle', key: 'famBundles', Icon: Gift },
  { to: '/shop', key: 'famAll', Icon: Search, featured: true },
];

export default function Header({ onOpenCart }) {
  const { t, lang, toggle } = useI18n();
  const { count } = useCart();
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

        <Link to="/" className="logo" onClick={() => setMobileOpen(false)}>
          <span className="logo-mark"><Leaf width={26} height={26} /></span>
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
              {t('navProducts')} <span className="nav-caret">▾</span>
            </button>
            {megaOpen && (
              <div className="mega-menu" onMouseLeave={() => setMegaOpen(false)}>
                <div className="mega-grid">
                  {FAMILIES.map((f) => (
                    <Link
                      key={f.to}
                      to={f.to}
                      className={`mega-link ${f.featured ? 'featured' : ''}`}
                      onClick={() => setMegaOpen(false)}
                    >
                      <span className="mega-icon"><f.Icon width={22} height={22} /></span>
                      <span className="mega-label">{t(f.key)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          <NavLink to="/shop" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            {t('navStage')}
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

          <Link to="/account" className="header-icon-btn" aria-label={t('account')}>
            <User width={20} height={20} />
          </Link>

          <button className="header-cart-btn" onClick={onOpenCart} aria-label={t('cart')} type="button">
            <CartIcon width={22} height={22} />
            {count > 0 && <span className="cart-badge">{count}</span>}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="mobile-nav" id="mobile-nav">
          <div className="container">
            <Link to="/shop" onClick={() => setMobileOpen(false)} className="mobile-nav-link">
              {t('navProducts')}
            </Link>
            <div className="mobile-nav-sub">
              {FAMILIES.map((f) => (
                <Link key={f.to} to={f.to} onClick={() => setMobileOpen(false)} className="mobile-nav-sublink">
                  <f.Icon width={20} height={20} /> {t(f.key)}
                </Link>
              ))}
            </div>
            <Link to="/shop" onClick={() => setMobileOpen(false)} className="mobile-nav-link">
              {t('navStage')}
            </Link>
            <Link to="/about" onClick={() => setMobileOpen(false)} className="mobile-nav-link">
              {t('navDifference')}
            </Link>
            <Link to="/learn" onClick={() => setMobileOpen(false)} className="mobile-nav-link">
              {t('navLearn')}
            </Link>
            <Link to="/contact" onClick={() => setMobileOpen(false)} className="mobile-nav-link">
              {t('navContact')}
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
        </div>
      )}
    </header>
  );
}
