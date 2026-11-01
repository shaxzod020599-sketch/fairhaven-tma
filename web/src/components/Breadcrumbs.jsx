import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import './Breadcrumbs.css';

/**
 * Path trail above a page title. The last crumb is the current page.
 *   <Breadcrumbs trail={[{ label: t('home'), to: '/' }, { label: t('catalog'), to: '/shop' }, { label: title }]} />
 */
export default function Breadcrumbs({ trail = [], className = '' }) {
  const { t } = useI18n();
  return (
    <nav className={`breadcrumbs ${className}`} aria-label={t('breadcrumbs')}>
      <ol>
        {trail.map((crumb, i) => {
          const last = i === trail.length - 1;
          return (
            <li key={i}>
              {last || !crumb.to ? (
                <span aria-current={last ? 'page' : undefined}>{crumb.label}</span>
              ) : (
                <Link to={crumb.to}>{crumb.label}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
