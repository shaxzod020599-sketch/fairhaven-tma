import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Globe, Package, ShieldCheck, Truck } from '../../components/Icons.jsx';
import { localized } from './useHomeFacts.js';
import './TrustRow.css';

// One icon per position of the admin's four facts: originals, official distributor, delivery, payment.
const ICONS = [ShieldCheck, Globe, Truck, Package];

/** The four admin-editable store facts under the hero, still on the stage. */
export default function TrustRow({ items, fill }) {
  const { t, lang } = useI18n();
  const facts = (Array.isArray(items) ? items : []).map((x) => fill(localized(x, lang))).filter(Boolean).slice(0, 4);
  if (!facts.length) return null;
  return (
    <ul className="hm-trust" aria-label={t('home.trust.label')}>
      {facts.map((text, i) => {
        const Icon = ICONS[i] || ShieldCheck;
        return (
          <li key={i} className="hm-trust-item">
            <Icon size={22} className="hm-trust-icon" />
            <span>{text}</span>
          </li>
        );
      })}
    </ul>
  );
}
