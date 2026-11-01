import React, { useMemo } from 'react';
import { m } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { Chip } from '../../components/ui/index.js';
import { NeedIcon, KindIcon } from '../../components/Icons.jsx';
import { Reveal, SPRING } from '../../motion/index.js';
import './GoalHero.css';

const FAN = [
  { rotate: -9, x: '-46%', y: 14 },
  { rotate: 0, x: '0%', y: 0 },
  { rotate: 9, x: '46%', y: 14 },
];
const TOP_BRANDS = 6;

/** Three packshots of the goal from different brands, biggest brands first. */
function pickShots(products) {
  const seen = new Set();
  const out = [];
  for (const p of products) {
    if (!p.image || seen.has(p.brandSlug)) continue;
    seen.add(p.brandSlug);
    out.push(p);
    if (out.length === FAN.length) break;
  }
  return out;
}

/**
 * Goal landing band: icon, H1, count and description, then kinds and top brands of this goal as quick
 * toggles. On the right a rising sun with three of the goal's packshots fanned out on white plinths.
 */
export default function GoalHero({ need, count, products, facets, url }) {
  const { t, plural } = useI18n();
  const shots = useMemo(() => pickShots(products), [products]);
  const kinds = facets.kinds.filter((k) => k.count > 0);
  const brands = facets.brands.slice(0, TOP_BRANDS);

  return (
    <section className="shop-goal" aria-labelledby="shop-goal-title">
      <div className="shop-goal-text">
        <span className="shop-goal-icon" aria-hidden="true">
          <NeedIcon need={need} size={28} />
        </span>
        <h1 id="shop-goal-title" className="shop-goal-title t-h1">
          {t(`need.${need}`)}
        </h1>
        <p className="shop-goal-count t-mono">
          {count} {plural(count, t('unitProducts'))}
        </p>
        <Reveal as="p" className="shop-goal-desc">
          {t(`needDesc.${need}`)}
        </Reveal>
        {kinds.length > 1 && (
          <Reveal className="shop-goal-chips" role="group" aria-label={t('catalog.goalKinds')}>
            {kinds.map((k) => (
              <Chip
                key={k.key}
                selected={url.kind.includes(k.key)}
                count={k.count}
                icon={<KindIcon kind={k.key} />}
                onClick={() => url.toggle('kind', k.key)}
              >
                {t(`kind.${k.key}`)}
              </Chip>
            ))}
          </Reveal>
        )}
        {brands.length > 1 && (
          <Reveal className="shop-goal-brands" delay={0.06}>
            <p className="shop-goal-label t-mono" id="shop-goal-brands">
              {t('catalog.goalBrands')}
            </p>
            <div className="shop-goal-chips" role="group" aria-labelledby="shop-goal-brands">
              {brands.map((b) => (
                <Chip key={b.slug} selected={url.brand.includes(b.slug)} count={b.count} onClick={() => url.toggle('brand', b.slug)}>
                  {b.name}
                </Chip>
              ))}
            </div>
          </Reveal>
        )}
      </div>

      <div className="shop-goal-visual" aria-hidden="true">
        <span className="shop-goal-sun" />
        <span className="shop-goal-horizon" />
        <div className="shop-goal-fan">
          {shots.map((p, i) => (
            <m.span
              key={p._id}
              className={`shop-goal-shot shop-goal-shot--${i}`}
              initial={{ opacity: 0.001, y: 48, x: '0%', rotate: 0 }}
              animate={{ opacity: 1, ...FAN[i] }}
              transition={{ ...SPRING.soft, delay: 0.12 + i * 0.06 }}
            >
              <img src={p.image} alt="" loading={i === 1 ? 'eager' : 'lazy'} decoding="async" />
            </m.span>
          ))}
        </div>
      </div>
    </section>
  );
}
