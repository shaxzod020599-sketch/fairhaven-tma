import React from 'react';

export function Card({ as: Tag = 'section', className = '', children, ...props }) {
  return <Tag className={`fh-card ${className}`.trim()} {...props}>{children}</Tag>;
}
