import React, { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { DICTS } from '../../i18n/dicts.js';
import { useCatalog, useTaxonomy, searchProducts, fold, productTitle, NEED_KEYS } from '../../catalog/index.js';
import { DURATION, EASE_OUT, SPRING } from '../../motion/easings.js';
import Price from '../ui/Price.jsx';
import { ArrowRight, ArrowUpRight, Close, NeedIcon, Search, Telegram, Clock } from '../Icons.jsx';
import { useContacts } from './contacts.js';
import './SearchOverlay.css';

const LIMITS = { products: 6, brands: 4, goals: 4 };
const RECENT_KEY = 'fh.recentSearches';
const RECENT_MAX = 5;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled])';

function readRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}
function writeRecent(list) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* private mode: recent searches simply are not kept */
  }
}

// Goal names in both languages, folded, so «сон» and «uyqu» both find the sleep goal.
const NEED_WORDS = NEED_KEYS.map((key) => ({
  key,
  words: [DICTS.ru[`need.${key}`], DICTS.uz[`need.${key}`]].map(fold).join(' '),
}));

function useResults(query) {
  const { products, index } = useCatalog();
  const { taxonomy } = useTaxonomy();
  return useMemo(() => {
    const q = fold(query);
    if (!q) return null;
    const found = searchProducts(products, query, index);
    const words = q.split(' ');
    const hit = (text) => words.every((w) => text.split(' ').some((part) => part.startsWith(w)));

    const allBrands = taxonomy?.brands || [];
    const brands = allBrands.filter((b) => hit(fold(`${b.name} ${b.slug.replace(/-/g, ' ')}`)));
    if (brands.length < LIMITS.brands && found.length) {
      // No brand is called «омега», but the brands that carry the matches are the next useful step.
      const carry = new Map();
      for (const p of found) if (p.brandSlug) carry.set(p.brandSlug, (carry.get(p.brandSlug) || 0) + 1);
      const ranked = [...carry].sort((a, b) => b[1] - a[1]).map(([slug]) => slug);
      for (const slug of ranked) {
        if (brands.length >= LIMITS.brands) break;
        const b = allBrands.find((x) => x.slug === slug);
        if (b && !brands.includes(b)) brands.push(b);
      }
    }

    const goals = NEED_WORDS.filter((n) => hit(n.words)).map((n) => n.key);
    if (goals.length < LIMITS.goals && found.length) {
      const freq = new Map();
      for (const p of found) for (const k of p.needs || []) freq.set(k, (freq.get(k) || 0) + 1);
      for (const [k] of [...freq].sort((a, b) => b[1] - a[1])) {
        if (goals.length >= LIMITS.goals) break;
        if (!goals.includes(k) && NEED_KEYS.includes(k)) goals.push(k);
      }
    }
    const needCount = new Map((taxonomy?.needs || []).map((n) => [n.key, n.count]));

    return {
      total: found.length,
      products: found.slice(0, LIMITS.products),
      brands: brands.slice(0, LIMITS.brands),
      goals: goals.slice(0, LIMITS.goals).map((key) => ({ key, count: needCount.get(key) })),
    };
  }, [query, products, index, taxonomy]);
}

const rowMotion = (reduce, i) =>
  reduce
    ? { initial: false }
    : {
        layout: 'position',
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: EASE_OUT, delay: Math.min(i * 0.03, 0.18) } },
        exit: { opacity: 0, transition: { duration: 0.1 } },
      };

function Overlay({ initialQuery, opener, onClose }) {
  const { t, tf, plural, lang } = useI18n();
  const { status } = useCatalog();
  const { taxonomy } = useTaxonomy();
  const contacts = useContacts();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const ids = useId();
  const listId = `${ids}-list`;
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const [query, setQuery] = useState(initialQuery || '');
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState(readRecent);
  const deferred = useDeferredValue(query);
  const results = useResults(deferred);
  const trimmed = query.trim();

  // Page lock, like the Sheet: the page behind is inert and does not scroll; focus comes back on close.
  useEffect(() => {
    const root = document.getElementById('root');
    const body = document.body.style;
    const saved = { overflow: body.overflow, padding: body.paddingRight };
    const gap = window.innerWidth - document.documentElement.clientWidth;
    body.overflow = 'hidden';
    if (gap > 0) body.paddingRight = `${gap}px`;
    root?.setAttribute('inert', '');
    const input = inputRef.current;
    input?.focus({ preventScroll: true });
    input?.select();
    const back = opener.current;
    return () => {
      body.overflow = saved.overflow;
      body.paddingRight = saved.padding;
      root?.removeAttribute('inert');
      if (back && document.contains(back)) back.focus({ preventScroll: true });
    };
  }, [opener]);

  const remember = (text) => {
    const value = String(text || '').trim();
    if (!value) return;
    const key = fold(value);
    const next = [value, ...readRecent().filter((x) => fold(x) !== key)].slice(0, RECENT_MAX);
    writeRecent(next);
    setRecent(next);
  };
  const forget = (text) => {
    const next = recent.filter((x) => x !== text);
    writeRecent(next);
    setRecent(next);
    inputRef.current?.focus();
  };

  const go = (to) => {
    navigate(to);
    onClose();
  };

  // One flat list for the arrow keys; each group renders its slice of it.
  const options = useMemo(() => {
    if (!results) return [];
    const list = [];
    results.products.forEach((p) => list.push({ kind: 'product', id: `p-${p._id}`, to: `/product/${p._id}`, item: p }));
    results.brands.forEach((b) => list.push({ kind: 'brand', id: `b-${b.slug}`, to: `/brands/${b.slug}`, item: b }));
    results.goals.forEach((g) => list.push({ kind: 'goal', id: `g-${g.key}`, to: `/shop/${g.key}`, item: g }));
    if (results.total > results.products.length) {
      list.push({ kind: 'all', id: 'all', to: `/shop?q=${encodeURIComponent(deferred.trim())}` });
    }
    return list;
  }, [results, deferred]);

  useEffect(() => setActive(-1), [deferred]);

  const pick = (option) => {
    remember(trimmed);
    go(option.to);
  };

  const onInputKey = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!results) {
        // Empty query: the suggestions are ordinary links, so the arrow simply moves focus into them.
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          panelRef.current?.querySelector('.sh-search-body a, .sh-search-body button')?.focus();
        }
        return;
      }
      if (!options.length) return;
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => {
        const n = options.length;
        if (step > 0) return i + 1 >= n ? -1 : i + 1;
        return i - 1 < -1 ? n - 1 : i - 1;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && options[active]) pick(options[active]);
      else if (trimmed) {
        remember(trimmed);
        go(`/shop?q=${encodeURIComponent(trimmed)}`);
      }
    }
  };

  useEffect(() => {
    if (active < 0) return;
    document.getElementById(`${ids}-${options[active]?.id}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, options, ids]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const optionProps = (option, index) => ({
    id: `${ids}-${option.id}`,
    role: 'option',
    'aria-selected': index === active,
    className: `sh-search-option sh-search-option--${option.kind}${index === active ? ' is-active' : ''}`,
    onPointerMove: () => index !== active && setActive(index),
    onPointerDown: (e) => e.preventDefault(), // keep focus in the input
    onClick: () => pick(option),
  });

  const offset = { products: 0 };
  offset.brands = results ? results.products.length : 0;
  offset.goals = offset.brands + (results ? results.brands.length : 0);

  const goalChips = (
    <ul className="sh-search-chips" role="list">
      {NEED_KEYS.map((key) => (
        <li key={key}>
          <Link to={`/shop/${key}`} className="sh-search-chip" onClick={onClose}>
            <NeedIcon need={key} size={18} />
            {t(`need.${key}`)}
          </Link>
        </li>
      ))}
    </ul>
  );

  const unit = (n) => plural(n, t('unitProducts'));
  const hasResults = results && options.length > 0;
  const noResults = results && !options.length && status !== 'loading';

  return (
    <div className="sh-search-root" onKeyDown={onKeyDown}>
      <m.div
        className="sh-search-backdrop"
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: DURATION.ui }}
        onPointerDown={onClose}
      />
      <m.div
        ref={panelRef}
        className="sh-search"
        role="dialog"
        aria-modal="true"
        aria-label={t('search')}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: -24 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, transition: SPRING.snappy }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: -16, transition: { duration: 0.18, ease: EASE_OUT } }}
      >
        <div className="sh-search-head container">
          <div className="sh-search-field">
            <Search size={22} className="sh-search-glass" />
            <input
              ref={inputRef}
              type="search"
              className="sh-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKey}
              placeholder={t('shell.searchHint')}
              aria-label={t('search')}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={Boolean(hasResults)}
              aria-controls={listId}
              aria-activedescendant={active >= 0 && options[active] ? `${ids}-${options[active].id}` : undefined}
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              enterKeyHint="search"
            />
            {query && (
              <button type="button" className="sh-search-clear" onClick={() => { setQuery(''); inputRef.current?.focus(); }}>
                {t('shell.clear')}
              </button>
            )}
          </div>
          <button type="button" className="sh-search-close" onClick={onClose} aria-label={t('close')}>
            <Close size={22} />
            <kbd className="sh-search-esc t-mono" aria-hidden="true">Esc</kbd>
          </button>
        </div>

        <div className="sh-search-body container">
          <div id={listId} role="listbox" aria-label={t('shell.searchResults')} className={hasResults ? 'sh-search-results' : 'sh-search-results is-empty'}>
            {hasResults && (
              <>
                {results.products.length > 0 && (
                  <div role="group" aria-labelledby={`${ids}-gp`} className="sh-search-group sh-search-group--products">
                    <p id={`${ids}-gp`} className="sh-search-gtitle t-mono" role="presentation">
                      {t('shell.searchProducts')} <span className="sh-search-gcount">{results.total}</span>
                    </p>
                    <ul role="presentation" className="sh-search-rows">
                      <AnimatePresence mode="popLayout" initial={false}>
                        {results.products.map((p, i) => (
                          <m.li key={p._id} role="presentation" {...rowMotion(reduce, i)}>
                            <div {...optionProps(options[offset.products + i], offset.products + i)}>
                              <span className="sh-search-thumb">
                                {p.image && <img src={p.image} alt="" loading="lazy" decoding="async" />}
                              </span>
                              <span className="sh-search-ptext">
                                <span className="sh-search-brand t-mono">{p.brandName}</span>
                                <span className="sh-search-ptitle">{productTitle(p, lang)}</span>
                              </span>
                              <Price value={p.price} old={p.oldPrice} size="sm" className="sh-search-price" />
                            </div>
                          </m.li>
                        ))}
                      </AnimatePresence>
                    </ul>
                  </div>
                )}

                <div className="sh-search-side">
                  {results.brands.length > 0 && (
                    <div role="group" aria-labelledby={`${ids}-gb`} className="sh-search-group">
                      <p id={`${ids}-gb`} className="sh-search-gtitle t-mono" role="presentation">{t('groupBrands')}</p>
                      <ul role="presentation" className="sh-search-rows">
                        <AnimatePresence mode="popLayout" initial={false}>
                          {results.brands.map((b, i) => (
                            <m.li key={b.slug} role="presentation" {...rowMotion(reduce, i + 2)}>
                              <div {...optionProps(options[offset.brands + i], offset.brands + i)}>
                                <span className="sh-search-label">{b.name}</span>
                                <span className="sh-search-count t-mono">{b.count} {unit(b.count)}</span>
                              </div>
                            </m.li>
                          ))}
                        </AnimatePresence>
                      </ul>
                    </div>
                  )}
                  {results.goals.length > 0 && (
                    <div role="group" aria-labelledby={`${ids}-gg`} className="sh-search-group">
                      <p id={`${ids}-gg`} className="sh-search-gtitle t-mono" role="presentation">{t('groupNeeds')}</p>
                      <ul role="presentation" className="sh-search-rows">
                        <AnimatePresence mode="popLayout" initial={false}>
                          {results.goals.map((g, i) => (
                            <m.li key={g.key} role="presentation" {...rowMotion(reduce, i + 4)}>
                              <div {...optionProps(options[offset.goals + i], offset.goals + i)}>
                                <NeedIcon need={g.key} size={20} className="sh-search-icon" />
                                <span className="sh-search-label">{t(`need.${g.key}`)}</span>
                                {g.count != null && <span className="sh-search-count t-mono">{g.count}</span>}
                              </div>
                            </m.li>
                          ))}
                        </AnimatePresence>
                      </ul>
                    </div>
                  )}
                </div>

                {options[options.length - 1]?.kind === 'all' && (
                  <div role="group" aria-label={t('shell.searchAll')} className="sh-search-group sh-search-group--all">
                    <div {...optionProps(options[options.length - 1], options.length - 1)}>
                      <span className="sh-search-label">{tf('shell.searchAllCount', { n: results.total, unit: unit(results.total) })}</span>
                      <ArrowRight size={18} />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <p className="sr-only" aria-live="polite">
            {results ? (hasResults ? tf('shell.searchFound', { n: results.total, unit: unit(results.total) }) : t('nothingFound')) : ''}
          </p>

          {noResults && (
            <m.div className="sh-search-none" initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <p className="sh-search-none-title">{tf('shell.searchNone', { q: trimmed })}</p>
              <p className="sh-search-none-text">{t('shell.searchNoneText')}</p>
              {goalChips}
              <div className="sh-search-none-links">
                <Link to="/shop" className="sh-search-more" onClick={onClose}>
                  {t('shell.allProducts')} <ArrowRight size={18} />
                </Link>
                {contacts.tgUrl && (
                  <a href={contacts.tgUrl} className="sh-search-more" target="_blank" rel="noopener noreferrer">
                    <Telegram size={18} /> {t('shell.askTelegram')} <ArrowUpRight size={16} />
                  </a>
                )}
              </div>
            </m.div>
          )}

          {!results && (
            <div className="sh-search-idle">
              {recent.length > 0 && (
                <section className="sh-search-section">
                  <h2 className="sh-search-gtitle t-mono">{t('shell.recent')}</h2>
                  <ul className="sh-search-recent" role="list">
                    <AnimatePresence initial={false}>
                      {recent.map((text) => (
                        <m.li key={text} layout={reduce ? false : 'position'} exit={{ opacity: 0, x: -8, transition: { duration: 0.14 } }}>
                          <button type="button" className="sh-search-recent-q" onClick={() => { setQuery(text); inputRef.current?.focus(); }}>
                            <Clock size={18} />
                            <span>{text}</span>
                          </button>
                          <button type="button" className="sh-search-recent-x" onClick={() => forget(text)} aria-label={tf('shell.forget', { q: text })}>
                            <Close size={16} />
                          </button>
                        </m.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                </section>
              )}
              <section className="sh-search-section">
                <h2 className="sh-search-gtitle t-mono">{t('groupNeeds')}</h2>
                {goalChips}
              </section>
              <Link to="/brands" className="sh-search-more" onClick={onClose}>
                {t('allBrands')}
                {taxonomy?.brands?.length ? <span className="sh-search-count t-mono">{taxonomy.brands.length}</span> : null}
                <ArrowRight size={18} />
              </Link>
            </div>
          )}
        </div>
      </m.div>
    </div>
  );
}

/**
 * Site search: a sheet from the top on desktop, full screen on phones. Opened through useSearch().openSearch.
 * Results are grouped (products, brands, goals) and keyboard driven as a combobox; Enter without a
 * highlighted row searches the full catalogue (/shop?q=…).
 */
export default function SearchOverlay({ open, initialQuery, session, opener, onClose }) {
  return createPortal(
    <AnimatePresence>
      {open && <Overlay key={session} initialQuery={initialQuery} opener={opener} onClose={onClose} />}
    </AnimatePresence>,
    document.body
  );
}
