import React, { useMemo } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { useCatalog, savingsShelf } from '../../catalog/index.js';
import { ProductCard, Rail, SectionHeader, SkeletonCard } from '../../components/ui/index.js';

/** «Выгодно сейчас»: the 12 biggest real savings (old price above price), with −N%. */
export default function SavingsShelf() {
  const { t } = useI18n();
  const { products, status } = useCatalog();
  const items = useMemo(() => savingsShelf(products.filter((p) => p.isAvailable !== false), 12), [products]);

  if (status !== 'loading' && !items.length) return null;

  return (
    <section className="hm-save section section-2" aria-labelledby="hm-save-title">
      <div className="container">
        <SectionHeader
          id="hm-save-title"
          title={t('home.savings.title')}
          linkTo="/shop?sale=1&sort=saving"
          linkLabel={t('home.savings.all')}
        />
        <Rail label={t('home.savings.title')} itemWidth="clamp(196px, 46vw, 268px)">
          {items.length
            ? items.map((p) => <ProductCard key={p._id} product={p} showPercent />)
            : Array.from({ length: 5 }, (_, i) => <SkeletonCard key={i} />)}
        </Rail>
      </div>
    </section>
  );
}
