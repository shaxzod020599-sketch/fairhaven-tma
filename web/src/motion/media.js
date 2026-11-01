import { useEffect, useState, useSyncExternalStore } from 'react';

/** Live result of a media query. */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/** True on a mouse or trackpad; pointer effects (Magnetic, Tilt, cursor followers) only run there. */
export const useFinePointer = () => useMediaQuery('(hover: hover) and (pointer: fine)');

const subscribeVisibility = (cb) => {
  document.addEventListener('visibilitychange', cb);
  return () => document.removeEventListener('visibilitychange', cb);
};

/** False while the tab is hidden; loops stop then. */
export function usePageVisible() {
  return useSyncExternalStore(subscribeVisibility, () => document.visibilityState !== 'hidden', () => true);
}
