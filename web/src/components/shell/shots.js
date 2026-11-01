/**
 * Up to `n` products with a picture from `products`, one per brand first (so a preview shows variety),
 * then the rest in catalogue order. Pure, so menus can memoise it.
 */
export function pickShots(products, n = 3, keep = () => true) {
  const pool = products.filter((p) => p.image && p.isAvailable !== false && keep(p));
  const picked = [];
  const brands = new Set();
  for (const p of pool) {
    if (picked.length >= n) break;
    if (brands.has(p.brandSlug)) continue;
    brands.add(p.brandSlug);
    picked.push(p);
  }
  for (const p of pool) {
    if (picked.length >= n) break;
    if (!picked.includes(p)) picked.push(p);
  }
  return picked;
}

/** Map key -> count from a taxonomy list ([{key, count}] or [{slug, count}]). */
export const countsBy = (list, field = 'key') => new Map((list || []).map((x) => [x[field], x.count]));
