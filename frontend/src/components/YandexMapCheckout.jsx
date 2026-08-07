import React, { useEffect, useRef, useState, useCallback } from 'react';

const TASHKENT_CENTER = { lat: 41.2995, lng: 69.2401 };
const YANDEX_API_KEY = '69307a33-0864-4402-b3ea-22f2656336f4';

// One shared loader for the whole session: reopening the map step must reuse
// the script already in the page instead of appending a second <script>.
let scriptPromise = null;
function loadYmaps() {
  if (window.ymaps) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://api-maps.yandex.ru/2.1/?apikey=${YANDEX_API_KEY}&lang=ru_RU`;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => {
        // Let the next open retry instead of caching the rejection forever.
        scriptPromise = null;
        reject(new Error('Yandex Maps script failed'));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

export default function YandexMapCheckout({ onConfirm, onClose }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // Bumped by the retry button — the map is the only way to set an address
  // here, so a failed load must not be a dead end.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // `cancelled` matters on a slow connection: the user can tap back before
    // ymaps.ready fires, and building a map on a detached node throws.
    let cancelled = false;

    loadYmaps()
      .then(() => {
        if (cancelled) return;
        window.ymaps.ready(() => {
          if (cancelled || !mapRef.current || mapInstance.current) return;

          const map = new window.ymaps.Map(mapRef.current, {
            center: [TASHKENT_CENTER.lat, TASHKENT_CENTER.lng],
            zoom: 14,
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
        if (cancelled) return;
        setFailed(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      if (mapInstance.current) {
        mapInstance.current.destroy();
        mapInstance.current = null;
      }
    };
  }, [attempt]);

  // Yandex writes a fixed pixel height onto its own canvas, so it has to be
  // told to re-measure whenever the box around it changes — a wrapping address
  // line, or Telegram resizing the viewport.
  useEffect(() => {
    const node = mapRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      mapInstance.current?.container.fitToViewport();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // The address bar is the one box that reliably changes height mid-session:
  // a long address wraps to a second line and shrinks the map above it.
  useEffect(() => {
    mapInstance.current?.container.fitToViewport();
  }, [address]);

  const reverseGeocode = useCallback((lat, lng) => {
    if (!window.ymaps) return;
    window.ymaps
      .geocode([lat, lng], { results: 1 })
      .then((res) => {
        const first = res.geoObjects.get(0);
        if (first) setAddress(first.getAddressLine() || 'Адрес не определён');
      })
      .catch(() => setAddress('Не удалось определить адрес'));
  }, []);

  const handleConfirm = () => {
    if (!coords || !address) return;
    onConfirm({ lat: coords.lat, lng: coords.lng, address });
  };

  return (
    <div className="map-overlay" id="map-overlay">
      <div className="map-header">
        <button
          className="map-back-btn"
          onClick={onClose}
          id="map-back-btn"
          aria-label="Назад"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M12 4 6 10l6 6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="map-title">Выберите адрес доставки</div>
        <div style={{ width: 38 }} />
      </div>

      <div className="map-container">
        <div
          id="yandex-map"
          ref={mapRef}
          style={{ width: '100%', height: '100%' }}
        />
        {!failed && <div className="map-pin-center" aria-hidden="true">📍</div>}
        {(loading || failed) && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
              textAlign: 'center',
              background: 'var(--paper-soft)',
            }}
          >
            {failed ? (
              <>
                <div className="map-address-text">
                  Карта не загрузилась. Проверьте подключение к интернету.
                </div>
                <button
                  className="map-confirm-btn"
                  type="button"
                  onClick={() => {
                    setFailed(false);
                    setLoading(true);
                    setAttempt((n) => n + 1);
                  }}
                >
                  Попробовать снова
                </button>
              </>
            ) : (
              <div className="spinner" />
            )}
          </div>
        )}
      </div>

      <div className="map-address-bar">
        <div className="map-address-label">
          <span aria-hidden="true">◎</span> Адрес доставки
        </div>
        <div className="map-address-text">
          {address || 'Переместите карту для выбора адреса…'}
        </div>
        <button
          className="map-confirm-btn"
          onClick={handleConfirm}
          disabled={!coords || !address}
          id="map-confirm-btn"
        >
          Подтвердить адрес
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="m5 10 4 4 6-8"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
