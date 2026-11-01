import React, { createContext, useContext, useId } from 'react';
import { m } from 'motion/react';
import { SPRING } from '../../motion/easings.js';
import './Chip.css';

const GroupContext = createContext(null);

/**
 * Toggle chip (aria-pressed). Inside a ChipGroup it reads and changes the group value; alone, pass
 * `selected` and `onClick`. A zero `count` disables the chip unless it is already selected.
 *   <Chip value="sleep" count={12} icon={<Moon />}>Сон и стресс</Chip>
 */
export function Chip({ value, selected, count, icon, onClick, disabled, className = '', children, ...rest }) {
  const group = useContext(GroupContext);
  const isOn = group ? group.isSelected(value) : Boolean(selected);
  const off = disabled || (count === 0 && !isOn);
  const handle = (e) => {
    onClick?.(e);
    if (group && !e.defaultPrevented) group.toggle(value);
  };
  return (
    <button
      type="button"
      aria-pressed={isOn}
      disabled={off}
      onClick={handle}
      className={`ui-chip${isOn ? ' is-on' : ''} ${className}`}
      {...rest}
    >
      {/* One sliding indicator per single-choice group; with several choices each chip fills itself. */}
      {isOn && group?.layoutId && (
        <m.span className="ui-chip-fill" layoutId={group.layoutId} transition={SPRING.snappy} aria-hidden="true" />
      )}
      <span className="ui-chip-label">
        {icon}
        {children}
        {count != null && <span className="ui-chip-count t-mono">{count}</span>}
      </span>
    </button>
  );
}

/**
 * A row of chips sharing one value. Single choice: `value` is a string or null, and pressing the chosen chip
 * clears it. `multiple`: `value` is an array. `scroll` keeps the row on one line and lets it scroll sideways.
 *   <ChipGroup label={t('groupNeeds')} value={need} onChange={setNeed}>{…chips}</ChipGroup>
 */
export function ChipGroup({ label, value, onChange, multiple = false, scroll = false, className = '', children, ...rest }) {
  const autoId = useId();
  const list = multiple ? (Array.isArray(value) ? value : []) : null;
  const ctx = {
    layoutId: multiple ? null : `chip-${autoId}`,
    isSelected: (v) => (multiple ? list.includes(v) : value === v),
    toggle: (v) => {
      if (multiple) onChange?.(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
      else onChange?.(value === v ? null : v);
    },
  };
  return (
    <GroupContext.Provider value={ctx}>
      <div role="group" aria-label={label} className={`ui-chips${scroll ? ' ui-chips--scroll' : ''} ${className}`} {...rest}>
        {children}
      </div>
    </GroupContext.Provider>
  );
}

export default Chip;
