import React, { useId } from 'react';
import { Link } from 'react-router-dom';
import './Wordmark.css';

/**
 * The rising sun: a sun disc coming up over the horizon line, with its reflection below.
 * It rises once on mount and glows on hover of any parent with .has-sun (the wordmark sets it).
 *   <SunMark size={40} />
 */
export function SunMark({ size = 32, rise = true, className = '', title }) {
  const clip = `sun-${useId().replace(/:/g, '')}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={`ui-sun${rise ? ' ui-sun--rise' : ''} ${className}`}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      <defs>
        <clipPath id={clip}>
          <rect x="0" y="0" width="32" height="20" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <circle className="ui-sun-glow" cx="16" cy="20" r="13" />
        <circle className="ui-sun-disc" cx="16" cy="20" r="9" />
      </g>
      <path className="ui-sun-line" d="M3 20.5h26" />
      <path className="ui-sun-line ui-sun-line--short" d="M9 25h14" />
      <path className="ui-sun-line ui-sun-line--shorter" d="M13 29h6" />
    </svg>
  );
}

/**
 * «FairHaven» with the sun mark. A link home by default; pass `to={null}` for plain text.
 * `size` is the mark in px; the name scales with it. Lines follow the text colour (floor and stage).
 */
export function Wordmark({ to = '/', size = 28, className = '', style, ...rest }) {
  const inner = (
    <>
      <SunMark size={size} />
      <span className="ui-wordmark-text">FairHaven</span>
    </>
  );
  const cls = `ui-wordmark has-sun ${className}`;
  const sized = { '--wordmark': `${size}px`, ...style };
  if (to == null) return <span className={cls} style={sized} {...rest}>{inner}</span>;
  return (
    <Link to={to} className={cls} style={sized} {...rest}>
      {inner}
    </Link>
  );
}

export default Wordmark;
