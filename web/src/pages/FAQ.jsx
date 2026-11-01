import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useReducedMotion } from 'motion/react';
import { useI18n } from '../i18n/index.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { Close, Phone, Search, Telegram } from '../components/Icons.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useContacts } from '../components/shell/contacts.js';
import { Accordion, Button, EmptyState, IconButton } from '../components/ui/index.js';
import { formatSum, fold } from '../catalog/index.js';
import { useSeo } from '../seo/useSeo.js';
import { withHours } from './info/hours.js';
import './info/FAQ.css';

const GROUPS = [
  { id: 'delivery', items: ['where', 'cost', 'time'] },
  { id: 'payment', items: ['pay', 'prepay'] },
  { id: 'returns', items: ['return', 'damaged'] },
  { id: 'usage', items: ['original', 'doctor', 'contra'] },
];
// The fixed fee below the free-delivery threshold, as charged by Cart and Checkout (their DELIVERY_FEE).
const DELIVERY_FEE = 25000;

/** The group whose section sits under the top of the viewport, for the side nav. */
function useActiveGroup(ids) {
  const [active, setActive] = useState(ids[0]);
  const key = ids.join('|');
  useEffect(() => {
    const nodes = key.split('|').map((id) => document.getElementById(id)).filter(Boolean);
    if (!nodes.length || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: '-20% 0px -65% 0px' }
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [key]);
  return active;
}

export default function FAQ() {
  useSeo();
  const { t, tf, lang } = useI18n();
  const { get } = useSettings();
  const { phone, tel, tgUrl, hours } = useContacts();
  const { hash } = useLocation();
  const reduce = useReducedMotion();
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const threshold = formatSum(Number(get('free_delivery_threshold')) || 500000, lang);
    const fee = formatSum(DELIVERY_FEE, lang);
    return GROUPS.map((g) => ({
      id: g.id,
      title: t(`pages.faq.g.${g.id}`),
      items: g.items.map((id) => ({
        id,
        q: t(`pages.faq.${id}.q`),
        a: id === 'cost' ? tf('pages.faq.cost.a', { threshold, fee }) : t(`pages.faq.${id}.a`),
      })),
    }));
  }, [t, tf, get, lang]);

  const needle = fold(query).trim();
  const shown = useMemo(() => {
    if (!needle) return groups;
    const words = needle.split(/\s+/);
    const hit = (item) => {
      const hay = fold(`${item.q} ${item.a}`);
      return words.every((w) => hay.includes(w));
    };
    return groups.map((g) => ({ ...g, items: g.items.filter(hit) })).filter((g) => g.items.length);
  }, [groups, needle]);
  const found = shown.reduce((n, g) => n + g.items.length, 0);
  const active = useActiveGroup(shown.map((g) => g.id));

  // ScrollToTop runs first on arrival, so a /faq#payment link scrolls to its group here, a frame later.
  useEffect(() => {
    const id = hash.slice(1);
    if (!id) return undefined;
    const frame = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
    return () => cancelAnimationFrame(frame);
  }, [hash]);

  const jump = (e, id) => {
    e.preventDefault();
    const section = document.getElementById(id);
    if (!section) return;
    section.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    section.querySelector('h2')?.focus({ preventScroll: true });
    window.history.replaceState(window.history.state, '', `#${id}`);
  };

  return (
    <div className="fq-page">
      <div className="container">
        <Breadcrumbs trail={[{ label: t('home'), to: '/' }, { label: t('pages.faq.title') }]} />
        <header className="fq-head">
          <h1 className="fq-title">{t('pages.faq.title')}</h1>
          <p className="fq-lead t-muted">{t('pages.faq.lead')}</p>
        </header>

        <div className="fq-layout">
          <aside className="fq-side">
            <div className="fq-filter" role="search">
              <label htmlFor="fq-filter-input" className="sr-only">{t('pages.faq.filter')}</label>
              <Search size={20} className="fq-filter-icon" aria-hidden="true" />
              <input
                id="fq-filter-input"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('pages.faq.filterHint')}
                autoComplete="off"
                enterKeyHint="search"
              />
              {query && (
                <IconButton label={t('pages.faq.clear')} size="sm" className="fq-filter-clear" onClick={() => setQuery('')}>
                  <Close size={18} />
                </IconButton>
              )}
            </div>
            <p className="fq-found t-mono" aria-live="polite">
              {needle ? tf('pages.faq.found', { n: found }) : ''}
            </p>
            {shown.length > 0 && (
              <nav className="fq-nav" aria-label={t('pages.faq.nav')}>
                <ul>
                  {shown.map((g) => (
                    <li key={g.id}>
                      <a
                        href={`#${g.id}`}
                        className={`fq-nav-link${active === g.id ? ' is-active' : ''}`}
                        aria-current={active === g.id ? 'true' : undefined}
                        onClick={(e) => jump(e, g.id)}
                      >
                        <span>{g.title}</span>
                        <span className="fq-nav-count t-mono">{g.items.length}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </aside>

          <div className="fq-main">
            {shown.length === 0 ? (
              <EmptyState
                icon={<Search size={28} />}
                title={t('pages.faq.empty')}
                text={t('pages.faq.emptyText')}
                action={<Button variant="secondary" onClick={() => setQuery('')}>{t('pages.faq.clear')}</Button>}
              />
            ) : (
              shown.map((g) => (
                <section key={g.id} id={g.id} className="fq-group" aria-labelledby={`fq-g-${g.id}`}>
                  <h2 id={`fq-g-${g.id}`} className="fq-group-title" tabIndex={-1}>{g.title}</h2>
                  <Accordion
                    key={needle}
                    multiple
                    headingLevel={3}
                    defaultOpen={needle ? g.items.map((i) => i.id) : []}
                    items={g.items.map((i) => ({ id: i.id, title: i.q, content: <p>{i.a}</p> }))}
                  />
                </section>
              ))
            )}

            <section className="stage fq-ask" aria-labelledby="fq-ask-title">
              <h2 id="fq-ask-title" className="fq-ask-title">{t('pages.faq.askTitle')}</h2>
              <p className="fq-ask-text">{withHours(tf, 'pages.faq.askText', hours)}</p>
              <div className="fq-ask-actions">
                {tgUrl && (
                  <Button variant="stage" href={tgUrl} target="_blank" rel="noopener noreferrer" iconStart={<Telegram size={20} />}>
                    {t('pages.contact.telegram')}
                  </Button>
                )}
                {tel && (
                  <Button variant="ghost" href={tel} iconStart={<Phone size={20} />}>
                    {phone}
                  </Button>
                )}
                <Link to="/contact" className="fq-ask-link">{t('pages.faq.askContacts')}</Link>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
