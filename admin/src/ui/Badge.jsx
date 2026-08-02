import React from 'react';

export function Badge({ tone = 'neutral', children }) {
  return <span className={`fh-badge fh-badge--${tone}`}>{children}</span>;
}
