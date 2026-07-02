import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { fetchPublicSettings } from '../api.js';

const SettingsContext = createContext(null);

export const DEFAULTS = {
  support_phone: '+998 78 150 04 40',
  support_phone_tel: '+998781500440',
  support_hours: 'Ежедневно · 9:00 – 21:00',
  free_delivery_threshold: 500000,
  delivery_city: 'Ташкент',
  brand_tagline: 'Fairhaven Health · USA',
  support_tg: 'fairhaven_uz',
  hero_eyebrow: 'FAIRHAVEN HEALTH · USA',
  hero_title_pre: 'Репродуктивное',
  hero_title_em: 'здоровье',
  hero_title_post: 'семьи',
};

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS);

  useEffect(() => {
    let mounted = true;
    fetchPublicSettings()
      .then((res) => {
        if (!mounted) return;
        const data = res?.data;
        if (data && typeof data === 'object') {
          setSettings({ ...DEFAULTS, ...data });
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const get = useCallback((key) => settings[key] ?? DEFAULTS[key], [settings]);

  return (
    <SettingsContext.Provider value={{ settings, get }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
