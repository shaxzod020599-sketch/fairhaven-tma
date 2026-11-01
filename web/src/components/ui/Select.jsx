import React, { useId } from 'react';
import { ChevronDown } from '../Icons.jsx';
import './Select.css';

/**
 * Native select in a pill (the phone shows its own picker). onChange gets the new value.
 *   <Select label="Сортировка" hideLabel value={sort} onChange={setSort} options={[{ value, label }]} />
 */
export default function Select({ label, hideLabel = false, value, onChange, options, id, className = '', ...rest }) {
  const autoId = useId();
  const selectId = id || autoId;
  return (
    <div className={`ui-select ${className}`}>
      <label htmlFor={selectId} className={hideLabel ? 'sr-only' : 'ui-select-label'}>
        {label}
      </label>
      <span className="ui-select-box">
        <select id={selectId} value={value} onChange={(e) => onChange?.(e.target.value)} {...rest}>
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown size={18} className="ui-select-chevron" />
      </span>
    </div>
  );
}
