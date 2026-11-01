import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m, useDragControls, useReducedMotion } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { SPRING, DURATION } from '../../motion/easings.js';
import { Close } from '../Icons.jsx';
import { IconButton } from './Button.jsx';
import './Sheet.css';

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

// Several sheets can be open at once (a filter sheet over a menu); the page unlocks when the last one closes.
let locks = 0;
let saved = null;
function lockPage() {
  locks += 1;
  if (locks > 1) return;
  const root = document.getElementById('root');
  const gap = window.innerWidth - document.documentElement.clientWidth;
  saved = { overflow: document.body.style.overflow, padding: document.body.style.paddingRight };
  document.body.style.overflow = 'hidden';
  if (gap > 0) document.body.style.paddingRight = `${gap}px`; // no layout jump when the scrollbar goes
  root?.setAttribute('inert', '');
}
function unlockPage() {
  locks = Math.max(0, locks - 1);
  if (locks > 0) return;
  document.body.style.overflow = saved?.overflow || '';
  document.body.style.paddingRight = saved?.padding || '';
  document.getElementById('root')?.removeAttribute('inert');
}

const OFFSCREEN = { right: { x: '100%' }, left: { x: '-100%' }, bottom: { y: '100%' } };

function Panel({ side, title, label, onClose, footer, children, className }) {
  const { t } = useI18n();
  const panelRef = useRef(null);
  const titleId = useId();
  const reduce = useReducedMotion();
  const dragControls = useDragControls();

  useEffect(() => {
    const opener = document.activeElement;
    lockPage();
    const panel = panelRef.current;
    (panel.querySelector('[data-autofocus]') || panel).focus({ preventScroll: true });
    return () => {
      unlockPage();
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, []);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // Bottom sheets can be pulled down by their head to close; a short pull springs back. The body keeps
  // its own scrolling because the drag starts only from the head.
  const pullable = side === 'bottom' && !reduce;
  const drag = pullable
    ? {
        drag: 'y',
        dragListener: false,
        dragControls,
        dragConstraints: { top: 0, bottom: 0 },
        dragElastic: { top: 0, bottom: 0.6 },
        onDragEnd: (_, info) => {
          if (info.offset.y > 120 || info.velocity.y > 600) onClose();
        },
      }
    : null;

  return (
    <div className="ui-sheet-root" onKeyDown={onKeyDown}>
      <m.div
        className="ui-sheet-backdrop"
        aria-hidden="true"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: DURATION.ui }}
      />
      <m.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : label}
        tabIndex={-1}
        className={`ui-sheet ui-sheet--${side} ${className}`}
        initial={OFFSCREEN[side]}
        animate={{ x: 0, y: 0 }}
        exit={OFFSCREEN[side]}
        transition={SPRING.snappy}
        {...drag}
      >
        <div
          className={`ui-sheet-head${pullable ? ' is-pullable' : ''}`}
          onPointerDown={pullable ? (e) => dragControls.start(e) : undefined}
        >
          {side === 'bottom' && <span className="ui-sheet-grab" aria-hidden="true" />}
          {title && (
            <h2 id={titleId} className="ui-sheet-title t-h3">
              {title}
            </h2>
          )}
          <IconButton label={t('close')} onClick={onClose} className="ui-sheet-close">
            <Close />
          </IconButton>
        </div>
        <div className="ui-sheet-body">{children}</div>
        {footer && <div className="ui-sheet-foot">{footer}</div>}
      </m.div>
    </div>
  );
}

/**
 * Modal panel from the right, the left or the bottom. Traps focus, closes on Esc, the backdrop or the close
 * button, locks page scroll and makes the page inert while open, and gives focus back to the opener.
 * Mark the element that should take focus first with data-autofocus.
 *   <Sheet open={open} onClose={() => setOpen(false)} side="bottom" title="Фильтры" footer={<Button …/>}>…</Sheet>
 */
export default function Sheet({ open, onClose, side = 'right', title, label, footer, className = '', children }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <Panel key="sheet" side={side} title={title} label={label} onClose={onClose} footer={footer} className={className}>
          {children}
        </Panel>
      )}
    </AnimatePresence>,
    document.body
  );
}
