import React, { createContext, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';

const ToneContext = createContext(null);

/**
 * Which surface the header starts on. 'floor' (default): solid white header above the page.
 * 'stage': the page opens with a dark stage section; the header is transparent with light text over it
 * until the page scrolls. The newest declaration wins, and the tone falls back to 'floor' when that page
 * unmounts, so a page that says nothing always gets the floor header.
 */
export function HeaderToneProvider({ children }) {
  const [tone, setTone] = useState('floor');
  const owner = useRef(0);

  useLayoutEffect(() => {
    document.documentElement.dataset.headerTone = tone;
  }, [tone]);

  const api = useMemo(
    () => ({
      claim(next) {
        owner.current += 1;
        const id = owner.current;
        setTone(next);
        return () => {
          if (owner.current === id) setTone('floor');
        };
      },
    }),
    []
  );

  const value = useMemo(() => ({ tone, claim: api.claim }), [tone, api]);
  return <ToneContext.Provider value={value}>{children}</ToneContext.Provider>;
}

/**
 * Pages call it once at the top: useHeaderTone('stage') when their first section is the dark stage.
 * Layout effect, so the first paint already has the right header (no white flash over the hero).
 */
export function useHeaderTone(tone = 'floor') {
  const ctx = useContext(ToneContext);
  const claim = ctx?.claim;
  useLayoutEffect(() => (claim ? claim(tone === 'stage' ? 'stage' : 'floor') : undefined), [claim, tone]);
}

/** The current tone, for the header. */
export function useCurrentHeaderTone() {
  return useContext(ToneContext)?.tone || 'floor';
}
