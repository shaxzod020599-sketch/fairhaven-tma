import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from '../Icons.jsx';
import './SectionHeader.css';

/**
 * Section title row: heading, optional eyebrow (one per three sections at most) and lead text on the left,
 * an optional link or any `action` on the right.
 *   <SectionHeader title="Новинки" desc="…" linkTo="/shop?sort=new" linkLabel="Все новинки" />
 */
export default function SectionHeader({
  title,
  eyebrow,
  desc,
  linkTo,
  linkLabel,
  action,
  as: Heading = 'h2',
  size = 'h2',
  id,
  className = '',
}) {
  return (
    <div className={`ui-sechead ${className}`}>
      <div className="ui-sechead-text">
        {eyebrow && <p className="ui-sechead-eyebrow t-mono">{eyebrow}</p>}
        <Heading id={id} className={`ui-sechead-title t-${size}`}>
          {title}
        </Heading>
        {desc && <p className="ui-sechead-desc t-muted">{desc}</p>}
      </div>
      {action ||
        (linkTo && linkLabel && (
          <Link to={linkTo} className="ui-sechead-link">
            {linkLabel}
            <ArrowRight size={18} />
          </Link>
        ))}
    </div>
  );
}
