import React from 'react';
import { m, useReducedMotion } from 'motion/react';
import { SPRING } from '../../motion/index.js';

const STEP = 0.03;
const MAX_STAGGER = 0.36;

/**
 * Display heading whose letters settle into place one after another. The letters are painted from the
 * first frame (only their position moves), so the heading never waits for the animation. Screen readers
 * get the plain text once.
 */
export default function KineticTitle({ text, as: Tag = 'h1', className = '', ...rest }) {
  const reduce = useReducedMotion();
  const words = String(text).split(' ');
  const total = text.replace(/ /g, '').length;
  const step = total > 1 ? Math.min(STEP, MAX_STAGGER / (total - 1)) : 0;
  let n = 0;
  return (
    <Tag className={`bx-kinetic ${className}`} {...rest}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, wi) => (
          <React.Fragment key={wi}>
            {wi > 0 && ' '}
            <span className="bx-kinetic-word">
              {[...word].map((ch, ci) => {
                const i = n++;
                if (reduce) return <span key={ci}>{ch}</span>;
                return (
                  <m.span
                    key={ci}
                    className="bx-kinetic-char"
                    initial={{ y: '0.32em', rotate: 6 }}
                    animate={{ y: '0em', rotate: 0 }}
                    transition={{ ...SPRING.soft, delay: i * step }}
                  >
                    {ch}
                  </m.span>
                );
              })}
            </span>
          </React.Fragment>
        ))}
      </span>
    </Tag>
  );
}
