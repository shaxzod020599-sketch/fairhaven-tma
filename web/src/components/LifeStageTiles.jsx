import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { Flower, Sprout, Baby, Bottle, Leaf } from './Icons.jsx';

const STAGES = [
  { slug: 'fertility-women', Icon: Flower, tone: 'pink' },
  { slug: 'fertility-men', Icon: Sprout, tone: 'blue' },
  { slug: 'pregnant', Icon: Baby, tone: 'lavender' },
  { slug: 'nursing', Icon: Bottle, tone: 'mint' },
  { slug: 'menopause', Icon: Leaf, tone: 'wine' },
];

const LABELS = {
  'fertility-women': 'stageFertilityWomen',
  'fertility-men': 'stageFertilityMen',
  pregnant: 'stagePregnant',
  nursing: 'stageNursing',
  menopause: 'stageMenopause',
};

export default function LifeStageTiles() {
  const { t } = useI18n();
  return (
    <div className="life-stage-grid">
      {STAGES.map((stage) => (
        <Link key={stage.slug} to={`/shop/${stage.slug}`} className={`life-stage-tile tone-${stage.tone}`}>
          <span className="life-stage-icon"><stage.Icon width={36} height={36} /></span>
          <span className="life-stage-label">{t(LABELS[stage.slug])}</span>
          <span className="life-stage-arrow" aria-hidden="true">→</span>
        </Link>
      ))}
    </div>
  );
}
