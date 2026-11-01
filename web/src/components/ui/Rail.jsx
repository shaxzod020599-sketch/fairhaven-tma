import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { ChevronLeft, ChevronRight } from '../Icons.jsx';
import { IconButton } from './Button.jsx';
import './Rail.css';

const DRAG_THRESHOLD = 6; // px a mouse must travel before a press counts as a drag, not a click

/**
 * Horizontal row that snaps to items. Touch scrolls natively; a mouse can drag it; the arrows page by
 * one view and grey out at the ends; focused, it scrolls with the arrow keys.
 * `label` names the region. Each child becomes one item; `itemWidth` is any CSS length.
 *   <Rail label="Новинки" itemWidth="clamp(200px, 22vw, 280px)">{items.map((p) => <ProductCard key={p._id} product={p} />)}</Rail>
 */
export default function Rail({ label, itemWidth = 'clamp(168px, 44vw, 272px)', arrows = true, className = '', children }) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const scroller = useRef(null);
  const drag = useRef(null);
  const [ends, setEnds] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEnds({ start: el.scrollLeft <= 2, end: el.scrollLeft >= max - 2 });
  }, []);

  useEffect(() => {
    const el = scroller.current;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, [measure]);

  const page = (dir) => {
    const el = scroller.current;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: reduce ? 'auto' : 'smooth' });
  };

  const onPointerDown = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag.current = { x: e.clientX, left: scroller.current.scrollLeft, moved: false, id: e.pointerId };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD) return;
    if (!d.moved) {
      d.moved = true;
      scroller.current.setPointerCapture(d.id);
      scroller.current.classList.add('is-dragging');
    }
    scroller.current.scrollLeft = d.left - dx;
  };
  const endDrag = () => {
    const d = drag.current;
    if (!d) return;
    scroller.current.classList.remove('is-dragging'); // snapping returns and settles on the nearest item
    if (!d.moved) drag.current = null;
    // The click (if any) fires right after pointerup; forget the drag once it has had its chance.
    else setTimeout(() => (drag.current = null), 0);
  };
  // A drag that ends over a card must not open it.
  const onClickCapture = (e) => {
    if (!drag.current?.moved) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const items = React.Children.toArray(children);
  return (
    <div className={`ui-rail ${className}`} style={{ '--rail-item': itemWidth }}>
      <ul
        ref={scroller}
        className="ui-rail-track"
        role="region"
        aria-label={label}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
      >
        {items.map((child) => (
          <li key={child.key} className="ui-rail-item">
            {child}
          </li>
        ))}
      </ul>
      {arrows && !(ends.start && ends.end) && (
        <div className="ui-rail-arrows">
          <IconButton label={t('scrollPrev')} variant="outline" onClick={() => page(-1)} disabled={ends.start}>
            <ChevronLeft />
          </IconButton>
          <IconButton label={t('scrollNext')} variant="outline" onClick={() => page(1)} disabled={ends.end}>
            <ChevronRight />
          </IconButton>
        </div>
      )}
    </div>
  );
}
