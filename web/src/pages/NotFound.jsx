import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { Leaf } from '../components/Icons.jsx';

export default function NotFound() {
  const { t } = useI18n();
  return (
    <div className="container not-found">
      <div className="not-found-art" aria-hidden="true"><Leaf width={80} height={80} /></div>
      <h1 className="not-found-code">404</h1>
      <h2 className="page-title">{t('notFoundTitle')}</h2>
      <p className="not-found-desc">{t('notFoundDesc')}</p>
      <Link to="/" className="btn btn-primary btn-lg">{t('goHome')}</Link>
    </div>
  );
}
