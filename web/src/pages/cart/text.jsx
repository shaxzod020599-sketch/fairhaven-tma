import React, { Fragment } from 'react';

/**
 * Fills {name} placeholders in a translated string with React nodes (a bold sum, a link), so the
 * word order stays in the dictionary. Unknown placeholders are left as written.
 *   fill(t('cart.freeLeft'), { sum: <strong>25 000 сум</strong> })
 */
export function fill(text, nodes) {
  return String(text)
    .split(/(\{\w+\})/g)
    .map((part, i) => {
      const key = part.match(/^\{(\w+)\}$/)?.[1];
      return <Fragment key={i}>{key && key in nodes ? nodes[key] : part}</Fragment>;
    });
}
