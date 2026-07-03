import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { fetchSiteContent } from '../api.js';
import { DEFAULT_CONTENT, mergeContent } from '../content/defaults.js';

const SiteContentContext = createContext(DEFAULT_CONTENT);

/**
 * Editable site copy: built-in defaults deep-merged with whatever the
 * admin panel saved. Renders immediately with defaults; swaps in the
 * saved bundle as soon as it arrives.
 */
export function SiteContentProvider({ children }) {
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchSiteContent()
      .then((res) => {
        if (!cancelled && res?.data) setSaved(res.data);
      })
      .catch(() => { /* defaults already cover us */ });
    return () => { cancelled = true; };
  }, []);

  const value = useMemo(() => mergeContent(DEFAULT_CONTENT, saved), [saved]);

  return (
    <SiteContentContext.Provider value={value}>
      {children}
    </SiteContentContext.Provider>
  );
}

export function useSiteContent() {
  return useContext(SiteContentContext);
}
