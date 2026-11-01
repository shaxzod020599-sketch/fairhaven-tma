import React, { lazy } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import pages from '../seo/pages.json';
import { needForSlug, legacyRedirect } from '../seo/meta.js';
import CatalogView from './catalog/CatalogView.jsx';

const NotFound = lazy(() => import('./NotFound.jsx'));

/** /shop and the goal pages /shop/:need. Old life-stage slugs move to their goal; anything else is a 404. */
export default function Shop() {
  const { stage } = useParams();
  const { pathname, search } = useLocation();
  if (!stage) return <CatalogView />;
  const redirect = legacyRedirect(pages, pathname);
  if (redirect) return <Navigate to={`${redirect}${search}`} replace />;
  const need = needForSlug(pages, stage);
  if (!need) return <NotFound />;
  return <CatalogView key={need} need={need} />;
}
