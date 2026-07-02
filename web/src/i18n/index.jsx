import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { ru } from './ru.js';
import { uz } from './uz.js';

const DICTS = { ru, uz };
const STORAGE_KEY = 'fh-web-lang';

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => {
    if (typeof window === 'undefined') return 'ru';
    return localStorage.getItem(STORAGE_KEY) || 'ru';
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (_) {}
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback(
    (key) => {
      const dict = DICTS[lang] || DICTS.ru;
      return dict[key] ?? DICTS.ru[key] ?? key;
    },
    [lang]
  );

  const toggle = useCallback(() => {
    setLang((prev) => (prev === 'ru' ? 'uz' : 'ru'));
  }, []);

  const value = { lang, setLang, toggle, t };
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
