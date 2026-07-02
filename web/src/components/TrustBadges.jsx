import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Shield, Star, Hexagon, Diamond, Check } from './Icons.jsx';

const BADGES = [
  { key: 'trustCgmp', Icon: Shield },
  { key: 'trustUsa', Icon: Star },
  { key: 'trustNongmo', Icon: Hexagon },
  { key: 'trustGluten', Icon: Diamond },
  { key: 'trustPractitioner', Icon: Check },
];

export default function TrustBadges() {
  const { t } = useI18n();
  return (
    <div className="trust-badges">
      {BADGES.map((b) => (
        <div className="trust-badge" key={b.key}>
          <span className="trust-glyph"><b.Icon width={18} height={18} /></span>
          <span className="trust-label">{t(b.key)}</span>
        </div>
      ))}
    </div>
  );
}
