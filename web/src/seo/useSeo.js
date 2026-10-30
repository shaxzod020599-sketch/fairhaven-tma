import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import pages from './pages.json';
import { buildMeta, headTags, normalizePath } from './meta.js';

function upsert([element, keyAttr, key, value]) {
  const valueAttr = element === 'link' ? 'href' : 'content';
  let el = document.head.querySelector(`${element}[${keyAttr}="${key}"]`);
  if (!value) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement(element);
    el.setAttribute(keyAttr, key);
    document.head.appendChild(el);
  }
  el.setAttribute(valueAttr, value);
}

/**
 * Keeps the head (title, description, canonical, robots, social tags) in step
 * with the page. The server already wrote the same values into the first
 * HTML; this covers in-app navigation. Pass `null` while the page is still
 * loading what its tags depend on, so the server's values stay meanwhile.
 */
export function useSeo(data = {}) {
  const { pathname } = useLocation();
  const meta = data ? buildMeta(pages, pathname, data) : null;
  const tags = meta ? headTags(meta) : [];
  const signature = meta ? JSON.stringify([meta.title, tags]) : '';

  useEffect(() => {
    if (!meta) return;
    document.title = meta.title;
    tags.forEach(upsert);
    // Structured data the server wrote describes the first page only.
    const path = normalizePath(pathname);
    document.head.querySelectorAll('script[type="application/ld+json"][data-path]').forEach((el) => {
      if (el.dataset.path !== path) el.remove();
    });
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps
}
