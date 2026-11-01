import { useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';

/** view-transition-name shared by the product card image and the product page image. */
export const PRODUCT_IMAGE_VT = 'fh-product-image';

let updating = false;

/** True while a view transition is swapping the page; the route fade skips itself then. */
export const inViewTransition = () => updating;

const supported = () =>
  typeof document !== 'undefined' &&
  typeof document.startViewTransition === 'function' &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Runs a React update inside document.startViewTransition (rendered synchronously, so the browser
 * captures the new page). Without support, or with reduced motion, it just runs the update.
 */
export function startViewTransition(update) {
  if (!supported()) {
    update();
    return null;
  }
  return document.startViewTransition(() => {
    updating = true;
    try {
      flushSync(update);
    } finally {
      updating = false;
    }
  });
}

/**
 * navigate() that morphs one element into its counterpart on the next page.
 *   const go = useVTNavigate();
 *   onClick={(e) => { e.preventDefault(); go(`/product/${id}`, { sharedEl: imgRef.current }); }}
 * The next page names its element inline: style={{ viewTransitionName: PRODUCT_IMAGE_VT }}.
 * Two elements with one name on a page cancel the transition, so the clicked element holds the name
 * only for the capture of the old page.
 */
export function useVTNavigate() {
  const navigate = useNavigate();
  return useCallback(
    (to, { sharedEl, name = PRODUCT_IMAGE_VT, ...options } = {}) => {
      if (!sharedEl || !supported()) {
        startViewTransition(() => navigate(to, options));
        return;
      }
      // On a product page the main image already holds the name; it steps aside while the old page is
      // captured, and takes it back for the new one, so the clicked card morphs into it.
      const holders = [...document.querySelectorAll('[style*="view-transition-name"]')].filter(
        (el) => el !== sharedEl && el.style.viewTransitionName === name
      );
      holders.forEach((el) => { el.style.viewTransitionName = 'none'; });
      sharedEl.style.viewTransitionName = name;
      startViewTransition(() => {
        sharedEl.style.viewTransitionName = '';
        holders.forEach((el) => { el.style.viewTransitionName = name; });
        navigate(to, options);
      });
    },
    [navigate]
  );
}
