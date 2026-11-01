import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { m } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { DURATION, EASE_OUT, SPRING } from '../../motion/index.js';
import { IconButton } from '../../components/ui/index.js';
import { ChevronLeft, ChevronRight, Close, Minus, Plus } from '../../components/Icons.jsx';
import './Lightbox.css';

const ZOOM = 2.5;
const DRAG = 5; // px before a press on the zoomed photo counts as panning, not a click
const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

const clamp = (v, max) => Math.max(-max, Math.min(max, v));

/**
 * Full-screen photo viewer. Esc closes, the arrow keys change the photo, + and − zoom; a click zooms into
 * the clicked point and dragging pans the zoomed photo. Traps focus, locks the page and returns focus.
 */
export default function Lightbox({ images, index, onIndex, title, onClose }) {
  const { t, tf } = useI18n();
  const dialogRef = useRef(null);
  const imgRef = useRef(null);
  const press = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const total = images.length;

  // The photo may only move as far as its zoomed edges reach the frame.
  const bounds = (z) => {
    const img = imgRef.current;
    if (!img) return { x: 0, y: 0 };
    return { x: (img.offsetWidth * (z - 1)) / 2, y: (img.offsetHeight * (z - 1)) / 2 };
  };
  const setZoomAt = (z, point = { x: 0, y: 0 }) => {
    const b = bounds(z);
    setZoom(z);
    setPan(z === 1 ? { x: 0, y: 0 } : { x: clamp(-point.x * (z - 1), b.x), y: clamp(-point.y * (z - 1), b.y) });
  };
  const show = (i) => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    onIndex((i + total) % total);
  };

  useEffect(() => {
    const opener = document.activeElement;
    const root = document.getElementById('root');
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root?.setAttribute('inert', '');
    dialogRef.current?.querySelector('[data-autofocus]')?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = overflow;
      root?.removeAttribute('inert');
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, []);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    } else if (e.key === 'ArrowRight' && total > 1) {
      e.preventDefault();
      show(index + 1);
    } else if (e.key === 'ArrowLeft' && total > 1) {
      e.preventDefault();
      show(index - 1);
    } else if (e.key === '+' || e.key === '=') {
      setZoomAt(ZOOM);
    } else if (e.key === '-') {
      setZoomAt(1);
    } else if (e.key === 'Tab') {
      const items = [...dialogRef.current.querySelectorAll(FOCUSABLE)];
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    press.current = { x: e.clientX, y: e.clientY, pan, moved: false };
    if (zoom > 1) e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    const p = press.current;
    if (!p || zoom === 1) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!p.moved && Math.hypot(dx, dy) < DRAG) return;
    p.moved = true;
    setPanning(true);
    const b = bounds(zoom);
    setPan({ x: clamp(p.pan.x + dx, b.x), y: clamp(p.pan.y + dy, b.y) });
  };
  const onPointerUp = (e) => {
    const p = press.current;
    press.current = null;
    setPanning(false);
    if (!p || p.moved) return;
    if (zoom > 1) {
      setZoomAt(1);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    setZoomAt(ZOOM, { x: e.clientX - (r.left + r.width / 2), y: e.clientY - (r.top + r.height / 2) });
  };

  return createPortal(
    <m.div
      ref={dialogRef}
      className="pdp-lb"
      role="dialog"
      aria-modal="true"
      aria-label={tf('product.lightbox', { title })}
      onKeyDown={onKeyDown}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: DURATION.ui, ease: EASE_OUT }}
    >
      <div className="pdp-lb-bar">
        <p className="pdp-lb-count t-mono" aria-live="polite">
          {total > 1 ? tf('product.photoN', { n: index + 1, total }) : title}
        </p>
        <div className="pdp-lb-tools">
          <IconButton
            label={zoom > 1 ? t('product.zoomOut') : t('product.zoomIn')}
            variant="outline"
            className="pdp-lb-btn"
            onClick={() => setZoomAt(zoom > 1 ? 1 : ZOOM)}
          >
            {zoom > 1 ? <Minus size={20} /> : <Plus size={20} />}
          </IconButton>
          <IconButton label={t('close')} variant="outline" className="pdp-lb-btn" onClick={onClose} data-autofocus>
            <Close size={20} />
          </IconButton>
        </div>
      </div>

      <div
        className={`pdp-lb-stage${zoom > 1 ? ' is-zoomed' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { press.current = null; setPanning(false); }}
      >
        {/* The frame plays the entrance; the photo inside moves by CSS so pan and zoom never fight it. */}
        <m.div
          key={images[index]}
          className="pdp-lb-frame"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={SPRING.snappy}
        >
          <img
            ref={imgRef}
            className={`pdp-lb-img${panning ? ' is-panning' : ''}`}
            src={images[index]}
            alt={title}
            draggable="false"
            style={{ '--pan-x': `${pan.x}px`, '--pan-y': `${pan.y}px`, '--zoom': zoom }}
          />
        </m.div>
      </div>

      <p className="pdp-lb-hint t-small">{t('product.zoomHint')}</p>

      {total > 1 && (
        <>
          <IconButton label={t('product.prevPhoto')} variant="solid" size="lg" className="pdp-lb-nav pdp-lb-nav--prev" onClick={() => show(index - 1)}>
            <ChevronLeft size={22} />
          </IconButton>
          <IconButton label={t('product.nextPhoto')} variant="solid" size="lg" className="pdp-lb-nav pdp-lb-nav--next" onClick={() => show(index + 1)}>
            <ChevronRight size={22} />
          </IconButton>
        </>
      )}
    </m.div>,
    document.body
  );
}
