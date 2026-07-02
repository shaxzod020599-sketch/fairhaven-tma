import React from 'react';
import { Link } from 'react-router-dom';

export default function Breadcrumbs({ trail = [] }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {trail.map((crumb, i) => {
          const last = i === trail.length - 1;
          return (
            <li key={i}>
              {last || !crumb.to ? (
                <span aria-current="page">{crumb.label}</span>
              ) : (
                <Link to={crumb.to}>{crumb.label}</Link>
              )}
              {!last && <span className="bc-sep" aria-hidden="true">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
