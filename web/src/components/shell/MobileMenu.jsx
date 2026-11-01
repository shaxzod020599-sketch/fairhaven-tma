import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { m, useReducedMotion } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTaxonomy, NEED_KEYS, KIND_KEYS } from '../../catalog/index.js';
import { EASE_OUT } from '../../motion/easings.js';
import Sheet from '../ui/Sheet.jsx';
import Accordion from '../ui/Accordion.jsx';
import { ArrowRight, NeedIcon, KindIcon, Phone, Telegram, Clock } from '../Icons.jsx';
import LanguageSwitch from './LanguageSwitch.jsx';
import { Avatar } from './AccountButton.jsx';
import { countsBy } from './shots.js';
import { useContacts } from './contacts.js';
import './MobileMenu.css';

const list = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.04, delayChildren: 0.08 } },
};
const item = {
  hidden: { opacity: 0, x: 24 },
  shown: { opacity: 1, x: 0, transition: { duration: 0.36, ease: EASE_OUT } },
};

function LinkList({ links, onNavigate }) {
  return (
    <ul className="sh-mm-sublist" role="list">
      {links.map((l) => (
        <li key={l.to}>
          <Link to={l.to} className="sh-mm-sublink" onClick={onNavigate}>
            {l.icon}
            <span className="sh-mm-sublabel">{l.label}</span>
            {l.count != null && <span className="sh-mm-count t-mono">{l.count}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Phone and tablet menu (below 1080 px): a full-height sheet from the right. Catalogue groups fold open
 * in place; plain pages follow in large type; contacts and the language switch close it off.
 */
export default function MobileMenu({ open, onClose }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { taxonomy } = useTaxonomy();
  const contacts = useContacts();
  const reduce = useReducedMotion();

  const groups = useMemo(() => {
    const needs = countsBy(taxonomy?.needs);
    const kinds = countsBy(taxonomy?.kinds);
    const brands = [...(taxonomy?.brands || [])].sort((a, b) => a.name.localeCompare(b.name, lang === 'uz' ? 'uz' : 'ru'));
    return [
      {
        id: 'needs',
        title: t('groupNeeds'),
        links: [
          ...NEED_KEYS.map((k) => ({ to: `/shop/${k}`, label: t(`need.${k}`), count: needs.get(k), icon: <NeedIcon need={k} size={20} className="sh-mm-icon" /> })),
          { to: '/shop', label: t('shell.allProducts'), count: taxonomy?.total, icon: <ArrowRight size={20} className="sh-mm-icon" /> },
        ],
      },
      {
        id: 'kinds',
        title: t('groupKinds'),
        links: KIND_KEYS.map((k) => ({ to: `/shop?kind=${k}`, label: t(`kind.${k}`), count: kinds.get(k), icon: <KindIcon kind={k} size={20} className="sh-mm-icon" /> })),
      },
      {
        id: 'brands',
        title: t('groupBrands'),
        links: [
          ...brands.map((b) => ({ to: `/brands/${b.slug}`, label: b.name, count: b.count })),
          { to: '/brands', label: t('allBrands'), icon: <ArrowRight size={20} className="sh-mm-icon" /> },
        ],
      },
    ];
  }, [taxonomy, t, lang]);

  const pages = [
    { to: '/brands/fairhaven-health', label: 'Fairhaven Health' },
    { to: '/learn', label: t('journal') },
    { to: '/about', label: t('shell.about') },
    { to: '/faq#delivery', label: t('shell.delivery') },
    { to: '/contact', label: t('navContact') },
  ];

  const motionProps = reduce ? {} : { variants: list, initial: 'hidden', animate: 'shown' };
  const itemProps = reduce ? {} : { variants: item };

  return (
    <Sheet open={open} onClose={onClose} side="right" label={t('menu')} className="sh-mm">
      <m.ul className="sh-mm-list" role="list" {...motionProps}>
        <m.li {...itemProps}>
          <Accordion
            className="sh-mm-acc"
            headingLevel={2}
            items={groups.map((g) => ({ id: g.id, title: g.title, content: <LinkList links={g.links} onNavigate={onClose} /> }))}
          />
        </m.li>
        {pages.map((p) => (
          <m.li key={p.to} {...itemProps}>
            <Link to={p.to} className="sh-mm-link" onClick={onClose}>
              {p.label}
            </Link>
          </m.li>
        ))}
        <m.li {...itemProps}>
          <Link to="/account" className="sh-mm-link sh-mm-link--account" onClick={onClose}>
            {user && <Avatar user={user} size={36} />}
            {user ? user.firstName || t('account') : t('signIn')}
          </Link>
        </m.li>
        {user?.role === 'admin' && (
          <m.li {...itemProps}>
            <Link to="/admin" className="sh-mm-link sh-mm-link--small" onClick={onClose}>
              {t('shell.adminPanel')}
            </Link>
          </m.li>
        )}
        <m.li {...itemProps} className="sh-mm-contacts">
          {contacts.tel && (
            <a href={contacts.tel} className="sh-mm-contact">
              <Phone size={20} />
              <span className="t-num">{contacts.phone}</span>
            </a>
          )}
          {contacts.tgUrl && (
            <a href={contacts.tgUrl} className="sh-mm-contact" target="_blank" rel="noopener noreferrer">
              <Telegram size={20} />
              <span>{contacts.tg}</span>
            </a>
          )}
          {contacts.hours && (
            <p className="sh-mm-contact sh-mm-hours">
              <Clock size={20} />
              <span>{contacts.hours}</span>
            </p>
          )}
          <LanguageSwitch size="lg" className="sh-mm-lang" />
        </m.li>
      </m.ul>
    </Sheet>
  );
}
