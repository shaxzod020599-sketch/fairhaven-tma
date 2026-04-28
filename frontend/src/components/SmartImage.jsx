import React, { useEffect, useRef, useState } from 'react';

/**
 * Reliable product image. Avoids the Android WebView "white flash" by:
 *  – decoding off the main thread before painting
 *  – holding the placeholder layer until the image is fully decoded
 *  – fading the bitmap in via opacity transition
 *  – locking aspect ratio so no layout jump
 */
export default function SmartImage({
  src,
  alt = '',
  className = '',
  fallback = null,
  sizes,
  eager = false,
  onLoaded,
}) {
  const [state, setState] = useState('loading');
  const imgRef = useRef(null);
  const lastSrcRef = useRef(null);

  useEffect(() => {
    if (!src) {
      setState('error');
      return undefined;
    }
    if (lastSrcRef.current === src && state === 'loaded') return undefined;

    lastSrcRef.current = src;
    setState('loading');

    let cancelled = false;
    const img = new Image();
    img.decoding = 'async';
    if (sizes) img.sizes = sizes;
    img.src = src;

    const ready = () => {
      if (cancelled) return;
      setState('loaded');
      onLoaded?.();
    };
    const fail = () => {
      if (cancelled) return;
      setState('error');
    };

    if (typeof img.decode === 'function') {
      img.decode().then(ready).catch(fail);
    } else {
      img.onload = ready;
      img.onerror = fail;
    }

    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!src || state === 'error') {
    return <span className={`smart-image is-fallback ${className}`} aria-hidden="true">{fallback}</span>;
  }

  return (
    <span className={`smart-image ${state === 'loaded' ? 'is-loaded' : 'is-loading'} ${className}`}>
      <span className="smart-image-placeholder" aria-hidden="true" />
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
      />
    </span>
  );
}
