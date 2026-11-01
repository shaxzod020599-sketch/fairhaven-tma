import React, { useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useInView } from 'motion/react';
import { useI18n } from '../i18n/index.jsx';
import { useTaxonomy, NEED_KEYS } from '../catalog/index.js';
import { Reveal, Stagger } from '../motion/index.js';
import { REVEAL } from '../motion/easings.js';
import { Wordmark } from './ui/Wordmark.jsx';
import { Phone, Telegram, Clock, ArrowUpRight } from './Icons.jsx';
import LanguageSwitch from './shell/LanguageSwitch.jsx';
import { useContacts } from './shell/contacts.js';
import './Footer.css';

function Column({ title, links }) {
  return (
    <Reveal as="nav" className="ftr-col" aria-label={title}>
      <h2 className="ftr-title t-mono">{title}</h2>
      <ul className="ftr-list" role="list">
        {links.map((l) => (
          <li key={l.label}>
            {l.href ? (
              <a href={l.href} target="_blank" rel="noopener" className="ftr-link">
                {l.label}
              </a>
            ) : (
              <Link to={l.to} className="ftr-link">
                {l.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Reveal>
  );
}

/**
 * Site footer on the dark stage: the big wordmark (its sun rises as the footer comes into view), four
 * link columns with counts from the catalogue, contacts from the public settings, language and ©.
 */
export default function Footer() {
  const { t, lang } = useI18n();
  const { taxonomy } = useTaxonomy();
  const contacts = useContacts();
  const markRef = useRef(null);
  const markSeen = useInView(markRef, { once: true, margin: REVEAL.margin });
  const year = new Date().getFullYear();

  const columns = useMemo(() => {
    const needs = taxonomy?.needs?.length
      ? [...taxonomy.needs].sort((a, b) => b.count - a.count).map((n) => n.key)
      : NEED_KEYS;
    const brands = (taxonomy?.brands || []).slice(0, 6);
    return [
      {
        title: t('catalog'),
        links: [...needs.slice(0, 6).map((k) => ({ to: `/shop/${k}`, label: t(`need.${k}`) })), { to: '/shop', label: t('shell.allProducts') }],
      },
      {
        title: t('brands'),
        links: [...brands.map((b) => ({ to: `/brands/${b.slug}`, label: b.name })), { to: '/brands', label: t('allBrands') }],
      },
      {
        title: t('shell.forBuyers'),
        links: [
          // Each lands on its group of the FAQ page (pages/FAQ.jsx ids).
          ...['delivery', 'payment', 'returns', 'usage'].map((id) => ({ to: `/faq#${id}`, label: t(`pages.faq.g.${id}`) })),
          { to: '/faq', label: t('shell.faq') },
          { to: '/contact', label: t('navContact') },
          { to: '/account', label: t('account') },
        ],
      },
      {
        title: t('shell.company'),
        links: [
          { to: '/about', label: t('shell.about') },
          { to: '/learn', label: t('journal') },
          { href: lang === 'uz' ? '/legal/oferta-uz' : '/legal/oferta-ru', label: t('shell.oferta') },
          { href: '/legal/oferta-ru', label: t('shell.terms') },
        ],
      },
    ];
  }, [taxonomy, t, lang]);

  return (
    <footer className="ftr stage">
      <div className="container">
        <div className="ftr-top">
          <div className="ftr-brand" ref={markRef}>
            {/* Remounting replays the sun's rise once the footer is actually on screen. */}
            <Wordmark key={markSeen ? 'seen' : 'idle'} size={72} style={{ '--wordmark': 'clamp(48px, 11vw, 72px)' }} className="ftr-mark" aria-label={`FairHaven, ${t('home')}`} />
            <Reveal as="p" className="ftr-tagline">{t('shell.footerTagline')}</Reveal>
          </div>

          <Reveal as="address" className="ftr-contacts">
            {contacts.tel && (
              <a href={contacts.tel} className="ftr-contact ftr-contact--phone">
                <Phone size={22} />
                <span className="t-num">{contacts.phone}</span>
              </a>
            )}
            {contacts.tgUrl && (
              <a href={contacts.tgUrl} className="ftr-contact" target="_blank" rel="noopener noreferrer">
                <Telegram size={22} />
                <span>{contacts.tg}</span>
                <ArrowUpRight size={16} className="ftr-ext" />
              </a>
            )}
            {contacts.hours && (
              <p className="ftr-contact ftr-hours">
                <Clock size={22} />
                <span>{contacts.hours}</span>
              </p>
            )}
          </Reveal>
        </div>

        <Stagger className="ftr-cols">
          {columns.map((c) => (
            <Column key={c.title} title={c.title} links={c.links} />
          ))}
        </Stagger>

        <div className="ftr-bottom">
          <LanguageSwitch />
          <p className="ftr-copy t-mono">© {year} FairHaven</p>
        </div>
      </div>
    </footer>
  );
}
