import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const dismiss = useCallback((id) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);
  const show = useCallback((message, tone = 'success', options = {}) => {
    const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const duration = options.actionLabel ? 5000 : 4200;
    setItems((current) => [...current, { id, message, tone, ...options }]);
    window.setTimeout(() => dismiss(id), duration);
  }, [dismiss]);
  const value = useMemo(() => ({
    show,
    success: (m, options) => show(m, 'success', options),
    error: (m, options) => show(m, 'danger', options),
  }), [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fh-toast-stack" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={`fh-toast fh-toast--${item.tone}`}>
            <span>{item.message}</span>
            {item.actionLabel && (
              <button
                type="button"
                className="fh-toast__action"
                onClick={() => { dismiss(item.id); item.onAction?.(); }}
              >
                {item.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
