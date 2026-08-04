import React, { useState } from 'react';

/**
 * A number field the operator can actually empty.
 *
 * A plain controlled `<input type="number">` cannot be cleared here: clearing
 * it makes `event.target.value` an empty string, `Number('')` is `0`, and
 * `value={x || 0}` writes that `0` straight back into the box. The operator
 * deletes the zero, the zero reappears, and the only way to reach 425000 is to
 * type it *after* a leading zero that will not go away.
 *
 * So the typed text is held here exactly as typed while the field is being
 * edited, and the number is reported upward only when the text is a number.
 * An empty box reports 0 — «no price» is what the caller already means by 0 —
 * but the box itself stays empty until focus leaves, so the operator can type.
 */
export function NumberInput({ value, onChange, ...rest }) {
  // null means «not being edited» — show whatever the owner holds.
  const [typed, setTyped] = useState(null);
  const shown = typed ?? (value == null ? '' : String(value));

  const change = (raw) => {
    setTyped(raw);
    if (raw === '') return onChange(0);
    const next = Number(raw);
    // Half-typed input like «1.» or «-» is kept on screen but not reported —
    // sending NaN upward would blank the field on the next render.
    if (!Number.isNaN(next)) onChange(next);
  };

  return (
    <input
      {...rest}
      type="number"
      value={shown}
      onChange={(event) => change(event.target.value)}
      onBlur={() => setTyped(null)}
    />
  );
}
