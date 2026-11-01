import React, { useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { Tilt, PRODUCT_IMAGE_VT } from '../../motion/index.js';
import { Bottle, Search } from '../../components/Icons.jsx';
import Lightbox from './Lightbox.jsx';
import './Gallery.css';

const SWIPE = 40; // px of horizontal travel that counts as a swipe on touch screens

/**
 * The large packshot well (tilts toward the cursor, morphs in from the card that was clicked), thumbnails
 * when there are several photos, and the lightbox on click. `imageRef` gets the main <img> so the buy box
 * can fly it to the cart.
 */
export default function Gallery({ images, title, imageRef }) {
  const { t, tf } = useI18n();
  const [active, setActive] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const touch = useRef(null);
  const total = images.length;
  const go = (i) => setActive((i + total) % total);

  const onPointerDown = (e) => {
    if (e.pointerType === 'touch' && total > 1) touch.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(e.clientY - start.y)) {
      go(active + (dx < 0 ? 1 : -1));
      touch.current = 'swiped';
    }
  };

  if (!total) {
    return (
      <div className="pdp-gallery">
        <div className="pdp-well pdp-well--empty">
          <Bottle size={96} className="pdp-noimage" />
        </div>
      </div>
    );
  }

  return (
    <div className="pdp-gallery">
      <Tilt className="pdp-well">
        <button
          type="button"
          className="pdp-well-btn"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { touch.current = null; }}
          onClick={(e) => {
            // A swipe changes the photo; only a tap opens the lightbox.
            if (touch.current === 'swiped') {
              touch.current = null;
              e.preventDefault();
              return;
            }
            setZoomed(true);
          }}
          aria-label={total > 1 ? `${t('product.zoomOpen')}. ${tf('product.photoN', { n: active + 1, total })}` : t('product.zoomOpen')}
        >
          <img
            key={active}
            ref={imageRef}
            className="pdp-well-img"
            src={images[active]}
            alt={title}
            fetchpriority={active === 0 ? 'high' : undefined}
            decoding="async"
            draggable="false"
            style={{ viewTransitionName: PRODUCT_IMAGE_VT }}
          />
          <span className="pdp-well-zoom" aria-hidden="true">
            <Search size={18} />
          </span>
        </button>
      </Tilt>

      {total > 1 && (
        <ul className="pdp-thumbs" aria-label={t('product.photos')}>
          {images.map((src, i) => (
            <li key={src}>
              <button
                type="button"
                className="pdp-thumb"
                aria-current={i === active ? 'true' : undefined}
                aria-label={tf('product.photoN', { n: i + 1, total })}
                onClick={() => setActive(i)}
              >
                <img src={src} alt="" loading="lazy" decoding="async" draggable="false" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <AnimatePresence>
        {zoomed && (
          <Lightbox images={images} index={active} onIndex={setActive} title={title} onClose={() => setZoomed(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
