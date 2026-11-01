import React from 'react';
import './PackFan.css';

/**
 * A small stack of packshots on white plinths. Closed it is a tidy stack; it fans out when its host
 * (an element with .bx-fan-host) is hovered or focused, or always with `open`.
 * Decorative: the brand name next to it is the text, so the images carry alt="".
 */
export default function PackFan({ shots, size = 'md', open = false, className = '' }) {
  if (!shots?.length) return null;
  const mid = (shots.length - 1) / 2;
  return (
    <div className={`bx-fan bx-fan--${size}${open ? ' is-open' : ''} ${className}`} aria-hidden="true">
      {shots.map((p, i) => (
        <span key={p._id} className="bx-fan-card" style={{ '--i': i - mid, '--z': shots.length - Math.round(Math.abs(i - mid) * 2) }}>
          <img
            src={p.image}
            alt=""
            loading="lazy"
            decoding="async"
            // A photo that fails to load would leave an empty white card: drop the card instead.
            // When none is left, the empty fan goes too.
            onError={(e) => {
              const card = e.currentTarget.parentElement;
              card.hidden = true;
              if (!card.parentElement.querySelector('.bx-fan-card:not([hidden])')) card.parentElement.hidden = true;
            }}
          />
        </span>
      ))}
    </div>
  );
}
