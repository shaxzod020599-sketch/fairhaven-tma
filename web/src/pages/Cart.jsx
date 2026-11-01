import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { useI18n } from '../i18n/index.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { formatSum, productTitle, productSpec, useCatalog, NEED_KEYS } from '../catalog/index.js';
import { Counter, EASE_OUT, SPRING } from '../motion/index.js';
import { Button, ProductCard, QuantityStepper, Rail, SectionHeader, useToast } from '../components/ui/index.js';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { ArrowLeft, ArrowRight, Bottle, NeedIcon, Package, ShieldCheck, Trash, Truck } from '../components/Icons.jsx';
import { useSeo } from '../seo/useSeo.js';
import SunRise from './cart/SunRise.jsx';
import FreeDeliveryBar from './cart/FreeDeliveryBar.jsx';
import PromoField from './cart/PromoField.jsx';
import Totals from './cart/Totals.jsx';
import './cart/Cart.css';

const DELIVERY_FEE = 25000;
const MAX_QTY = 100; // the order API refuses more of one item
const ADD_ONS = 10;
const GOALS = 6;

/** Products that serve the same goals as the cart, not already in it: most shared goals first, then cheaper. */
function useAddOns(items) {
  const { products, byId } = useCatalog();
  return useMemo(() => {
    if (!products?.length || !items.length) return [];
    const inCart = new Set(items.map((i) => String(i._id)));
    const needs = new Set();
    items.forEach((i) => (byId?.get(String(i._id))?.needs || []).forEach((n) => needs.add(n)));
    if (!needs.size) return [];
    return products
      .filter((p) => !inCart.has(String(p._id)) && p.isAvailable !== false && p.image)
      .map((p) => ({ p, score: (p.needs || []).filter((n) => needs.has(n)).length }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.p.price - b.p.price)
      .slice(0, ADD_ONS)
      .map((x) => x.p);
  }, [products, byId, items]);
}

function CartLine({ item }) {
  const { t, tf, lang } = useI18n();
  const { setQty, remove, add } = useCart();
  const { byId } = useCatalog();
  const toast = useToast();
  const product = byId?.get(String(item._id));
  const title = product ? productTitle(product, lang) : (lang === 'uz' ? item.nameUz || item.name : item.name);
  const image = item.imageUrl || product?.image;
  const href = `/product/${item._id}`;

  const drop = () => {
    remove(item._id);
    toast({
      id: 'cart-removed',
      message: tf('cart.removed', { name: title }),
      action: { label: t('cart.undo'), onClick: () => add(item, item.quantity) },
    });
  };

  return (
    <article className="crt-line">
      <Link to={href} className="crt-line-thumb" tabIndex={-1} aria-hidden="true">
        {image ? <img src={image} alt="" loading="lazy" decoding="async" /> : <Bottle size={32} />}
      </Link>
      <div className="crt-line-main">
        {product?.brandName && <span className="crt-line-brand t-mono">{product.brandName}</span>}
        <h3 className="crt-line-title">
          <Link to={href}>{title}</Link>
        </h3>
        {product?.spec && <p className="crt-line-spec">{productSpec(product, lang)}</p>}
        <p className="crt-line-unit t-num">{tf('cart.unitPrice', { price: formatSum(item.price, lang) })}</p>
      </div>
      <div className="crt-line-side">
        <QuantityStepper
          value={item.quantity}
          onChange={(q) => setQty(item._id, q)}
          onRemove={drop}
          max={MAX_QTY}
          label={title}
          size="sm"
        />
        <span className="crt-line-total t-price">
          <Counter value={item.price * item.quantity} format={(n) => formatSum(n, lang)} duration={0.4} />
        </span>
        <button type="button" className="crt-line-remove" onClick={drop} aria-label={tf('cart.co.removeOne', { name: title })}>
          <Trash size={18} />
          <span>{t('remove')}</span>
        </button>
      </div>
    </article>
  );
}

function EmptyCart() {
  const { t, tf, plural } = useI18n();
  const { products } = useCatalog();
  const reduce = useReducedMotion();

  const { productCount, brandCount, goals } = useMemo(() => {
    const list = products || [];
    const brands = new Set(list.map((p) => p.brandSlug).filter(Boolean));
    const perNeed = new Map(NEED_KEYS.map((k) => [k, 0]));
    list.forEach((p) => (p.needs || []).forEach((n) => perNeed.has(n) && perNeed.set(n, perNeed.get(n) + 1)));
    const top = [...perNeed].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, GOALS).map(([k]) => k);
    return { productCount: list.length, brandCount: brands.size, goals: top };
  }, [products]);

  const text = productCount && brandCount
    ? tf('cart.emptyText', {
        n: productCount,
        unit: plural(productCount, t('unitProducts')),
        b: brandCount,
        bunit: plural(brandCount, t('cart.brandsUnit')),
      })
    : t('cart.emptyTextShort');

  return (
    <div className="crt-empty">
      <SunRise />
      <m.div
        className="crt-empty-copy"
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.25 }}
      >
        <h1 className="t-h1 crt-empty-title">{t('cartEmpty')}</h1>
        <p className="crt-empty-text">{text}</p>
        <Button to="/shop" size="lg" iconEnd={<ArrowRight size={18} />}>
          {t('cart.toShop')}
        </Button>
      </m.div>
      {goals.length > 0 && (
        <nav className="crt-empty-goals" aria-labelledby="crt-goals-h">
          <h2 id="crt-goals-h" className="crt-empty-goals-title">{t('cart.emptyGoals')}</h2>
          <ul>
            {goals.map((key, i) => (
              <m.li
                key={key}
                initial={reduce ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.4 + i * 0.05 }}
              >
                <Link to={`/shop/${key}`} className="crt-goal">
                  <NeedIcon need={key} size={20} />
                  <span>{t(`need.${key}`)}</span>
                </Link>
              </m.li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}

export default function Cart() {
  useSeo();
  const { t, tf, plural } = useI18n();
  const { items, subtotal, count, appliedPromo } = useCart();
  const { get } = useSettings();
  const reduce = useReducedMotion();
  const addOns = useAddOns(items);

  const threshold = Number(get('free_delivery_threshold')) || 500000;
  const discount = appliedPromo?.discount || 0;
  const deliveryFee = subtotal === 0 || subtotal >= threshold ? 0 : DELIVERY_FEE;
  const total = Math.max(0, subtotal - discount + deliveryFee);

  const crumbs = [{ label: t('home'), to: '/' }, { label: t('cartTitle') }];

  if (count === 0) {
    return (
      <div className="crt-page crt-page--empty">
        <div className="container">
          <Breadcrumbs trail={crumbs} />
          <EmptyCart />
        </div>
      </div>
    );
  }

  return (
    <div className="crt-page">
      <div className="container">
        <Breadcrumbs trail={crumbs} />
        <header className="crt-head">
          <h1 className="t-h1">{t('cartTitle')}</h1>
          <span className="crt-head-count t-num">
            {tf('cart.count', { n: count, unit: plural(count, t('unitProducts')) })}
          </span>
        </header>

        <div className="crt-layout">
          <section className="crt-items" aria-labelledby="crt-items-h">
            <h2 id="crt-items-h" className="sr-only">{t('cart.itemsLabel')}</h2>
            <ul className="crt-list">
              <AnimatePresence initial={false} mode="popLayout">
                {items.map((item) => (
                  <m.li
                    key={item._id}
                    layout={!reduce}
                    initial={false}
                    animate={{ opacity: 1, x: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, x: -32, transition: { duration: 0.24, ease: EASE_OUT } }}
                    transition={SPRING.snappy}
                  >
                    <CartLine item={item} />
                  </m.li>
                ))}
              </AnimatePresence>
            </ul>
            <Link to="/shop" className="crt-continue">
              <ArrowLeft size={18} />
              {t('cart.continue')}
            </Link>
          </section>

          <aside className="crt-summary" aria-labelledby="crt-summary-h">
            <div className="crt-summary-card">
              <h2 id="crt-summary-h" className="crt-summary-title t-h3">{t('cart.summary')}</h2>
              <FreeDeliveryBar subtotal={subtotal} threshold={threshold} />
              <PromoField subtotal={subtotal} />
              <Totals
                subtotal={subtotal}
                discount={discount}
                promoCode={appliedPromo?.code || ''}
                deliveryFee={deliveryFee}
                total={total}
                live
              />
              <Button to="/checkout" size="lg" block magnetic iconEnd={<ArrowRight size={18} />}>
                {t('checkout')}
              </Button>
            </div>
            <ul className="crt-facts">
              <li><Package size={20} /><span>{t('cart.factPay')}</span></li>
              <li><Truck size={20} /><span>{t('cart.factDelivery')}</span></li>
              <li><ShieldCheck size={20} /><span>{t('cart.factOriginal')}</span></li>
            </ul>
          </aside>
        </div>

        {addOns.length > 0 && (
          <section className="crt-addons" aria-labelledby="crt-addons-h">
            <SectionHeader id="crt-addons-h" title={t('cart.addOns')} desc={t('cart.addOnsDesc')} />
            <Rail label={t('cart.addOns')} itemWidth="clamp(176px, 44vw, 248px)">
              {addOns.map((p) => (
                <ProductCard key={p._id} product={p} headingLevel={3} />
              ))}
            </Rail>
          </section>
        )}
      </div>
    </div>
  );
}
