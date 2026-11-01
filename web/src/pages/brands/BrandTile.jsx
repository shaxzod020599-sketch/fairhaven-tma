import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n/index.jsx';
import { ArrowUpRight } from '../../components/Icons.jsx';
import PackFan from './PackFan.jsx';
import { FH_SLUG } from './useBrandDirectory.js';
import './BrandTile.css';

/** «Страна бренда: США» when the registry knows it, else nothing. */
export function useCountryLine() {
  const { t } = useI18n();
  return (country) => (country ? `${t('brandCountry')}: ${t(`country.${country}`)}` : '');
}

/**
 * The index row of packshots: no plinths, the photo's white ground melts into the tile (multiply), and the
 * shots lift one after another on hover or focus. A photo that fails to load drops out of the row.
 */
function PackStrip({ shots }) {
  if (!shots?.length) return null;
  return (
    <span className="bx-strip" aria-hidden="true">
      {shots.map((p, i) => (
        <span key={p._id} className="bx-shot" style={{ '--i': i }}>
          <img
            src={p.image}
            alt=""
            loading="lazy"
            decoding="async"
            onError={(e) => { e.currentTarget.parentElement.hidden = true; }}
          />
        </span>
      ))}
    </span>
  );
}

/**
 * One brand in the index or a rail: the name in big type, country, product count and three packshots
 * that fan out on hover or focus. The whole tile links to the brand page.
 */
export default function BrandTile({ brand, variant = 'default', headingLevel = 3 }) {
  const { t, plural } = useI18n();
  const countryLine = useCountryLine()(brand.country);
  const Heading = `h${headingLevel}`;
  const official = brand.slug === FH_SLUG;
  return (
    <Link to={`/brands/${brand.slug}`} className={`bx-tile bx-tile--${variant} bx-fan-host${official ? ' is-official' : ''}`}>
      <span className="bx-tile-text">
        {official && <span className="bx-tile-badge t-mono">{t('brands.official')}</span>}
        <Heading className="bx-tile-name">{brand.name}</Heading>
        <span className="bx-tile-meta t-mono">
          {countryLine && <span>{countryLine}</span>}
          <span className="t-num">
            {brand.count} {plural(brand.count, t('unitProducts'))}
          </span>
        </span>
      </span>
      {variant === 'index' ? (
        <PackStrip shots={brand.shots.slice(0, 3)} />
      ) : (
        <PackFan shots={brand.shots.slice(0, 3)} size={variant === 'compact' ? 'sm' : 'md'} className="bx-tile-fan" />
      )}
      <ArrowUpRight className="bx-tile-arrow" size={20} aria-hidden="true" />
    </Link>
  );
}
