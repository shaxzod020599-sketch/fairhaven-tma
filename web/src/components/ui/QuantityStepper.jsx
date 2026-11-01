import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Minus, Plus, Trash } from '../Icons.jsx';
import './QuantityStepper.css';

/**
 * − value + in one pill, 44 px targets. With `onRemove`, the minus becomes a remove button at `min`.
 * `label` names what is counted (the product title) for screen readers.
 *   <QuantityStepper value={qty} onChange={setQty} onRemove={() => remove(id)} label={title} />
 */
export default function QuantityStepper({ value, onChange, onRemove, min = 1, max = 99, label, size = 'md', className = '' }) {
  const { t } = useI18n();
  const atMin = value <= min;
  const removing = atMin && onRemove;
  const named = (word) => (label ? `${word}: ${label}` : word);

  return (
    <div className={`ui-stepper ui-stepper--${size} ${className}`} role="group" aria-label={label}>
      <button
        type="button"
        className="ui-stepper-btn"
        onClick={() => (removing ? onRemove() : onChange(Math.max(min, value - 1)))}
        disabled={atMin && !onRemove}
        aria-label={named(removing ? t('remove') : t('decrease'))}
      >
        {removing ? <Trash size={18} /> : <Minus size={18} />}
      </button>
      <output className="ui-stepper-value t-num" aria-live="polite">
        {value}
      </output>
      <button
        type="button"
        className="ui-stepper-btn"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={named(t('increase'))}
      >
        <Plus size={18} />
      </button>
    </div>
  );
}
