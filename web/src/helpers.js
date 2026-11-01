/**
 * Shared helpers for the web site (independent of the mini-app utils).
 * Prices go through formatSum in catalog/format.js («сум» / «so‘m»).
 */

/** Merge imageUrl + images[] into a deduped gallery list. */
export function getAllImages(product) {
  const out = [];
  if (product?.imageUrl) out.push(product.imageUrl);
  if (Array.isArray(product?.images)) {
    for (const u of product.images) {
      if (u && !out.includes(u)) out.push(u);
    }
  }
  return out.length ? out : [];
}
