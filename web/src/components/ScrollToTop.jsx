import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** Scroll to top on route change — standard SPA UX. */
export default function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }, [pathname]);
  return null;
}
