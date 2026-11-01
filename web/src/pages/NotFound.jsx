import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { NeedIcon, Search } from '../components/Icons.jsx';
import { Button } from '../components/ui/index.js';
import { useSearch } from '../components/shell/SearchContext.jsx';
import { useTaxonomy, NEED_KEYS } from '../catalog/index.js';
import { useSeo } from '../seo/useSeo.js';
import './info/NotFound.css';

/** The rising sun of the brand, setting: it sinks to the horizon once on mount (static under reduced motion). */
function Sunset() {
  return (
    <svg className="nf-sun" viewBox="0 0 240 150" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id="nf-sky">
          <rect x="0" y="0" width="240" height="100" />
        </clipPath>
        <radialGradient id="nf-disc" cx="50%" cy="35%" r="65%">
          <stop className="nf-stop-a" offset="0" />
          <stop className="nf-stop-b" offset="1" />
        </radialGradient>
      </defs>
      <g clipPath="url(#nf-sky)">
        <g className="nf-sun-body">
          <circle className="nf-sun-glow" cx="120" cy="100" r="64" />
          <circle cx="120" cy="100" r="44" fill="url(#nf-disc)" />
        </g>
      </g>
      <path className="nf-sun-line" d="M12 100.5h216" />
      <path className="nf-sun-line nf-sun-line--2" d="M60 118h120" />
      <path className="nf-sun-line nf-sun-line--3" d="M92 134h56" />
    </svg>
  );
}

export default function NotFound() {
  useSeo({ notFound: true });
  const { t } = useI18n();
  const { openSearch } = useSearch();
  const { taxonomy } = useTaxonomy();
  const counts = new Map((taxonomy?.needs || []).map((n) => [n.key, n.count]));
  const goals = NEED_KEYS.filter((key) => !taxonomy || counts.get(key) > 0);

  return (
    <div className="nf-page">
      <div className="container nf-inner">
        <Sunset />
        <p className="nf-code t-mono">{t('pages.nf.code')}</p>
        <h1 className="nf-title">{t('pages.nf.title')}</h1>
        <p className="nf-text t-muted">{t('pages.nf.text')}</p>
        <div className="nf-actions">
          <Button size="lg" iconStart={<Search size={20} />} onClick={() => openSearch()}>
            {t('pages.nf.search')}
          </Button>
          <Button size="lg" variant="secondary" to="/">{t('goHome')}</Button>
        </div>
        <nav className="nf-goals" aria-labelledby="nf-goals-title">
          <h2 id="nf-goals-title" className="nf-goals-title t-mono">{t('pages.nf.goals')}</h2>
          <ul>
            {goals.map((key) => (
              <li key={key}>
                <Link to={`/shop/${key}`} className="nf-goal">
                  <NeedIcon need={key} size={18} />
                  <span>{t(`need.${key}`)}</span>
                  {counts.has(key) && <span className="nf-goal-count t-mono">{counts.get(key)}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
