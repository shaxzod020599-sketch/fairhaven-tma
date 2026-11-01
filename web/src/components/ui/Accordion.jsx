import React, { useId, useState } from 'react';
import { LayoutGroup, m } from 'motion/react';
import { DURATION, EASE_OUT } from '../../motion/easings.js';
import { ChevronDown } from '../Icons.jsx';
import './Accordion.css';

/**
 * Disclosure list (FAQ, product details). Opening one slides the items below into place (transform only;
 * the height itself is never animated). `multiple` lets several stay open.
 *   <Accordion items={[{ id: 'use', title: 'Как принимать', content: <p>…</p> }]} defaultOpen={['use']} />
 */
export default function Accordion({ items, multiple = false, defaultOpen = [], headingLevel = 3, className = '' }) {
  const base = useId();
  const [open, setOpen] = useState(() => new Set(defaultOpen));
  const Heading = `h${headingLevel}`;

  const toggle = (id) =>
    setOpen((prev) => {
      const next = new Set(multiple ? prev : prev.has(id) ? [id] : []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <LayoutGroup>
      <div className={`ui-accordion ${className}`}>
        {items.map((item) => {
          const isOpen = open.has(item.id);
          const buttonId = `${base}-${item.id}-b`;
          const panelId = `${base}-${item.id}-p`;
          return (
            <m.div key={item.id} layout="position" className={`ui-acc-item${isOpen ? ' is-open' : ''}`}>
              <Heading className="ui-acc-heading">
                <button
                  id={buttonId}
                  type="button"
                  className="ui-acc-button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => toggle(item.id)}
                >
                  <span>{item.title}</span>
                  <ChevronDown size={20} className="ui-acc-chevron" />
                </button>
              </Heading>
              <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!isOpen} className="ui-acc-panel">
                {isOpen && (
                  <m.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: DURATION.ui, ease: EASE_OUT }}
                  >
                    {item.content}
                  </m.div>
                )}
              </div>
            </m.div>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
