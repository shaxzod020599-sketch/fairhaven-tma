import React from 'react';
import './Spinner.css';

/** Small ring for busy buttons. With `label` it is announced; without it, it is decoration. */
export default function Spinner({ label, size = 18, className = '' }) {
  return (
    <span
      className={`crt-spinner ${className}`}
      style={{ '--spin-size': `${size}px` }}
      role={label ? 'status' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
    />
  );
}
