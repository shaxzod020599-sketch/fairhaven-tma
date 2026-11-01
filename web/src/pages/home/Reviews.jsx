import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Rail, SectionHeader } from '../../components/ui/index.js';
import { localized } from './useHomeFacts.js';
import './Reviews.css';

/** Customer quotes from site content (home.reviews); the section exists only once the admin adds some. */
export default function Reviews({ items }) {
  const { t, lang } = useI18n();
  const quotes = (Array.isArray(items) ? items : []).map((r) => localized(r, lang)).filter((r) => r?.text);
  if (!quotes.length) return null;

  return (
    <section className="hm-rv section section-2" aria-labelledby="hm-rv-title">
      <div className="container">
        <SectionHeader id="hm-rv-title" title={t('home.reviews.title')} />
        <Rail label={t('home.reviews.title')} itemWidth="clamp(272px, 80vw, 420px)">
          {quotes.map((r, i) => (
            <figure key={i} className="hm-rv-quote">
              <blockquote className="hm-rv-text">{r.text}</blockquote>
              {(r.name || r.city) && (
                <figcaption className="hm-rv-who">
                  {r.name && <span className="hm-rv-name">{r.name}</span>}
                  {r.city && <span className="hm-rv-city t-small">{r.city}</span>}
                </figcaption>
              )}
            </figure>
          ))}
        </Rail>
      </div>
    </section>
  );
}
