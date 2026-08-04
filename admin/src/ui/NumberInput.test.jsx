import React, { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NumberInput } from './NumberInput';

/** The real usage: an owner holding a number, exactly as the pages do. */
function Host({ initial = 0 }) {
  const [value, setValue] = useState(initial);
  return (
    <label>
      Цена
      <NumberInput value={value} onChange={setValue} aria-label="Цена" />
    </label>
  );
}

describe('NumberInput', () => {
  it('lets the operator clear a zero and type a real sum', async () => {
    // The bug this exists for: clearing the box made Number('') === 0, and the
    // owner wrote that 0 straight back — so «0» could never be deleted, and a
    // price could only ever be typed after a leading zero.
    render(<Host initial={0} />);
    const field = screen.getByLabelText('Цена');

    await userEvent.clear(field);
    expect(field).toHaveValue(null); // the box is empty, not «0»

    await userEvent.type(field, '425000');
    expect(field).toHaveValue(425000);
  });

  it('reports an emptied field as zero to the owner', async () => {
    render(<Host initial={425000} />);
    const field = screen.getByLabelText('Цена');

    await userEvent.clear(field);
    expect(field).toHaveValue(null);

    // Leaving the field settles it to what the owner now holds: 0.
    await userEvent.tab();
    expect(field).toHaveValue(0);
  });

  it('follows a value the owner changes from outside', async () => {
    function Outside() {
      const [value, setValue] = useState(10);
      return (
        <>
          <NumberInput value={value} onChange={setValue} aria-label="Цена" />
          <button type="button" onClick={() => setValue(99)}>set</button>
        </>
      );
    }
    render(<Outside />);

    await userEvent.click(screen.getByRole('button', { name: 'set' }));
    expect(screen.getByLabelText('Цена')).toHaveValue(99);
  });
});
