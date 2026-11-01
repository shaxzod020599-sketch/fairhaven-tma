import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { m } from 'motion/react';
import { useI18n } from '../i18n/index.jsx';
import { SPRING } from '../motion/easings.js';
import { Wordmark } from './ui/Wordmark.jsx';
import { Menu, Search } from './Icons.jsx';
import MegaMenu from './shell/MegaMenu.jsx';
import MobileMenu from './shell/MobileMenu.jsx';
import LanguageSwitch from './shell/LanguageSwitch.jsx';
import AccountButton, { AdminChip } from './shell/AccountButton.jsx';
import CartButton from './shell/CartButton.jsx';
import { useCurrentHeaderTone } from './shell/HeaderTone.jsx';
import { useSearch } from './shell/SearchContext.jsx';
import './Header.css';

const SOLID_AT = 24; // px scrolled before a clear header gets its white glass
const HIDE_AFTER = 400; // px scrolled before scrolling down tucks the header away
const NUDGE = 6; // ignore scroll jitter smaller than this

const FH = '/brands/fairhaven-health';

/** Scroll state for the header: solid after 24 px, hidden when scrolling down past 400 px. */
function useScrollState() {
  const [state, setState] = useState({ solid: false, down: false });
  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;
    const read = () => {
      frame = 0;
      const y = Math.max(0, window.scrollY);
      const delta = y - last;
      setState((s) => {
        const solid = y > SOLID_AT;
        let down = s.down;
        if (y <= HIDE_AFTER) down = false;
        else if (delta > NUDGE) down = true;
        else if (delta < -NUDGE) down = false;
        return solid === s.solid && down === s.down ? s : { solid, down };
      });
      if (Math.abs(delta) > NUDGE || y <= HIDE_AFTER) last = y;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  return state;
}

/**
 * Site header. One line from 1080 px: wordmark, Каталог (mega menu), Бренды, Fairhaven Health, Журнал,
 * then search, RU/UZ, account and cart. Below 1080 px a burger opens the phone menu. Pages that start
 * on a dark stage call useHeaderTone('stage'): the header then begins clear with light text over it.
 */
export default function Header({ onOpenCart }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const tone = useCurrentHeaderTone();
  const { openSearch, isOpen: searchOpen } = useSearch();
  const { solid, down } = useScrollState();
  const [megaOpen, setMegaOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const ref = useRef(null);

  useEffect(() => setMenuOpen(false), [pathname]);
  const onMegaChange = useCallback((open) => setMegaOpen(open), []);

  const clear = tone === 'stage' && !solid && !megaOpen;
  const hidden = down && !megaOpen && !menuOpen && !searchOpen && !focusInside;

  const brandsActive = pathname.startsWith('/brands') && !pathname.startsWith(FH);
  const navLink = (active) => ({
    className: `sh-nav-link${active ? ' is-active' : ''}`,
    'aria-current': active ? 'page' : undefined,
  });

  return (
    <m.header
      ref={ref}
      className={`hdr${clear ? ' is-clear' : ' is-solid'}${solid ? ' is-scrolled' : ''}`}
      data-tone={tone}
      initial={false}
      animate={{ y: hidden ? '-100%' : '0%' }}
      transition={SPRING.snappy}
      onFocus={() => setFocusInside(true)}
      onBlur={(e) => {
        if (!ref.current?.contains(e.relatedTarget)) setFocusInside(false);
      }}
    >
      <div className="container hdr-row">
        <button
          type="button"
          className="hdr-icon hdr-burger"
          onClick={() => setMenuOpen(true)}
          aria-label={t('menu')}
          aria-expanded={menuOpen}
          aria-haspopup="dialog"
        >
          <Menu size={24} />
        </button>

        <Wordmark size={30} className="hdr-wordmark" aria-label={`FairHaven, ${t('home')}`} />

        <nav className="hdr-nav" aria-label={t('shell.mainNav')}>
          <MegaMenu onOpenChange={onMegaChange} />
          <Link to="/brands" {...navLink(brandsActive)}>{t('brands')}</Link>
          <Link to={FH} {...navLink(pathname.startsWith(FH))}>Fairhaven Health</Link>
          <Link to="/learn" {...navLink(pathname.startsWith('/learn'))}>{t('journal')}</Link>
        </nav>

        <div className="hdr-actions">
          <button
            type="button"
            className="hdr-icon hdr-search"
            onClick={() => openSearch()}
            aria-label={t('search')}
            aria-haspopup="dialog"
            aria-keyshortcuts="/ Control+K Meta+K"
          >
            <Search size={22} />
            <span className="hdr-search-label">{t('search')}</span>
            <kbd className="hdr-search-key t-mono" aria-hidden="true">/</kbd>
          </button>
          <LanguageSwitch className={`hdr-lang${clear ? ' is-light' : ''}`} />
          <AdminChip className="hdr-admin" />
          <AccountButton />
          <CartButton onOpen={onOpenCart} />
        </div>
      </div>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </m.header>
  );
}
