import React from 'react';
import { Link } from 'react-router-dom';

/** Reusable section heading with optional "see all" link. */
export default function SectionHeader({ title, desc, linkTo, linkLabel = 'seeAll' }) {
  return (
    <div className="section-header">
      <div className="section-header-text">
        <h2 className="section-title">{title}</h2>
        {desc && <p className="section-desc">{desc}</p>}
      </div>
      {linkTo && (
        <Link to={linkTo} className="link-see-all">{linkLabel} →</Link>
      )}
    </div>
  );
}
