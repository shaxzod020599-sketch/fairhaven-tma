import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import SearchOverlay from './SearchOverlay.jsx';

const SearchContext = createContext(null);

// Keys typed into a field belong to that field; "/" opens search only from the page itself.
const typingIn = (el) =>
  el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/**
 * Hosts the search overlay once for the whole app. openSearch(query?) opens it, optionally prefilled;
 * "/" and Cmd/Ctrl+K open it from anywhere. Focus goes back to whatever opened it.
 */
export function SearchProvider({ children }) {
  const [state, setState] = useState({ open: false, query: '', session: 0 });
  const opener = useRef(null);
  const { pathname, search } = useLocation();

  const openSearch = useCallback((query) => {
    const active = document.activeElement;
    opener.current = active && active !== document.body ? active : null;
    setState((s) => ({ open: true, query: typeof query === 'string' ? query : '', session: s.session + 1 }));
  }, []);

  const closeSearch = useCallback(() => {
    setState((s) => (s.open ? { ...s, open: false } : s));
  }, []);

  // A result link changes the route; the overlay must not stay over the page it opened.
  useEffect(() => {
    closeSearch();
  }, [pathname, search, closeSearch]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented) return;
      // While a modal sheet holds the page (menu, cart), search would open behind it.
      if (!state.open && document.getElementById('root')?.hasAttribute('inert')) return;
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === 'k') {
        e.preventDefault();
        if (state.open) closeSearch();
        else openSearch();
        return;
      }
      if (e.key === '/' && !state.open && !e.metaKey && !e.ctrlKey && !e.altKey && !typingIn(e.target)) {
        e.preventDefault();
        openSearch();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state.open, openSearch, closeSearch]);

  const value = useMemo(() => ({ openSearch, closeSearch, isOpen: state.open }), [openSearch, closeSearch, state.open]);

  return (
    <SearchContext.Provider value={value}>
      {children}
      <SearchOverlay
        open={state.open}
        initialQuery={state.query}
        session={state.session}
        opener={opener}
        onClose={closeSearch}
      />
    </SearchContext.Provider>
  );
}

/** { openSearch(query?), closeSearch(), isOpen }. Outside the provider openSearch does nothing. */
export function useSearch() {
  return useContext(SearchContext) || { openSearch: () => {}, closeSearch: () => {}, isOpen: false };
}
