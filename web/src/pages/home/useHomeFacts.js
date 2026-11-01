import { useEffect, useMemo, useState } from 'react';
import { useCatalog, formatSum } from '../../catalog/index.js';
import { useSiteContent } from '../../context/SiteContentContext.jsx';
import { useSettings } from '../../context/SettingsContext.jsx';
import { useI18n } from '../../i18n/index.jsx';
import { HOME } from '../../content/home.js';

// The headline shows the brand count before the catalogue arrives. The last real count is kept here so a
// returning visitor never sees the number change; a first visit starts from the catalogue's 20 brands.
const COUNTS_KEY = 'fh-home-counts';
const FIRST_VISIT = { brands: 20, products: 0 };

function readCounts() {
  try {
    const saved = JSON.parse(localStorage.getItem(COUNTS_KEY) || 'null');
    return saved?.brands > 0 ? { brands: saved.brands, products: saved.products || 0 } : FIRST_VISIT;
  } catch {
    return FIRST_VISIT;
  }
}

const TOKEN = /\{(brands|products|threshold)\}/g;
const NBSP = ' ';

/**
 * Live facts for the home sections: brand and product counts, the free delivery threshold, the merged
 * `home` site content, and fill(text) for the {brands}/{products}/{threshold} tokens admins may type.
 */
export function useHomeFacts() {
  const { products, status, taxonomy } = useCatalog();
  const { get } = useSettings();
  const { lang } = useI18n();
  const content = useSiteContent();
  const [cached] = useState(readCounts);

  const live = useMemo(() => {
    if (status !== 'ready' || !products.length) return null;
    const brands = taxonomy?.brands?.length || new Set(products.map((p) => p.brandSlug).filter(Boolean)).size;
    return { brands, products: taxonomy?.total || products.length };
  }, [status, products, taxonomy]);

  useEffect(() => {
    if (!live) return;
    try {
      localStorage.setItem(COUNTS_KEY, JSON.stringify(live));
    } catch {
      /* private mode: the next visit starts from the default again */
    }
  }, [live]);

  const counts = live || cached;
  // Non-breaking spaces keep «500 000 сум» on one line inside running text.
  const threshold = formatSum(get('free_delivery_threshold'), lang).replace(/ /g, NBSP);
  const values = { brands: counts.brands, products: counts.products, threshold };

  return {
    ready: Boolean(live),
    brands: counts.brands,
    products: counts.products,
    threshold,
    home: content?.home || HOME,
    fill: (text) => String(text || '').replace(TOKEN, (_, key) => values[key]),
    values,
  };
}

/** The admin text in the reader's language, falling back to Russian. */
export const localized = (entry, lang) => (entry && (entry[lang] || entry.ru)) || '';
