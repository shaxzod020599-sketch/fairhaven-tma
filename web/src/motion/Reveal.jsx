import React, { createContext, useContext } from 'react';
import { m, useReducedMotion } from 'motion/react';
import { REVEAL, DURATION, EASE_OUT } from './easings.js';

// Inside a Stagger the parent decides when children play; their own delay would override its timing.
const InStagger = createContext(false);

const variantsFor = (y, delay) => ({
  // Not 0: an element at opacity 0 does not count as painted for LCP.
  hidden: { opacity: 0.001, y },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.reveal, ease: EASE_OUT, ...(delay ? { delay } : null) } },
});

/**
 * Fades and lifts its content into place the first time it scrolls into view.
 *   <Reveal as="section" className="…">…</Reveal>
 * Inside <Stagger> it plays in sequence with its siblings. Reduced motion: rendered in place, no animation.
 */
export function Reveal({ as = 'div', y = REVEAL.y, delay = 0, children, ...rest }) {
  const reduce = useReducedMotion();
  const inStagger = useContext(InStagger);
  const Tag = m[as];
  if (reduce) return <Tag {...rest}>{children}</Tag>;
  if (inStagger) {
    return (
      <Tag variants={variantsFor(y, 0)} {...rest}>
        {children}
      </Tag>
    );
  }
  return (
    <Tag
      variants={variantsFor(y, delay)}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: REVEAL.margin }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * Plays the <Reveal> children one after another (60 ms apart, at most 360 ms for the whole group).
 *   <Stagger as="ul" className="grid">{items.map((x) => <Reveal as="li" key={x.id}>…</Reveal>)}</Stagger>
 */
export function Stagger({ as = 'div', stagger = REVEAL.stagger, delay = 0, children, ...rest }) {
  const reduce = useReducedMotion();
  const Tag = m[as];
  if (reduce) return <Tag {...rest}>{children}</Tag>;
  const count = React.Children.count(children);
  const step = count > 1 ? Math.min(stagger, REVEAL.maxStagger / (count - 1)) : 0;
  return (
    <InStagger.Provider value>
      <Tag
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: REVEAL.margin }}
        variants={{ hidden: {}, show: { transition: { staggerChildren: step, delayChildren: delay } } }}
        {...rest}
      >
        {children}
      </Tag>
    </InStagger.Provider>
  );
}
