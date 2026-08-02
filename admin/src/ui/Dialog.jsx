import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Dialog({ open, title, description, children, onClose, closeDisabled = false, width = '640px' }) {
  const titleId = useId();
  const descriptionId = useId();
  const closeRef = useRef(null);
  const panelRef = useRef(null);

  // Callers pass inline handlers, so `onClose` and `closeDisabled` change
  // identity on every render. Reading them through a ref keeps the effect
  // keyed on `open` alone — otherwise the initial focus call re-runs on each
  // keystroke and pulls focus out of whatever the operator is typing into.
  const latest = useRef({ onClose, closeDisabled });
  latest.current = { onClose, closeDisabled };

  useEffect(() => {
    if (!open) return undefined;
    const before = document.activeElement;
    closeRef.current?.focus();
    const keydown = (event) => {
      if (event.key === 'Escape' && !latest.current.closeDisabled) {
        latest.current.onClose?.();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll(FOCUSABLE)];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      before?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="fh-dialog-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !closeDisabled && onClose?.()}>
      <section
        ref={panelRef}
        className="fh-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        style={{ '--dialog-width': width }}
      >
        <header className="fh-dialog__head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button ref={closeRef} className="fh-icon-button" type="button" aria-label="Закрыть" disabled={closeDisabled} onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        <div className="fh-dialog__body">{children}</div>
      </section>
    </div>,
    document.body,
  );
}
