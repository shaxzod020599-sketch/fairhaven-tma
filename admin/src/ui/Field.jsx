import React, { useId } from 'react';

export function Field({ label, hint, error, children }) {
  const hintId = useId();
  const child = React.cloneElement(children, {
    'aria-describedby': hint || error ? hintId : undefined,
    'aria-invalid': error ? 'true' : undefined,
  });
  return (
    <label className="fh-field">
      <span className="fh-field__label">{label}</span>
      {child}
      {(hint || error) && <span id={hintId} className={`fh-field__hint ${error ? 'is-error' : ''}`}>{error || hint}</span>}
    </label>
  );
}
