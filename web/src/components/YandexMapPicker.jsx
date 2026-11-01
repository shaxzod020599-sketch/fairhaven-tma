import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { useI18n } from '../i18n/index.jsx';
import { EASE_OUT, SPRING } from '../motion/index.js';
import { Button, IconButton } from './ui/index.js';
import { Close, MapPin } from './Icons.jsx';
import Spinner from '../pages/cart/Spinner.jsx';
import './YandexMapPicker.css';

const TASHKENT_CENTER = { lat: 41.2995, lng: 69.2401 };
const API_KEY = import.meta.env.VITE_YANDEX_API_KEY || '69307a33-0864-4402-b3ea-22f2656336f4';

let scriptPromise = null;
function loadYmaps(lang) {
  if (window.ymaps) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://api-maps.yandex.ru/2.1/?apikey=${API_KEY}&lang=${lang === 'uz' ? 'uz_UZ' : 'ru_RU'}`;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

/**
 * Delivery-address picker — same center-pin pattern as the mini-app:
 * drag the map, the fixed pin marks the spot, reverse geocode fills the
 * address, confirm returns { lat, lng, address }.
 */
export default function YandexMapPicker({ open, onConfirm, onClose }) {
  const { t, lang } = useI18n();
  const reduce = useReducedMotion();
  const mapNodeRef = useRef(null);
  const mapInstance = useRef(null);
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const reverseGeocode = useCallback((lat, lng) => {
    if (!window.ymaps) return;
    window.ymaps
      .geocode([lat, lng], { results: 1 })
      .then((res) => {
        const first = res.geoObjects.get(0);
        if (first) setAddress(first.getAddressLine() || '');
      })
      .catch(() => setAddress(''));
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    setFailed(false);

    loadYmaps(lang)
      .then(() => {
        if (cancelled) return;
        window.ymaps.ready(() => {
          if (cancelled || !mapNodeRef.current || mapInstance.current) return;
          const map = new window.ymaps.Map(mapNodeRef.current, {
            center: [TASHKENT_CENTER.lat, TASHKENT_CENTER.lng],
            zoom: 13,
            controls: ['zoomControl', 'geolocationControl'],
          });
          mapInstance.current = map;
          setLoading(false);

          const sync = () => {
            const center = map.getCenter();
            setCoords({ lat: center[0], lng: center[1] });
            reverseGeocode(center[0], center[1]);
          };
          map.events.add('actionend', sync);
          sync();
        });
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      if (mapInstance.current) {
        mapInstance.current.destroy();
        mapInstance.current = null;
      }
    };
  }, [open, lang, reverseGeocode]);

  // Esc closes; body scroll locks while open.
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const confirm = () => {
    if (!coords || !address) return;
    onConfirm({ lat: coords.lat, lng: coords.lng, address });
  };

  // Portalled to <body>: the route-transition wrapper in App.jsx carries a
  // transform, and a transformed ancestor becomes the containing block for
  // `position: fixed` — which would size this overlay to the page, not the
  // viewport, pushing the confirm button off-screen on phones.
  return createPortal(
    <AnimatePresence>
      {open && (
        <m.div
          className="ymp-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.16 } }}
          transition={{ duration: 0.22, ease: EASE_OUT }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <m.div
            className="ymp"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ymp-title"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24, transition: { duration: 0.16 } }}
            transition={reduce ? { duration: 0.2 } : SPRING.snappy}
          >
            <div className="ymp-head">
              <h2 id="ymp-title" className="ymp-title">{t('cart.map.title')}</h2>
              {/* autoFocus: keyboard focus lands inside the dialog; Esc closes it. */}
              <IconButton label={t('close')} variant="outline" onClick={onClose} autoFocus>
                <Close size={20} />
              </IconButton>
            </div>

            <div className="ymp-canvas">
              <div ref={mapNodeRef} className="ymp-map" />
              <div className="ymp-pin" aria-hidden="true">
                <svg width="34" height="44" viewBox="0 0 34 44" fill="none">
                  <path d="M17 2C9 2 2.5 8.4 2.5 16.3 2.5 27 17 42 17 42s14.5-15 14.5-25.7C31.5 8.4 25 2 17 2z" />
                  <circle cx="17" cy="16" r="5.5" />
                </svg>
                <span className="ymp-pin-shadow" />
              </div>
              {loading && !failed && (
                <div className="ymp-state"><Spinner label={t('cart.map.loading')} size={24} /></div>
              )}
              {failed && <div className="ymp-state ymp-state--failed" role="alert">{t('cart.map.failed')}</div>}
            </div>

            <div className="ymp-foot">
              <p className="ymp-address" aria-live="polite">
                <MapPin size={20} />
                <span>{address || t('cart.map.hint')}</span>
              </p>
              <Button onClick={confirm} disabled={!coords || !address} size="lg">
                {t('cart.map.confirm')}
              </Button>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
