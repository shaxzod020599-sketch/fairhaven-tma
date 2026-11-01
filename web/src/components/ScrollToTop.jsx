import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Jumps to the top on every new path, before paint, so the incoming page (and its view-transition
 * snapshot) never shows the previous scroll position. Query-only changes (filters) keep the scroll.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
