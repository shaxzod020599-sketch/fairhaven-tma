import React from 'react';
import { SunMark } from './Wordmark.jsx';
import './EmptyState.css';

/**
 * Calm message for "nothing here": empty search, empty cart, load errors. The rising sun by default.
 *   <EmptyState title="Ничего не нашлось" text="Попробуйте другой запрос" action={<Button …/>} />
 */
export default function EmptyState({ icon, title, text, action, as: Heading = 'h2', className = '', ...rest }) {
  return (
    <div className={`ui-empty ${className}`} {...rest}>
      <span className="ui-empty-icon">{icon || <SunMark size={56} />}</span>
      {title && <Heading className="ui-empty-title t-h3">{title}</Heading>}
      {text && <p className="ui-empty-text t-muted">{text}</p>}
      {action && <div className="ui-empty-action">{action}</div>}
    </div>
  );
}
