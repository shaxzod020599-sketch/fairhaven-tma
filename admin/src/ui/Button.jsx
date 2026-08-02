import React from 'react';
import { Icon } from './Icon';

export function Button({ variant = 'secondary', size = 'md', icon, children, className = '', ...props }) {
  return (
    <button className={`fh-button fh-button--${variant} fh-button--${size} ${className}`.trim()} type="button" {...props}>
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {children}
    </button>
  );
}
