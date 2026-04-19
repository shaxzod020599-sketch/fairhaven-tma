import React, { useEffect, useRef, useState, useCallback } from 'react';

const TASHKENT_CENTER = { lat: 41.2995, lng: 69.2401 };
const YANDEX_API_KEY = '69307a33-0864-4402-b3ea-22f2656336f4';

export default function YandexMapCheckout({ onConfirm, onClose }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  // Load Yandex Maps script
  useEffect(() => {
    if (window.ymaps) {
      setScriptLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${YANDEX_API_KEY}&lang=ru_RU`;
    script.async = true;
    script.onload = () => setScriptLoaded(true);
    script.onerror = () => {
      console.error('Failed to load Yandex Maps');
      setLoading(false);
    };
    document.head.appendChild(script);

    return () => {
      // Don't remove script on unmount — it's cached
    };
  }, []);

  // Initialize map once script is loaded
  useEffect(() => {
    if (!scriptLoaded || !window.ymaps) return;

    window.ymaps.ready(() => {
      if (mapInstance.current) return;

      const map = new window.ymaps.Map('yandex-map', {
        center: [TASHKENT_CENTER.lat, TASHKENT_CENTER.lng],
        zoom: 14,
        controls: ['zoomControl', 'geolocationControl'],
      });

      mapInstance.current = map;
      setLoading(false);

      // Reverse geocode center on every move
      map.events.add('actionend', () => {
        const center = map.getCenter();
        setCoords({ lat: center[0], lng: center[1] });
        reverseGeocode(center[0], center[1]);
      });

      // Initial geocode
      const center = map.getCenter();
      setCoords({ lat: center[0], lng: center[1] });
      reverseGeocode(center[0], center[1]);
    });

    return () => {
      if (mapInstance.current) {
        mapInstance.current.destroy();
        mapInstance.current = null;
      }
    };
  }, [scriptLoaded]);

  const reverseGeocode = useCallback((lat, lng) => {
    if (!window.ymaps) return;

    window.ymaps.geocode([lat, lng], { results: 1 }).then((res) => {
      const firstGeoObject = res.geoObjects.get(0);
      if (firstGeoObject) {
        const addr = firstGeoObject.getAddressLine() || 'Адрес не определён';
        setAddress(addr);
      }
    }).catch(() => {
      setAddress('Не удалось определить адрес');
    });
  }, []);

  const handleConfirm = () => {
    if (!coords || !address) return;
    onConfirm({
      lat: coords.lat,
      lng: coords.lng,
      address: address,
    });
  };

  return (
    <div className="map-overlay" id="map-overlay">
      <div className="map-header">
        <button className="map-back-btn" onClick={onClose} id="map-back-btn">
          ← 
        </button>
        <h3>Выберите адрес доставки</h3>
        <div style={{ width: 28 }}></div>
      </div>

      <div className="map-container">
        <div id="yandex-map" ref={mapRef} style={{ width: '100%', height: '100%' }}></div>
        <div className="map-pin-center">📍</div>
        {loading && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--color-card)',
          }}>
            <div className="spinner"></div>
          </div>
        )}
      </div>

      <div className="map-address-bar">
        <div className="map-address-label">📍 Адрес доставки</div>
        <div className="map-address-text">
          {address || 'Переместите карту для выбора адреса...'}
        </div>
        <button
          className="map-confirm-btn"
          onClick={handleConfirm}
          disabled={!coords || !address}
          id="map-confirm-btn"
        >
          ✓ Подтвердить адрес
        </button>
      </div>
    </div>
  );
}
