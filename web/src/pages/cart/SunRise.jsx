import React from 'react';
import './SunRise.css';

/**
 * The big rising sun for the empty cart and the order confirmation: a disc with a soft glow comes up over
 * the horizon once (CSS, so it runs before hydration-heavy work), with two shorter lines as its reflection.
 * Decorative only. Under reduced motion it simply stands risen.
 */
export default function SunRise({ size = 'md', className = '' }) {
  return (
    <div className={`crt-sun crt-sun--${size} ${className}`} aria-hidden="true">
      <div className="crt-sun-sky">
        <span className="crt-sun-glow" />
        <span className="crt-sun-disc" />
      </div>
      <span className="crt-sun-line" />
      <span className="crt-sun-line crt-sun-line--2" />
      <span className="crt-sun-line crt-sun-line--3" />
    </div>
  );
}
