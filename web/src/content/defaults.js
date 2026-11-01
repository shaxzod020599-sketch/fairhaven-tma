import { ANNOUNCE, HOME } from './home.js';
import { BLOG_POSTS } from './blog.js';

/**
 * Built-in content bundle: the copy the site ships with, assembled from content/*.js.
 * The admin panel starts from this when the database is still empty, and
 * the site deep-merges whatever the admin saved over these values, so a
 * half-filled document can never break a page.
 * The backend imports this file (DEFAULT_CONTENT.blog) for server-rendered SEO pages: keep it plain ESM.
 */
export const DEFAULT_CONTENT = {
  announce: ANNOUNCE,
  // Home page copy, trust facts, orbit showcase and reviews; the shape is documented in content/home.js.
  home: HOME,
  blog: BLOG_POSTS,
};

/** Deep merge: saved content wins, defaults fill the gaps. Arrays replace. */
export function mergeContent(base, override) {
  if (override == null) return base;
  if (Array.isArray(base) || Array.isArray(override)) return override;
  if (typeof base === 'object' && typeof override === 'object') {
    const out = { ...base };
    for (const k of Object.keys(override)) {
      out[k] = mergeContent(base?.[k], override[k]);
    }
    return out;
  }
  return override;
}
