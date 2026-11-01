import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { useCatalog, useTaxonomy, NEED_KEYS, KIND_KEYS } from '../../catalog/index.js';
import { DURATION, EASE_OUT, SPRING } from '../../motion/easings.js';
import { ArrowRight, ChevronDown, NeedIcon, KindIcon } from '../Icons.jsx';
import { pickShots, countsBy } from './shots.js';
import './MegaMenu.css';

const OPEN_DELAY = 150; // hover intent: a pointer passing over the trigger does not open the panel
const CLOSE_DELAY = 220;
const FH = 'fairhaven-health';

const panelMotion = (reduce) =>
  reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: -10, clipPath: 'inset(0% 0% 100% 0%)' },
        animate: { opacity: 1, y: 0, clipPath: 'inset(0% 0% 0% 0%)', transition: { duration: DURATION.ui + 0.06, ease: EASE_OUT, when: 'beforeChildren', staggerChildren: 0.05 } },
        exit: { opacity: 0, y: -6, clipPath: 'inset(0% 0% 100% 0%)', transition: { duration: 0.18, ease: EASE_OUT } },
      };

const column = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: DURATION.ui, ease: EASE_OUT } },
};

function Shots({ items }) {
  return (
    <div className="sh-shots" aria-hidden="true">
      {items.map((p, i) => (
        <m.span
          key={p._id}
          className="sh-shot"
          initial={{ opacity: 0, y: 14, rotate: (i - 1) * 2 }}
          animate={{ opacity: 1, y: 0, rotate: (i - 1) * 4 }}
          transition={{ ...SPRING.soft, delay: i * 0.05 }}
        >
          <img src={p.image} alt="" loading="lazy" decoding="async" draggable="false" />
        </m.span>
      ))}
    </div>
  );
}

/** Right-hand tile: the Fairhaven Health partner promo, or a preview of the goal under the pointer. */
function PromoTile({ goal, products, needCounts, onNavigate }) {
  const { t, tf, plural } = useI18n();
  const fhShots = useMemo(() => pickShots(products, 3, (p) => p.brandSlug === FH), [products]);
  const goalShots = useMemo(() => (goal ? pickShots(products, 3, (p) => p.needs?.includes(goal)) : []), [products, goal]);
  const count = goal ? needCounts.get(goal) || 0 : 0;

  return (
    <div className="sh-promo stage">
      <AnimatePresence mode="wait" initial={false}>
        {goal ? (
          <m.div
            key={goal}
            className="sh-promo-inner"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
          >
            <Shots items={goalShots} />
            <div className="sh-promo-text">
              <p className="sh-promo-count t-mono">{tf('shell.goalCount', { n: count, unit: plural(count, t('unitProducts')) })}</p>
              <p className="sh-promo-title">{t(`need.${goal}`)}</p>
              <p className="sh-promo-desc">{t(`needDesc.${goal}`)}</p>
              <Link to={`/shop/${goal}`} className="sh-promo-cta" onClick={onNavigate} tabIndex={-1}>
                {t('shell.view')} <ArrowRight size={18} />
              </Link>
            </div>
          </m.div>
        ) : (
          <m.div
            key="fh"
            className="sh-promo-inner"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
          >
            <Shots items={fhShots} />
            <div className="sh-promo-text">
              <p className="sh-promo-title">{t('shell.fhPromoTitle')}</p>
              <p className="sh-promo-desc">{t('shell.fhPromoText')}</p>
              <Link to={`/brands/${FH}`} className="sh-promo-cta" onClick={onNavigate}>
                {t('shell.fhPromoCta')} <ArrowRight size={18} />
              </Link>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * «Каталог» trigger and its panel. Opens on hover intent (150 ms), click, Enter, Space or ArrowDown;
 * Esc, a click outside, tabbing out or any navigation closes it. Opening from the keyboard moves focus
 * to the first link. `onOpenChange` lets the header stay solid and visible while it is open.
 */
export default function MegaMenu({ onOpenChange }) {
  const { t } = useI18n();
  const { products } = useCatalog();
  const { taxonomy } = useTaxonomy();
  const reduce = useReducedMotion();
  const location = useLocation();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState(null);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const timer = useRef(0);
  const focusFirst = useRef(false);

  const needCounts = useMemo(() => countsBy(taxonomy?.needs), [taxonomy]);
  const kindCounts = useMemo(() => countsBy(taxonomy?.kinds), [taxonomy]);
  const topBrands = useMemo(() => (taxonomy?.brands || []).slice(0, 10), [taxonomy]);

  const clear = () => window.clearTimeout(timer.current);
  const show = useCallback((viaKeyboard = false) => {
    clear();
    focusFirst.current = viaKeyboard;
    setOpen(true);
  }, []);
  const hide = useCallback((returnFocus = false) => {
    clear();
    setOpen(false);
    setGoal(null);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => onOpenChange?.(open), [open, onOpenChange]);
  useEffect(() => hide(), [location.pathname, location.search, hide]);
  useEffect(() => clear, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) hide();
    };
    // On the document: a hover-opened panel has no focus inside it to catch the key.
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      hide(!!wrapRef.current?.contains(document.activeElement));
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, hide]);

  // Runs once the panel exists in the DOM.
  const onPanelShown = () => {
    if (!focusFirst.current) return;
    focusFirst.current = false;
    panelRef.current?.querySelector('a')?.focus();
  };
  useEffect(() => {
    if (open && reduce) onPanelShown();
  });

  const isMouse = (e) => e.pointerType === 'mouse';
  const onEnter = (e) => {
    if (!isMouse(e)) return;
    clear();
    if (!open) timer.current = window.setTimeout(() => show(false), OPEN_DELAY);
  };
  const onLeave = (e) => {
    if (!isMouse(e)) return;
    clear();
    if (open) timer.current = window.setTimeout(() => hide(), CLOSE_DELAY);
  };

  const onTriggerKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (open) panelRef.current?.querySelector('a')?.focus();
      else show(true);
    }
  };
  const onTriggerClick = (e) => {
    // A keyboard "click" (Enter / Space) has no pointer position.
    const keyboard = e.detail === 0;
    if (open) hide();
    else show(keyboard);
  };
  const onBlur = (e) => {
    if (open && e.relatedTarget && !wrapRef.current?.contains(e.relatedTarget)) hide();
  };

  const close = () => hide();

  return (
    <div className="sh-mega-item" ref={wrapRef} onPointerEnter={onEnter} onPointerLeave={onLeave} onBlur={onBlur}>
      <button
        ref={triggerRef}
        type="button"
        className={`sh-nav-link sh-mega-trigger${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onTriggerClick}
        onKeyDown={onTriggerKey}
      >
        {t('catalog')}
        <ChevronDown size={16} className="sh-mega-caret" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <m.div
              key="scrim"
              className="sh-mega-scrim"
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.ui }}
              onPointerDown={close}
            />
            <m.div
              key="panel"
              ref={panelRef}
              id={panelId}
              role="region"
              aria-label={t('catalog')}
              className="sh-mega"
              {...panelMotion(reduce)}
              onAnimationComplete={onPanelShown}
            >
              <div className="container sh-mega-grid">
                <m.section className="sh-mega-col sh-mega-col--goals" variants={reduce ? undefined : column}>
                  <h2 className="sh-mega-title t-mono">{t('groupNeeds')}</h2>
                  <ul className="sh-mega-list" role="list" onPointerLeave={() => setGoal(null)}>
                    {NEED_KEYS.map((key) => (
                      <li key={key}>
                        <Link
                          to={`/shop/${key}`}
                          className={`sh-mega-link${goal === key ? ' is-active' : ''}`}
                          onClick={close}
                          onPointerEnter={() => setGoal(key)}
                          onFocus={() => setGoal(key)}
                        >
                          <NeedIcon need={key} size={20} className="sh-mega-icon" />
                          <span className="sh-mega-label">{t(`need.${key}`)}</span>
                          {needCounts.has(key) && <span className="sh-mega-count t-mono">{needCounts.get(key)}</span>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Link to="/shop" className="sh-mega-all" onClick={close} onFocus={() => setGoal(null)}>
                    {t('famAll')}
                    {taxonomy?.total ? <span className="sh-mega-count t-mono">{taxonomy.total}</span> : null}
                    <ArrowRight size={18} />
                  </Link>
                </m.section>

                <m.section className="sh-mega-col" variants={reduce ? undefined : column} onFocus={() => setGoal(null)}>
                  <h2 className="sh-mega-title t-mono">{t('groupKinds')}</h2>
                  <ul className="sh-mega-list" role="list">
                    {KIND_KEYS.map((key) => (
                      <li key={key}>
                        <Link to={`/shop?kind=${key}`} className="sh-mega-link" onClick={close}>
                          <KindIcon kind={key} size={20} className="sh-mega-icon" />
                          <span className="sh-mega-label">{t(`kind.${key}`)}</span>
                          {kindCounts.has(key) && <span className="sh-mega-count t-mono">{kindCounts.get(key)}</span>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </m.section>

                <m.section className="sh-mega-col" variants={reduce ? undefined : column} onFocus={() => setGoal(null)}>
                  <h2 className="sh-mega-title t-mono">{t('groupBrands')}</h2>
                  <ul className="sh-mega-list sh-mega-list--plain" role="list">
                    {topBrands.map((b) => (
                      <li key={b.slug}>
                        <Link to={`/brands/${b.slug}`} className="sh-mega-link" onClick={close}>
                          <span className="sh-mega-label">{b.name}</span>
                          <span className="sh-mega-count t-mono">{b.count}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Link to="/brands" className="sh-mega-all" onClick={close}>
                    {t('allBrands')}
                    {taxonomy?.brands?.length ? <span className="sh-mega-count t-mono">{taxonomy.brands.length}</span> : null}
                    <ArrowRight size={18} />
                  </Link>
                </m.section>

                <m.div className="sh-mega-col sh-mega-col--promo" variants={reduce ? undefined : column} onFocus={() => setGoal(null)}>
                  <PromoTile goal={goal} products={products} needCounts={needCounts} onNavigate={close} />
                </m.div>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
