import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { m, useReducedMotion } from 'motion/react';
import { fetchOrder } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import { EASE_OUT } from '../motion/index.js';
import { Button, Skeleton } from '../components/ui/index.js';
import { useContacts } from '../components/shell/contacts.js';
import { ArrowRight, Telegram, User } from '../components/Icons.jsx';
import { useSeo } from '../seo/useSeo.js';
import SunRise from './cart/SunRise.jsx';
import OrderDetails from './cart/OrderDetails.jsx';
import './cart/OrderSuccess.css';

export default function OrderSuccess() {
  useSeo();
  const { id } = useParams();
  const { t, tf } = useI18n();
  const { hours, tgUrl } = useContacts();
  const reduce = useReducedMotion();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    // Guest orders are fetched with the one-time access token saved at checkout.
    const accessToken = sessionStorage.getItem(`order_t_${id}`) || '';
    fetchOrder(id, accessToken)
      .then((res) => { if (mounted) setOrder(res?.data || null); })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [id]);

  // The number comes from the address, so the thank-you reads at once, before the order loads.
  const shortId = String(order?._id || id || '').slice(-6).toUpperCase();
  const rise = (delay) => ({
    initial: reduce ? false : { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, ease: EASE_OUT, delay },
  });
  const steps = [t('cart.ok.step1'), t('cart.ok.step2'), t('cart.ok.step3')];

  return (
    <div className="ok-page">
      <div className="container">
        <header className="ok-hero">
          <SunRise size="lg" />
          <m.h1 className="t-h1 ok-title" {...rise(0.35)}>{tf('cart.ok.title', { n: shortId })}</m.h1>
          <m.p className="ok-lead" {...rise(0.45)}>{t('cart.ok.lead')}</m.p>
        </header>

        <div className="ok-layout">
          <m.section className="ok-card" aria-labelledby="ok-summary-h" {...rise(0.55)}>
            <h2 id="ok-summary-h" className="t-h3 ok-card-title">{t('cart.ok.summary')}</h2>
            {loading && (
              <div className="ok-skeleton" aria-busy="true">
                <Skeleton h={56} r={12} />
                <Skeleton h={56} r={12} />
                <Skeleton w="60%" h={16} />
              </div>
            )}
            {!loading && order && (
              <>
                <OrderDetails order={order} />
                <dl className="ok-facts">
                  {order.customerName && (
                    <div>
                      <dt>{t('cart.ok.recipient')}</dt>
                      <dd>{[order.customerName, order.customerPhone].filter(Boolean).join(', ')}</dd>
                    </div>
                  )}
                  {order.location?.addressString && (
                    <div>
                      <dt>{t('cart.ok.address')}</dt>
                      <dd>{order.location.addressString}</dd>
                    </div>
                  )}
                  <div>
                    <dt>{t('cart.ok.payment')}</dt>
                    <dd>{order.paymentMethod === 'card' ? t('cart.ok.payCard') : t('cart.ok.payCash')}</dd>
                  </div>
                </dl>
              </>
            )}
            {!loading && !order && (
              <div className="ok-hidden">
                <p>{t('cart.ok.hidden')}</p>
                <Button to="/account" variant="secondary" iconStart={<User size={18} />}>
                  {t('cart.ok.toAccount')}
                </Button>
              </div>
            )}
          </m.section>

          <m.section className="ok-next" aria-labelledby="ok-next-h" {...rise(0.65)}>
            <h2 id="ok-next-h" className="t-h3 ok-card-title">{t('cart.ok.next')}</h2>
            <ol className="ok-steps">
              {steps.map((text, i) => (
                <li key={i}>
                  <span className="ok-step-n t-num" aria-hidden="true">{i + 1}</span>
                  <span>
                    {text}
                    {i === 0 && hours && <span className="ok-hours"> {tf('cart.ok.hours', { hours })}</span>}
                  </span>
                </li>
              ))}
            </ol>
            <div className="ok-actions">
              <Button to="/shop" size="lg" iconEnd={<ArrowRight size={18} />}>{t('cart.continue')}</Button>
              {tgUrl && (
                <Button href={tgUrl} target="_blank" rel="noopener noreferrer" variant="secondary" size="lg" iconStart={<Telegram size={20} />}>
                  {t('cart.ok.ask')}
                </Button>
              )}
            </div>
          </m.section>
        </div>
      </div>
    </div>
  );
}
