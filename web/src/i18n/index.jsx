import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { DICTS, interpolate, pluralForm } from './dicts.js';

const STORAGE_KEY = 'fh-web-lang';

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => {
    if (typeof window === 'undefined') return 'ru';
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'uz' ? 'uz' : 'ru';
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (_) {}
    document.documentElement.lang = lang;
  }, [lang]);

  // Flat lookup with a Russian fallback, so a key missing in Uzbek never shows as a raw key.
  const t = useCallback(
    (key) => {
      const dict = DICTS[lang] || DICTS.ru;
      return dict[key] ?? DICTS.ru[key] ?? key;
    },
    [lang]
  );

  const tf = useCallback((key, vars) => interpolate(t(key), vars), [t]);

  const plural = useCallback((n, forms) => pluralForm(lang, n, forms), [lang]);

  const toggle = useCallback(() => {
    setLang((prev) => (prev === 'ru' ? 'uz' : 'ru'));
  }, []);

  const value = useMemo(() => ({ lang, setLang, toggle, t, tf, plural }), [lang, toggle, t, tf, plural]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
