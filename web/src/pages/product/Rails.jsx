import React, { useMemo } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { useCatalog } from '../../catalog/index.js';
import { Reveal, Stagger } from '../../motion/index.js';
import { ProductCard, Rail, SectionHeader } from '../../components/ui/index.js';
import './Rails.css';

const GOAL_MAX = 12;
const BRAND_MAX = 6;

// In-stock products first, catalogue order kept within each group.
const availableFirst = (list) => [...list.filter((p) => p.isAvailable), ...list.filter((p) => !p.isAvailable)];

/**
 * «Для той же цели» (a swipeable rail of cards for the first goal) and «Ещё от {brand}» (a compact list,
 * a different layout on purpose). The brand list skips what the goal rail already shows when it can.
 */
export default function Rails({ product }) {
  const { t, tf } = useI18n();
  const { products } = useCatalog();
  const need = product.needs[0];

  const { goal, brand } = useMemo(() => {
    const others = products.filter((p) => p._id !== product._id);
    const sameGoal = need ? availableFirst(others.filter((p) => p.needs.includes(need))).slice(0, GOAL_MAX) : [];
    const shown = new Set(sameGoal.map((p) => p._id));
    const sameBrand = product.brandSlug ? availableFirst(others.filter((p) => p.brandSlug === product.brandSlug)) : [];
    const fresh = sameBrand.filter((p) => !shown.has(p._id));
    return { goal: sameGoal, brand: (fresh.length >= 2 ? fresh : sameBrand).slice(0, BRAND_MAX) };
  }, [products, product, need]);

  if (!goal.length && !brand.length) return null;

  return (
    <>
      {goal.length > 0 && (
        <section className="pdp-rail section-tight" aria-labelledby="pdp-goal-title">
          <Reveal>
            <SectionHeader
              id="pdp-goal-title"
              title={t('product.sameGoal')}
              desc={t(`need.${need}`)}
              linkTo={`/shop/${need}`}
              linkLabel={t('viewAll')}
            />
          </Reveal>
          <Rail label={t('product.sameGoal')} itemWidth="clamp(176px, 44vw, 264px)">
            {goal.map((p) => (
              <ProductCard key={p._id} product={p} />
            ))}
          </Rail>
        </section>
      )}

      {brand.length > 0 && (
        <section className="pdp-more-brand section-tight" aria-labelledby="pdp-brand-title">
          <Reveal>
            <SectionHeader
              id="pdp-brand-title"
              title={tf('product.moreFrom', { brand: product.brandName })}
              linkTo={`/brands/${product.brandSlug}`}
              linkLabel={tf('product.allFrom', { brand: product.brandName })}
            />
          </Reveal>
          <Stagger as="ul" className="pdp-brand-list">
            {brand.map((p) => (
              <Reveal as="li" key={p._id}>
                <ProductCard product={p} variant="compact" />
              </Reveal>
            ))}
          </Stagger>
        </section>
      )}
    </>
  );
}
