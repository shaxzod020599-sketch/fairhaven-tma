import React, { forwardRef, useId } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { EASE_OUT } from '../../motion/index.js';
import './Field.css';

/**
 * Labelled checkout input. The error replaces the hint below the field and is tied to it with
 * aria-describedby, so a screen reader hears why the field is invalid. `multiline` gives a textarea.
 * The ref reaches the input, which lets the form move focus to the first invalid field.
 */
const Field = forwardRef(function Field(
  { label, hint, error, optional, multiline = false, className = '', ...input },
  ref,
) {
  const reduce = useReducedMotion();
  const id = useId();
  const noteId = `${id}-note`;
  const note = error || hint;
  const Control = multiline ? 'textarea' : 'input';

  return (
    <div className={`crt-field${error ? ' is-error' : ''} ${className}`}>
      <label htmlFor={id} className="crt-field-label">
        {label}
        {optional && <span className="crt-field-optional">{optional}</span>}
      </label>
      <Control
        ref={ref}
        id={id}
        className={multiline ? 'crt-field-control crt-field-control--area' : 'crt-field-control'}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        {...input}
      />
      <AnimatePresence initial={false} mode="wait">
        {note && (
          <m.p
            key={error ? 'error' : 'hint'}
            id={noteId}
            className={error ? 'crt-field-note crt-field-error' : 'crt-field-note'}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
          >
            {note}
          </m.p>
        )}
      </AnimatePresence>
    </div>
  );
});

export default Field;
