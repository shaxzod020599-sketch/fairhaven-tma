import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { useI18n } from '../i18n/index.jsx';
import { BRANDS } from '../catalog/index.js';
import { useSeo } from '../seo/useSeo.js';
import { useHeaderTone } from '../components/shell/HeaderTone.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { ArrowRight, Close, Search, ShieldCheck } from '../components/Icons.jsx';
import { Button, EmptyState, Skeleton } from '../components/ui/index.js';
import { DURATION, EASE_OUT, REVEAL } from '../motion/index.js';
import { FAIRHAVEN_HEALTH_FACTS } from '../content/about.js';
import { FH_SLUG, brandMatches, useBrandDirectory } from './brands/useBrandDirectory.js';
import BrandTile, { useCountryLine } from './brands/BrandTile.jsx';
import PackFan from './brands/PackFan.jsx';
import LetterIndex, { letterId } from './brands/LetterIndex.jsx';
import './brands/Brands.css';

const FOUNDED = FAIRHAVEN_HEALTH_FACTS.find((f) => f.key === 'founded');

/** The letter of the group at the top of the viewport, under the header and the letter bar. */
function useActiveLetter(letters) {
  const [active, setActive] = useState(null);
  const key = letters.join('');
  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      // A jump parks the group a little below the bar (its scroll margin also leaves room for the header).
      const line = (document.querySelector('.bx-letters')?.getBoundingClientRect().bottom || 0) + 100;
      // Desktop flows the groups into columns, so several can cross the line: the first one (left column) wins.
      let current = null;
      let crossing = null;
      for (const letter of letters) {
        const el = document.getElementById(letterId(letter));
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top <= line) current = letter;
        if (!crossing && top <= line && (el.parentElement?.getBoundingClientRect().bottom ?? 0) > line) crossing = letter;
      }
      setActive(crossing || current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return active;
}

function FeaturedBrand({ brand }) {
  const { t, lang, plural } = useI18n();
  const countryLine = useCountryLine()(brand.country);
  return (
    <Link to={`/brands/${FH_SLUG}`} className="bx-featured bx-fan-host">
      <span className="bx-featured-badge">
        <ShieldCheck size={18} />
        {t('brands.official')}
      </span>
      <h2 className="bx-featured-name">{brand.name}</h2>
      <span className="bx-featured-line">{t('brands.officialFull')}</span>
      <span className="bx-featured-meta t-mono">
        {FOUNDED && <span>{FOUNDED[lang] || FOUNDED.ru}</span>}
        {countryLine && <span>{countryLine}</span>}
        <span className="t-num">
          {brand.count} {plural(brand.count, t('unitProducts'))}
        </span>
      </span>
      {/* Open: a closed stack of white plinths showed mostly their edges. */}
      <PackFan shots={brand.shots.slice(0, 3)} size="lg" open className="bx-featured-fan" />
      <span className="bx-featured-cta">
        {t('brands.featured.cta')}
        <ArrowRight size={20} />
      </span>
    </Link>
  );
}

export default function Brands() {
  useSeo();
  useHeaderTone('stage');
  const { t, tf, plural } = useI18n();
  const reduce = useReducedMotion();
  const { brands, status, reload, productCount } = useBrandDirectory();
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  // Before the catalogue arrives the registry count stands in; both list the same brands.
  const brandCount = brands.length || BRANDS.length;
  const featured = brands.find((b) => b.slug === FH_SLUG);
  const groups = useMemo(() => {
    const map = new Map();
    const sorted = [...brands].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
    for (const brand of sorted) {
      if (!brandMatches(brand, query)) continue;
      if (!map.has(brand.letter)) map.set(brand.letter, []);
      map.get(brand.letter).push(brand);
    }
    return [...map];
  }, [brands, query]);
  const available = useMemo(() => new Set(groups.map(([letter]) => letter)), [groups]);
  const found = groups.reduce((n, [, list]) => n + list.length, 0);
  const active = useActiveLetter(groups.map(([letter]) => letter));

  const jump = (letter) => {
    const heading = document.getElementById(letterId(letter));
    if (!heading) return;
    heading.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    heading.focus({ preventScroll: true });
  };

  const brandsLabel = (n) => tf('brands.hero.title', { count: n, unit: plural(n, t('brands.unit')) });
  const productsLabel = (n) => `${n} ${plural(n, t('unitProducts'))}`;

  let index;
  if (status === 'loading' && !brands.length) {
    index = (
      <ul className="bx-group-list bx-group-list--loading" aria-busy="true" aria-label={t('loading')}>
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i}>
            <Skeleton h={200} r="var(--r-card)" />
          </li>
        ))}
      </ul>
    );
  } else if (!brands.length) {
    index = (
      <EmptyState
        title={t('loadError')}
        action={<Button variant="secondary" onClick={reload}>{t('retry')}</Button>}
      />
    );
  } else if (!groups.length) {
    index = (
      <EmptyState
        title={t('brands.search.empty')}
        text={t('brands.search.emptyText')}
        action={
          <Button
            variant="secondary"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
          >
            {t('brands.search.reset')}
          </Button>
        }
      />
    );
  } else {
    index = (
      <div className="bx-groups">
        {groups.map(([letter, list]) => (
          <section key={letter} className="bx-group" aria-labelledby={letterId(letter)}>
            <h2 id={letterId(letter)} className="bx-group-letter" tabIndex={-1}>
              <span aria-hidden="true">{letter}</span>
              <span className="sr-only">{tf('brands.letterGroup', { letter })}</span>
            </h2>
            <ul className="bx-group-list">
              <AnimatePresence mode="popLayout">
                {list.map((brand, i) => (
                  <m.li
                    key={brand.slug}
                    layout
                    initial={reduce ? false : { opacity: 0.001, y: REVEAL.y }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: REVEAL.margin }}
                    exit={{ opacity: 0, scale: 0.96, transition: { duration: DURATION.hover } }}
                    transition={{ duration: DURATION.reveal, ease: EASE_OUT, delay: Math.min(i * REVEAL.stagger, REVEAL.maxStagger) }}
                    className="bx-group-item"
                  >
                    <BrandTile brand={brand} variant="index" />
                  </m.li>
                ))}
              </AnimatePresence>
            </ul>
          </section>
        ))}
      </div>
    );
  }

  return (
    <>
      <section className="stage bx-hero">
        <div className="bx-hero-sky" aria-hidden="true">
          <m.span
            className="bx-hero-sun"
            initial={reduce ? false : { y: '40%', scale: 0.92 }}
            animate={{ y: '0%', scale: 1 }}
            transition={{ duration: DURATION.hero, ease: EASE_OUT }}
          />
          <span className="bx-hero-horizon" />
        </div>
        <div className="container bx-hero-inner">
          <Breadcrumbs trail={[{ label: t('home'), to: '/' }, { label: t('brands.title') }]} />
          <div className="bx-hero-grid">
            <div className="bx-hero-copy">
              <h1 className="t-hero bx-hero-title">{brandsLabel(brandCount)}</h1>
              {productCount ? (
                <p className="bx-hero-lead">
                  {tf('brands.hero.lead', { products: productCount, unit: plural(productCount, t('unitProducts')) })}
                </p>
              ) : (
                status === 'loading' && <Skeleton h={22} w="min(420px, 80%)" />
              )}
            </div>
            {featured ? (
              <FeaturedBrand brand={featured} />
            ) : (
              status === 'loading' && <Skeleton h={420} r="var(--r-card)" className="bx-featured-skeleton" />
            )}
          </div>
        </div>
      </section>

      <section className="section bx-index">
        <div className="container">
          <div className="bx-tools">
            <div className="bx-search">
              <label htmlFor="bx-search-input" className="sr-only">
                {t('brands.search.label')}
              </label>
              <Search size={20} className="bx-search-icon" />
              <input
                ref={inputRef}
                id="bx-search-input"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('brands.search.placeholder')}
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="search"
              />
              {query && (
                <button
                  type="button"
                  className="bx-search-clear"
                  aria-label={t('brands.search.clear')}
                  title={t('brands.search.clear')}
                  onClick={() => {
                    setQuery('');
                    inputRef.current?.focus();
                  }}
                >
                  <Close size={18} />
                </button>
              )}
            </div>
            <p className="bx-found t-mono" aria-live="polite">
              {query
                ? tf('brands.search.found', { count: found })
                : brands.length
                  ? `${brandsLabel(brands.length)} · ${productsLabel(productCount)}`
                  : ''}
            </p>
          </div>
          <LetterIndex available={available} active={active} onJump={jump} />
          {index}
        </div>
      </section>
    </>
  );
}
