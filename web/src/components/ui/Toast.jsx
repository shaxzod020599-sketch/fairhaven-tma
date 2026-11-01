import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { SPRING, DURATION } from '../../motion/easings.js';
import { Close } from '../Icons.jsx';
import './Toast.css';

const ToastContext = createContext(null);
const MAX = 3;
let seq = 0;
const noToast = () => null;

function ToastItem({ toast, onDismiss }) {
  const { t } = useI18n();
  const [held, setHeld] = useState(false);

  // The timer stops while the toast is hovered or focused, so its action is never pulled away mid-reach.
  useEffect(() => {
    if (held || !toast.duration) return undefined;
    const timer = setTimeout(() => onDismiss(toast.key), toast.duration);
    return () => clearTimeout(timer);
  }, [held, toast.key, toast.duration, onDismiss]);

  return (
    <m.div
      layout="position"
      className="ui-toast"
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: SPRING.snappy }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: DURATION.hover } }}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setHeld(false);
      }}
    >
      <span className="ui-toast-dot" aria-hidden="true" />
      <p className="ui-toast-text">{toast.message}</p>
      {toast.action && (
        <button
          type="button"
          className="ui-toast-action"
          onClick={() => {
            toast.action.onClick();
            onDismiss(toast.key);
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" className="ui-toast-close" aria-label={t('close')} onClick={() => onDismiss(toast.key)}>
        <Close size={18} />
      </button>
    </m.div>
  );
}

/**
 * Hosts toasts at the bottom of the screen in a polite live region. Mount once near the root.
 * useToast()({ message, action: { label, onClick }, id, duration }) shows one; a toast with the same `id`
 * replaces the previous one (repeated "added to cart" never stacks). Returns the toast key.
 */
export function ToastProvider({ children }) {
  const { t } = useI18n();
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((key) => setToasts((list) => list.filter((x) => x.key !== key)), []);

  const show = useCallback(({ message, action, id, duration = 4000 }) => {
    seq += 1;
    const key = `t${seq}`;
    setToasts((list) => [...list.filter((x) => !id || x.id !== id), { key, id, message, action, duration }].slice(-MAX));
    return key;
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div className="ui-toasts" role="region" aria-label={t('notifications')}>
            <div className="ui-toasts-list" aria-live="polite">
              <AnimatePresence initial={false}>
                {toasts.map((toast) => (
                  <ToastItem key={toast.key} toast={toast} onDismiss={dismiss} />
                ))}
              </AnimatePresence>
            </div>
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

/** toast({ message, action?, id?, duration? }) -> key. Outside the provider it does nothing. */
export function useToast() {
  return useContext(ToastContext) || noToast;
}
