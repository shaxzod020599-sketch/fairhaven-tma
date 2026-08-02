import React from 'react';
import { Button } from './Button';

export function DataState({ title, message, actionLabel, onAction, tone = 'empty' }) {
  return (
    <div className={`fh-data-state fh-data-state--${tone}`}>
      <span className="fh-data-state__glyph" aria-hidden="true">FH</span>
      <h2>{title}</h2>
      {message && <p>{message}</p>}
      {actionLabel && <Button onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}
