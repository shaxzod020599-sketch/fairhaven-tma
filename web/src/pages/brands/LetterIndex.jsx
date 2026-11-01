import React, { useRef } from 'react';
import { m } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { SPRING } from '../../motion/index.js';
import { ALPHABET, useUnderHeader } from './useBrandDirectory.js';
import './LetterIndex.css';

export const letterId = (letter) => `bx-letter-${letter === '#' ? 'other' : letter.toLowerCase()}`;

/**
 * Sticky A to Z index. Letters with brands jump to their group (and move focus to its heading);
 * letters without brands stay visible but inactive. The current group's letter carries the sun mark.
 */
export default function LetterIndex({ available, active, onJump }) {
  const { t } = useI18n();
  const ref = useRef(null);
  useUnderHeader(ref);
  const letters = available.has('#') ? [...ALPHABET, '#'] : ALPHABET;
  return (
    <nav ref={ref} className="bx-letters" aria-label={t('brands.letters')}>
      <ol className="bx-letters-row">
        {letters.map((letter) =>
          available.has(letter) ? (
            <li key={letter}>
              <a
                href={`#${letterId(letter)}`}
                className={`bx-letter${active === letter ? ' is-active' : ''}`}
                aria-current={active === letter ? 'location' : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  onJump(letter);
                }}
              >
                {active === letter && (
                  <m.span className="bx-letter-mark" layoutId="bx-letter-mark" transition={SPRING.snappy} aria-hidden="true" />
                )}
                <span className="bx-letter-text">{letter}</span>
              </a>
            </li>
          ) : (
            <li key={letter} aria-hidden="true">
              <span className="bx-letter is-off">{letter}</span>
            </li>
          )
        )}
      </ol>
    </nav>
  );
}
