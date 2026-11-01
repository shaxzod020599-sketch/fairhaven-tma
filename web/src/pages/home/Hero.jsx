import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, m, useInView, useReducedMotion } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { useCatalog } from '../../catalog/index.js';
import { useSearch } from '../../components/shell/SearchContext.jsx';
import { countsBy } from '../../components/shell/shots.js';
import { Button } from '../../components/ui/index.js';
import { ArrowRight, NeedIcon, Search } from '../../components/Icons.jsx';
import { useMediaQuery, usePageVisible, tween } from '../../motion/index.js';
import { HOME } from '../../content/home.js';
import { useHomeFacts } from './useHomeFacts.js';
import Orbit, { pickOrbit } from './Orbit.jsx';
import TrustRow from './TrustRow.jsx';
import './Hero.css';

const HERO_GOALS = ['fertility', 'pregnancy', 'immunity', 'kids', 'beauty'];
const TOKEN = /\{(brands|products|threshold)\}/;

/** Admin copy with its tokens filled; the counts get their own span so the brand number can glow. */
function withTokens(text, values) {
  return String(text || '')
    .split(new RegExp(TOKEN.source, 'g'))
    .map((part, i) => {
      if (i % 2 === 0) return part;
      if (part === 'threshold') return values.threshold;
      return (
        <span key={i} className="hm-hero-num">
          {values[part]}
        </span>
      );
    });
}

/** The search field's placeholder: the admin hint first, then real queries one after another. */
function SearchPrompt({ hint }) {
  const { t, tf } = useI18n();
  const reduce = useReducedMotion();
  const visible = usePageVisible();
  const ref = useRef(null);
  const inView = useInView(ref);
  const lines = useMemo(
    () => [hint, ...t('home.search.queries').split('|').map((q) => tf('home.search.try', { q }))],
    [hint, t, tf]
  );
  const [i, setI] = useState(0);

  useEffect(() => {
    if (reduce || !visible || !inView) return undefined;
    const id = setInterval(() => setI((n) => (n + 1) % lines.length), 2600);
    return () => clearInterval(id);
  }, [reduce, visible, inView, lines.length]);

  const line = lines[i % lines.length];
  return (
    <span ref={ref} className="hm-search-text" aria-hidden="true">
      <AnimatePresence mode="popLayout" initial={false}>
        <m.span
          key={line}
          className="hm-search-line"
          initial={{ y: '110%', opacity: 0 }}
          animate={{ y: '0%', opacity: 1 }}
          exit={{ y: '-110%', opacity: 0 }}
          transition={tween()}
        >
          {line}
        </m.span>
      </AnimatePresence>
    </span>
  );
}

export default function Hero() {
  const { t, lang } = useI18n();
  const { openSearch } = useSearch();
  const { products, taxonomy } = useCatalog();
  const facts = useHomeFacts();
  const phone = useMediaQuery('(max-width: 599px)');
  const ref = useRef(null);

  const hero = facts.home.hero || {};
  const copy = (field) => hero[lang]?.[field] || hero.ru?.[field] || HOME.hero[lang][field];
  const needCounts = useMemo(() => countsBy(taxonomy?.needs), [taxonomy]);
  const showcase = facts.home.showcase?.productIds;
  const items = useMemo(
    () => pickOrbit(products, showcase, phone ? 8 : 12, phone ? 8 : 14),
    [products, showcase, phone]
  );

  return (
    <section ref={ref} className="hm-hero stage" aria-labelledby="hm-hero-title">
      <div className="container">
        <div className="hm-hero-grid">
          <h1 id="hm-hero-title" className="hm-hero-title">
            <span className="hm-hero-line">{withTokens(copy('line1'), facts.values)}</span>
            <span className="hm-hero-line">{withTokens(copy('line2'), facts.values)}</span>
          </h1>

          <div className="hm-hero-orbit">
            <Orbit items={items} trackRef={ref} compact={phone} />
          </div>

          <div className="hm-hero-body">
            <p className="hm-hero-sub">{withTokens(copy('sub'), facts.values)}</p>

            <button type="button" className="hm-search" onClick={() => openSearch()}>
              <span className="sr-only">{t('home.search.open')}</span>
              <Search size={22} className="hm-search-icon" />
              <SearchPrompt hint={copy('searchHint')} />
              <kbd className="hm-search-kbd t-mono" aria-hidden="true">/</kbd>
              <span className="hm-search-go" aria-hidden="true">
                <ArrowRight size={20} />
              </span>
            </button>

            <ul className="hm-goals" aria-label={t('home.hero.goals')}>
              {HERO_GOALS.map((key) => (
                <li key={key}>
                  <Link to={`/shop/${key}`} className="hm-goal">
                    <NeedIcon need={key} size={18} />
                    {t(`need.${key}`)}
                    {needCounts.get(key) > 0 && <span className="hm-goal-count t-mono">{needCounts.get(key)}</span>}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="hm-hero-ctas">
              <Button variant="stage" size="lg" magnetic to="/shop" iconEnd={<ArrowRight size={20} />}>
                {t('goToShop')}
              </Button>
              <Button variant="ghost" size="lg" to="/brands">
                {t('allBrands')}
              </Button>
            </div>
          </div>
        </div>

        <TrustRow items={facts.home.trust} fill={facts.fill} />
      </div>
    </section>
  );
}
