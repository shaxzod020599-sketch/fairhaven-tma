import { useEffect, useMemo } from 'react';
import { useCatalog, brandBySlug, fold } from '../../catalog/index.js';

export const FH_SLUG = 'fairhaven-health';
const SHOTS = 4;

/**
 * Every brand that has products in the catalogue, biggest first: { slug, name, count, country, shots, letter }.
 * `shots` are up to four products with images for the packshot fans, in-stock ones first.
 */
export function useBrandDirectory() {
  const { products, status, reload } = useCatalog();
  const brands = useMemo(() => {
    const map = new Map();
    for (const p of products) {
      if (!p.brandSlug) continue;
      let entry = map.get(p.brandSlug);
      if (!entry) {
        entry = {
          slug: p.brandSlug,
          name: p.brandName,
          count: 0,
          country: brandBySlug(p.brandSlug)?.country || null,
          letter: letterOf(p.brandName),
          pool: [],
        };
        map.set(p.brandSlug, entry);
      }
      entry.count += 1;
      if (p.image) entry.pool.push(p);
    }
    return [...map.values()]
      .map(({ pool, ...brand }) => ({ ...brand, shots: pickShots(pool) }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [products]);
  return { brands, status, reload, productCount: products.length };
}

function pickShots(pool) {
  const seen = new Set();
  const ordered = [...pool.filter((p) => p.isAvailable), ...pool.filter((p) => !p.isAvailable)];
  const shots = [];
  for (const p of ordered) {
    if (seen.has(p.image)) continue;
    seen.add(p.image);
    shots.push(p);
    if (shots.length === SHOTS) break;
  }
  return shots;
}

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export function letterOf(name) {
  const first = String(name || '').normalize('NFKD').charAt(0).toUpperCase();
  return ALPHABET.includes(first) ? first : '#';
}

/** Does a brand match the search text? Folded, so «солгар» finds Solgar and «natures» finds Nature’s Plus. */
export function brandMatches(brand, query) {
  const q = fold(query);
  if (!q) return true;
  const tight = q.replace(/ /g, '');
  const names = [brand.name, brand.slug, ...(brandBySlug(brand.slug)?.aliases || [])].map(fold);
  return names.some((n) => n.includes(q) || n.replace(/ /g, '').includes(tight));
}

/**
 * Keeps a sticky bar right under the header: the header slides away on scroll down, and the bar follows it
 * instead of leaving a gap. Writes --bx-top (px) on the element.
 */
export function useUnderHeader(ref) {
  useEffect(() => {
    const el = ref.current;
    const header = document.querySelector('.hdr');
    if (!el || !header) return undefined;
    let frame = 0;
    const update = () => {
      frame = 0;
      el.style.setProperty('--bx-top', `${Math.max(0, Math.round(header.getBoundingClientRect().bottom))}px`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    // The header animates its transform through inline style; follow every frame of it.
    const observer = new MutationObserver(schedule);
    observer.observe(header, { attributes: true, attributeFilter: ['style', 'class'] });
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
    };
  }, [ref]);
}
