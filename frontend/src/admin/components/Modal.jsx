import React, { useEffect } from 'react';
import { pushBackButton, popBackButton } from '../../utils/telegram';

export default function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    // Override Telegram BackButton: while modal is open, back closes the
    // modal instead of falling through to the admin/exit handler.
    const backHandler = () => onClose?.();
    pushBackButton(backHandler);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      popBackButton(backHandler);
    };
  }, [onClose]);

  return (
    <div className="ap-modal-backdrop" onClick={onClose}>
      <div
        className={`ap-modal ${wide ? 'wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ap-modal-head">
          <h3 className="ap-modal-title">{title}</h3>
          <button className="ap-modal-close" onClick={onClose} aria-label="Закрыть">×</button>
        </div>
        <div className="ap-modal-body">{children}</div>
        {footer && <div className="ap-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = 'Удалить', onConfirm, onClose, tone = 'danger' }) {
  return (
    <Modal
      title={title || 'Подтверждение'}
      onClose={onClose}
      footer={
        <>
          <button className="ap-btn ap-btn-ghost" onClick={onClose}>Отмена</button>
          <button
            className={`ap-btn ${tone === 'danger' ? 'ap-btn-danger' : 'ap-btn-primary'}`}
            onClick={() => { onConfirm?.(); onClose?.(); }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="ap-muted">{message}</p>
    </Modal>
  );
}
