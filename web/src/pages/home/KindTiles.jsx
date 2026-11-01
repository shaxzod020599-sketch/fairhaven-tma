import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n/index.jsx';
import { useCatalog, KIND_KEYS } from '../../catalog/index.js';
import { countsBy, pickShots } from '../../components/shell/shots.js';
import { SectionHeader } from '../../components/ui/index.js';
import { KindIcon } from '../../components/Icons.jsx';
import './KindTiles.css';

// Bento of the eight kinds: one large, one wide, six small; surfaces alternate so no row repeats one card.
const TILES = {
  vitamins: { size: 'lg', tone: 'well', shots: 3 },
  minerals: { size: 'wide', tone: 'sun', shots: 2 },
  omega: { size: 'sm', tone: 'line', shots: 1 },
  collagen: { size: 'sm', tone: 'well', shots: 1 },
  inositol: { size: 'sm', tone: 'ink', shots: 1 },
  herbal: { size: 'sm', tone: 'well', shots: 1 },
  enzymes: { size: 'sm', tone: 'sun', shots: 1 },
  intimate: { size: 'sm', tone: 'line', shots: 1 },
};

/** «Что ищете?»: the catalogue by kind of product, each tile opening the shop filtered to it. */
export default function KindTiles() {
  const { t, plural } = useI18n();
  const { products, taxonomy } = useCatalog();

  const tiles = useMemo(() => {
    const counts = countsBy(taxonomy?.kinds);
    return KIND_KEYS.map((key) => ({
      key,
      ...TILES[key],
      count: counts.get(key) || 0,
      items: pickShots(products, TILES[key].shots, (p) => p.kind === key),
    }));
  }, [products, taxonomy]);

  return (
    <section className="hm-kt section" aria-labelledby="hm-kt-title">
      <div className="container">
        <SectionHeader id="hm-kt-title" title={t('home.kinds.title')} size="h1" linkTo="/shop" linkLabel={t('viewAll')} />
        <ul className="hm-kt-grid">
          {tiles.map((tile) => (
            <li key={tile.key} className={`hm-kt-cell hm-kt-cell--${tile.size}`}>
              <Link to={`/shop?kind=${tile.key}`} className={`hm-kt-tile hm-kt-tile--${tile.tone}`}>
                <span className="hm-kt-art" aria-hidden="true">
                  {tile.items.map((p) => (
                    <span key={p._id} className="hm-kt-shot">
                      <img src={p.image} alt="" loading="lazy" decoding="async" draggable="false" />
                    </span>
                  ))}
                </span>
                <span className="hm-kt-text">
                  <span className="hm-kt-icon">
                    <KindIcon kind={tile.key} size={tile.size === 'lg' ? 24 : 20} />
                  </span>
                  <span className="hm-kt-label">{t(`kind.${tile.key}`)}</span>
                  {tile.count > 0 && (
                    <span className="hm-kt-count t-mono">
                      {tile.count} {plural(tile.count, t('unitProducts'))}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
