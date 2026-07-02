import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Hexagon, Leaf, Sparkle } from './Icons.jsx';

const PILLAR_ICONS = [Hexagon, Leaf, Sparkle];

export default function OurDifference({ variant = 'band' }) {
  const { t } = useI18n();

  const pillars = [
    { title: t('pillar1Title'), desc: t('pillar1Desc') },
    { title: t('pillar2Title'), desc: t('pillar2Desc') },
    { title: t('pillar3Title'), desc: t('pillar3Desc') },
  ];

  return (
    <div className={`our-difference ${variant}`}>
      <p className="our-difference-tagline">{t('ourDifferenceTagline')}</p>
      <div className="pillars">
        {pillars.map((p, i) => {
          const Icon = PILLAR_ICONS[i];
          return (
            <div className="pillar" key={i}>
              <span className="pillar-icon"><Icon width={40} height={40} /></span>
              <h3 className="pillar-title">{p.title}</h3>
              <p className="pillar-desc">{p.desc}</p>
            </div>
          );
        })}
      </div>
      <div className="practitioner-line">{t('practitioner')}</div>
    </div>
  );
}
