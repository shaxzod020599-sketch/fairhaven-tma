import React, { Suspense, lazy, useCallback, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { useCatalog, useProduct, productTitle } from '../catalog/index.js';
import { getAllImages } from '../helpers.js';
import { RouteFallback } from '../motion/index.js';
import { Button, EmptyState, Skeleton, useAddToCart } from '../components/ui/index.js';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { Refresh } from '../components/Icons.jsx';
import { useSeo } from '../seo/useSeo.js';
import Gallery from './product/Gallery.jsx';
import BuyBox from './product/BuyBox.jsx';
import Details from './product/Details.jsx';
import StickyBar from './product/StickyBar.jsx';
import Rails from './product/Rails.jsx';
import './product/Product.css';

// App loads the 404 page lazily too; importing it here directly would pull it into the main bundle.
const NotFound = lazy(() => import('./NotFound.jsx'));

function ProductSkeleton() {
  return (
    <div className="container pdp-page" aria-busy="true">
      <div className="pdp-crumbs-skeleton"><Skeleton w={220} h={12} /></div>
      <div className="pdp-layout">
        <Skeleton className="pdp-skeleton-well" h="auto" r="var(--r-card)" />
        <div className="pdp-skeleton-lines">
          <Skeleton w="30%" h={12} />
          <Skeleton w="90%" h={40} />
          <Skeleton w="60%" h={40} />
          <Skeleton w="40%" h={14} />
          <Skeleton w="45%" h={36} />
          <Skeleton w="100%" h={56} r="var(--r-pill)" />
          <Skeleton w="100%" h={160} r="var(--r-well)" />
        </div>
      </div>
    </div>
  );
}

function ProductView({ product }) {
  const { t, lang } = useI18n();
  const addToCart = useAddToCart();
  const [qty, setQty] = useState(1);
  const imageRef = useRef(null);
  const buttonRef = useRef(null);
  const images = useMemo(() => getAllImages(product), [product]);
  const title = productTitle(product, lang);
  const need = product.needs[0];

  // The phone bar passes its own thumbnail: the main photo is off screen by then.
  const onAdd = useCallback(
    (sourceEl) => addToCart(product, { qty, sourceEl: sourceEl || imageRef.current }),
    [addToCart, product, qty]
  );

  return (
    <div className="pdp-page">
      <div className="container">
        <Breadcrumbs
          className="pdp-crumbs"
          trail={[
            { label: t('catalog'), to: '/shop' },
            ...(need ? [{ label: t(`need.${need}`), to: `/shop/${need}` }] : []),
            { label: title },
          ]}
        />
        <div className="pdp-layout">
          <Gallery images={images} title={title} imageRef={imageRef} />
          <BuyBox product={product} qty={qty} setQty={setQty} onAdd={onAdd} buttonRef={buttonRef} />
        </div>
        <div className="pdp-below section-tight">
          <Details product={product} />
        </div>
        <Rails product={product} />
      </div>
      <StickyBar product={product} targetRef={buttonRef} onAdd={onAdd} />
    </div>
  );
}

/** /product/:id. Unknown or malformed ids show the 404 page. */
export default function Product() {
  const { id } = useParams();
  const { t } = useI18n();
  const { reload } = useCatalog();
  const { product, status } = useProduct(id);
  const ready = status === 'ready' && product && String(product._id) === String(id);

  useSeo(ready ? { product } : null);

  if (status === 'notfound') {
    return (
      <Suspense fallback={<RouteFallback />}>
        <NotFound />
      </Suspense>
    );
  }
  if (status === 'error') {
    return (
      <div className="container pdp-page">
        <EmptyState
          as="h1"
          title={t('product.loadErrorTitle')}
          text={t('product.loadErrorText')}
          action={<Button onClick={reload} iconStart={<Refresh size={18} />}>{t('retry')}</Button>}
        />
      </div>
    );
  }
  if (!ready) return <ProductSkeleton />;
  // A new id remounts the view, so quantity and the chosen photo start fresh.
  return <ProductView key={product._id} product={product} />;
}
