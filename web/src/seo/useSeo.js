import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import pages from './pages.json';
import { buildMeta, headTags, normalizePath } from './meta.js';
import { useI18n } from '../i18n/index.jsx';

// The meta tags stay Russian (the indexed language); in Uzbek the browser tab
// shows the page's own Uzbek heading instead of the Russian title.
// Animated headings pair an sr-only copy with aria-hidden letters: read the copy.
// Block children (the two hero lines) are separate words even without a space between them.
function headingText() {
  const h1 = document.querySelector('#main h1');
  if (!h1) return '';
  let text = '';
  const read = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) text += child.nodeValue;
      else if (child.nodeType === Node.ELEMENT_NODE && child.getAttribute('aria-hidden') !== 'true') {
        const gap = child.tagName === 'BR' || getComputedStyle(child).display !== 'inline' ? ' ' : '';
        text += gap;
        read(child);
        text += gap;
      }
    }
  };
  read(h1);
  return text.replace(/\s+/g, ' ').trim();
}

function tabTitle(meta, lang) {
  if (lang !== 'uz') return meta.title;
  const h1 = headingText();
  return h1 ? `${h1} | ${meta.siteName}` : meta.title;
}

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
 *
 *   useSeo()                                  static page from pages.json
 *   useSeo({ product }) / useSeo({ post })    product or journal entry
 *   useSeo({ need: 'immunity', count: 24 })   /shop/<need> goal page
 *   useSeo({ brand: { slug, name, count } })  /brands/<slug>
 *   useSeo({ notFound: true })                404
 *
 * Old /shop/<stage> slugs resolve to their need (see `needForSlug` in
 * meta.js); the page should still navigate to the new URL with replace.
 */
export function useSeo(data = {}) {
  const { pathname } = useLocation();
  const { lang } = useI18n();
  const meta = data ? buildMeta(pages, pathname, data) : null;
  const tags = meta ? headTags(meta) : [];
  const signature = meta ? JSON.stringify([meta.title, tags]) : '';

  useEffect(() => {
    if (!meta) return;
    document.title = tabTitle(meta, lang);
    tags.forEach(upsert);
    // Structured data the server wrote describes the first page only.
    const path = normalizePath(pathname);
    document.head.querySelectorAll('script[type="application/ld+json"][data-path]').forEach((el) => {
      if (el.dataset.path !== path) el.remove();
    });
    // A heading that arrives with data (order, account) updates the Uzbek tab title.
    const main = lang === 'uz' && document.getElementById('main');
    if (!main) return undefined;
    let frame = 0;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = tabTitle(meta, lang);
        if (document.title !== next) document.title = next;
      });
    });
    observer.observe(main, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [signature, lang]); // eslint-disable-line react-hooks/exhaustive-deps
}
