import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { useI18n } from '../i18n/index.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { createOrder } from '../api.js';
import { formatSum, productTitle, useCatalog } from '../catalog/index.js';
import { EASE_OUT, SPRING } from '../motion/index.js';
import { Button } from '../components/ui/index.js';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import YandexMapPicker from '../components/YandexMapPicker.jsx';
import { Alert, ArrowLeft, Bottle, Check, MapPin, Trash } from '../components/Icons.jsx';
import { useSeo } from '../seo/useSeo.js';
import SunRise from './cart/SunRise.jsx';
import Field from './cart/Field.jsx';
import Totals from './cart/Totals.jsx';
import FreeDeliveryBar from './cart/FreeDeliveryBar.jsx';
import Spinner from './cart/Spinner.jsx';
import TelegramLogin from './account/TelegramLogin.jsx';
import './cart/Checkout.css';

const DELIVERY_FEE = 25000;
const REQUIRED = ['name', 'phone', 'address'];
const PROMO_ERRORS = ['invalid_promo', 'first_order_only', 'already_used', 'min_order_not_met'];
const CITY_DEFAULT = { ru: 'Ташкент', uz: 'Toshkent' };

/** Numbered block whose number turns into a check once its fields are filled. */
function Block({ n, id, title, done, children }) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  return (
    <section className={`co-block${done ? ' is-done' : ''}`} aria-labelledby={id}>
      <header className="co-block-head">
        <span className="co-block-mark" aria-hidden="true">
          <AnimatePresence initial={false} mode="popLayout">
            {done ? (
              <m.span
                key="done"
                className="co-block-check"
                initial={reduce ? { opacity: 0 } : { scale: 0.3, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={reduce ? { duration: 0.15 } : SPRING.pop}
              >
                <Check size={18} />
              </m.span>
            ) : (
              <m.span
                key="n"
                className="co-block-n t-num"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {n}
              </m.span>
            )}
          </AnimatePresence>
        </span>
        <h2 id={id} className="co-block-title">
          {title}
          <span className="sr-only">, {done ? t('cart.co.stepDone') : t('cart.co.stepTodo')}</span>
        </h2>
      </header>
      <div className="co-block-body">{children}</div>
    </section>
  );
}

export default function Checkout() {
  useSeo();
  const { t, tf, lang } = useI18n();
  const { items, subtotal, clear, remove, appliedPromo, clearPromo } = useCart();
  const { get } = useSettings();
  const { user, isLoading } = useAuth();
  const { byId } = useCatalog();
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    // The admin "delivery_city" setting holds a region slogan ("По всему Узбекистану"),
    // not a city, so it must not be prefilled into the address.
    city: CITY_DEFAULT[lang] || CITY_DEFAULT.ru,
    address: '',
    payment: 'cash',
    comment: '',
  });

  // The default follows a language switch until the buyer types their own city.
  useEffect(() => {
    setForm((f) => (Object.values(CITY_DEFAULT).includes(f.city)
      ? { ...f, city: CITY_DEFAULT[lang] || CITY_DEFAULT.ru }
      : f));
  }, [lang]);

  // Logged-in Telegram users get their profile prefilled (only into
  // fields they haven't typed in yet).
  useEffect(() => {
    if (!user) return;
    setForm((f) => ({
      ...f,
      name: f.name || [user.firstName, user.lastName].filter(Boolean).join(' '),
      phone: f.phone || user.phone || '',
    }));
  }, [user]);
  const [errors, setErrors] = useState({});
  const [dirty, setDirty] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [promoError, setPromoError] = useState(false);
  const [unavailable, setUnavailable] = useState(null); // product ids the server refused, or [] if it named none
  const [mapOpen, setMapOpen] = useState(false);
  // Pin coordinates from the map picker, forwarded so the operators'
  // channel receipt gets working Yandex/Google map links.
  const [mapCoords, setMapCoords] = useState(null);
  const refs = { name: useRef(null), phone: useRef(null), address: useRef(null) };

  const threshold = Number(get('free_delivery_threshold')) || 500000;
  const deliveryFee = subtotal >= threshold ? 0 : DELIVERY_FEE;
  const discount = appliedPromo?.discount || 0;
  const total = Math.max(0, subtotal - discount + deliveryFee);

  const contactsDone = Boolean(form.name.trim() && form.phone.trim());
  const deliveryDone = Boolean(form.address.trim());

  const set = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setErrors((er) => ({ ...er, [field]: '' }));
    setDirty((d) => (d[field] ? d : { ...d, [field]: true }));
  };

  // A required field the buyer typed in and then emptied is flagged when they leave it, not before.
  const check = (field) => () => {
    if (dirty[field] && !form[field].trim()) setErrors((er) => ({ ...er, [field]: t('cart.co.required') }));
  };

  const validate = () => {
    const er = {};
    REQUIRED.forEach((field) => {
      if (!form[field].trim()) er[field] = t('cart.co.required');
    });
    setErrors(er);
    const first = REQUIRED.find((field) => er[field]);
    if (first) refs[first].current?.focus();
    return !first;
  };

  const submit = async (e) => {
    e.preventDefault();
    setServerError('');
    setPromoError(false);
    setUnavailable(null);
    if (!validate()) {
      setServerError(t('cart.co.fixFields'));
      return;
    }

    // Server resolves names and prices from the DB: send ids + quantities only.
    const payload = {
      items: items.map((i) => ({
        productId: i._id,
        quantity: i.quantity,
      })),
      customerName: form.name.trim(),
      customerPhone: form.phone.trim(),
      email: form.email.trim(),
      paymentMethod: form.payment,
      notes: form.comment.trim(),
      promoCode: appliedPromo?.code || '',
      location: {
        // Coordinates come from the map picker when used; 0/0 = text-only.
        lat: mapCoords ? mapCoords.lat : 0,
        lng: mapCoords ? mapCoords.lng : 0,
        addressString: form.address.startsWith(form.city)
          ? form.address
          : `${form.city}, ${form.address}`,
      },
    };

    setSubmitting(true);
    try {
      const res = await createOrder(payload);
      // One-time capability token: lets the success page read this order.
      if (res.data?.accessToken) {
        sessionStorage.setItem(`order_t_${res.data._id}`, res.data.accessToken);
      }
      clear();
      navigate(`/order/${res.data._id}`);
    } catch (err) {
      // Translate backend error codes into messages the buyer can act on.
      const code = err?.payload?.error || '';
      const raw = err?.message || '';
      if (code === 'unavailable_product') {
        const ids = Array.isArray(err.payload.productIds) ? err.payload.productIds.map(String) : [];
        setUnavailable(ids.filter((id) => items.some((i) => String(i._id) === id)));
      } else if (code === 'guest_fields_required') {
        validate();
        setServerError(t('cart.co.fixFields'));
      } else if (code === 'address_required') {
        setErrors((er) => ({ ...er, address: t('cart.co.errAddress') }));
        refs.address.current?.focus();
        setServerError(t('cart.co.errAddress'));
      } else if (PROMO_ERRORS.includes(code)) {
        setPromoError(true);
        setServerError(t(`cart.promoErr.${code}`));
      } else if (code === 'invalid_items' || /ObjectId|Cast/i.test(raw)) {
        setServerError(t('cart.co.errItems'));
      } else {
        // No status = the request never reached the server; a bare code is not for people.
        setServerError(!err?.status || /^[a-z_]+$/.test(raw) ? t('cart.co.errGeneric') : raw);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const titleOf = (item) => {
    const product = byId?.get(String(item._id));
    return product ? productTitle(product, lang) : (lang === 'uz' ? item.nameUz || item.name : item.name);
  };

  const crumbs = [
    { label: t('home'), to: '/' },
    { label: t('cartTitle'), to: '/cart' },
    { label: t('cart.co.title') },
  ];

  if (items.length === 0) {
    return (
      <div className="co-page">
        <div className="container">
          <Breadcrumbs trail={crumbs} />
          <div className="co-empty">
            <SunRise />
            <h1 className="t-h1">{t('cartEmpty')}</h1>
            <p className="co-empty-text">{t('cart.emptyTextShort')}</p>
            <Button to="/shop" size="lg">{t('cart.toShop')}</Button>
          </div>
        </div>
      </div>
    );
  }

  const unavailableItems = unavailable ? items.filter((i) => unavailable.includes(String(i._id))) : [];
  const userName = user ? [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username : '';
  const fade = {
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: -6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0 },
    transition: { duration: 0.22, ease: EASE_OUT },
  };

  return (
    <div className="co-page">
      <div className="container">
        <Breadcrumbs trail={crumbs} />
        <header className="co-head">
          <h1 className="t-h1">{t('cart.co.title')}</h1>
          <Link to="/cart" className="co-back">
            <ArrowLeft size={18} />
            {t('cart.co.backToCart')}
          </Link>
        </header>

        <form className="co-layout" onSubmit={submit}>
          <div className="co-blocks">
            {!user && !isLoading && (
              <TelegramLogin variant="compact" title={t('cart.co.tgTitle')} text={t('cart.co.tgText')} />
            )}
            {user && userName && (
              <p className="co-signed">
                <Check size={18} />
                {tf('cart.co.signedAs', { name: userName })}
              </p>
            )}

            <Block n={1} id="co-contacts" title={t('cart.co.contacts')} done={contactsDone}>
              <div className="co-grid">
                <Field
                  ref={refs.name}
                  label={t('fullName')}
                  type="text"
                  value={form.name}
                  onChange={set('name')}
                  onBlur={check('name')}
                  error={errors.name}
                  placeholder={t('cart.co.namePlaceholder')}
                  autoComplete="name"
                />
                <Field
                  ref={refs.phone}
                  label={t('phone')}
                  type="tel"
                  inputMode="tel"
                  value={form.phone}
                  onChange={set('phone')}
                  onBlur={check('phone')}
                  error={errors.phone}
                  hint={t('cart.co.phoneHint')}
                  placeholder="+998 90 123 45 67"
                  autoComplete="tel"
                />
                <Field
                  className="co-span"
                  label={t('email')}
                  optional={t('cart.co.optional')}
                  type="email"
                  value={form.email}
                  onChange={set('email')}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
            </Block>

            <Block n={2} id="co-delivery" title={t('cart.co.delivery')} done={deliveryDone}>
              <div className="co-grid co-grid--address">
                <Field
                  label={t('cart.co.city')}
                  type="text"
                  value={form.city}
                  onChange={set('city')}
                  autoComplete="address-level2"
                />
                <Field
                  ref={refs.address}
                  label={t('address')}
                  type="text"
                  value={form.address}
                  onChange={(e) => {
                    set('address')(e);
                    setMapCoords(null); // manual edits detach the old pin
                  }}
                  onBlur={check('address')}
                  error={errors.address}
                  placeholder={t('cart.co.addressPlaceholder')}
                  autoComplete="street-address"
                />
              </div>
              <button
                type="button"
                className={`co-map${mapCoords ? ' is-picked' : ''}`}
                onClick={() => setMapOpen(true)}
                aria-haspopup="dialog"
              >
                <span className="co-map-icon" aria-hidden="true">
                  {mapCoords ? <Check size={18} /> : <MapPin size={20} />}
                </span>
                <span className="co-map-text">{mapCoords ? t('cart.map.picked') : t('cart.map.open')}</span>
                {mapCoords && <span className="co-map-change">{t('cart.map.change')}</span>}
              </button>
              <Field
                label={t('cart.co.comment')}
                optional={t('cart.co.optional')}
                multiline
                rows={3}
                value={form.comment}
                onChange={set('comment')}
                placeholder={t('cart.co.commentPlaceholder')}
              />
            </Block>

            <Block n={3} id="co-payment" title={t('cart.co.payment')} done>
              <div className="co-pay" role="radiogroup" aria-labelledby="co-payment">
                {[
                  ['cash', t('cart.co.payCash')],
                  ['card', t('cart.co.payCard')],
                ].map(([value, label]) => (
                  <label key={value} className={`co-pay-option${form.payment === value ? ' is-active' : ''}`}>
                    <input
                      type="radio"
                      name="payment"
                      value={value}
                      checked={form.payment === value}
                      onChange={set('payment')}
                    />
                    <span className="co-pay-dot" aria-hidden="true" />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <p className="co-pay-note">{t('cart.co.payNote')}</p>
            </Block>
          </div>

          <aside className="co-summary" aria-labelledby="co-summary-h">
            <div className="co-summary-card">
              <div className="co-summary-head">
                <h2 id="co-summary-h" className="t-h3">{t('cart.summary')}</h2>
                <Link to="/cart" className="co-edit">{t('cart.co.edit')}</Link>
              </div>
              <ul className="co-items" aria-label={t('cart.co.items')}>
                {items.map((i) => (
                  <li className="co-item" key={i._id}>
                    <span className="co-item-thumb">
                      {i.imageUrl ? <img src={i.imageUrl} alt="" loading="lazy" decoding="async" /> : <Bottle size={22} />}
                      <span className="co-item-qty t-num" aria-hidden="true">{i.quantity}</span>
                    </span>
                    <span className="co-item-body">
                      <span className="co-item-name">{titleOf(i)}</span>
                      <span className="co-item-meta t-num">{i.quantity} × {formatSum(i.price, lang)}</span>
                    </span>
                    <span className="co-item-total t-price">{formatSum(i.price * i.quantity, lang)}</span>
                  </li>
                ))}
              </ul>
              <FreeDeliveryBar subtotal={subtotal} threshold={threshold} />
              <Totals
                subtotal={subtotal}
                discount={discount}
                promoCode={appliedPromo?.code || ''}
                deliveryFee={deliveryFee}
                total={total}
                live
              />

              <AnimatePresence initial={false}>
                {unavailable && (
                  <m.div key="unavailable" className="co-alert" role="alert" {...fade}>
                    <p className="co-alert-text">
                      <Alert size={18} />
                      {unavailableItems.length ? t('cart.co.errUnavailable') : t('cart.co.errUnavailableUnknown')}
                    </p>
                    {unavailableItems.length > 0 && (
                      <>
                        <ul className="co-alert-list">
                          {unavailableItems.map((i) => (
                            <li key={i._id}>
                              <span>{titleOf(i)}</span>
                              <button
                                type="button"
                                className="co-alert-remove"
                                onClick={() => {
                                  remove(i._id);
                                  setUnavailable((ids) => {
                                    const next = (ids || []).filter((id) => id !== String(i._id));
                                    return next.length ? next : null;
                                  });
                                }}
                                aria-label={tf('cart.co.removeOne', { name: titleOf(i) })}
                              >
                                <Trash size={18} />
                              </button>
                            </li>
                          ))}
                        </ul>
                        {unavailableItems.length > 1 && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              unavailableItems.forEach((i) => remove(i._id));
                              setUnavailable(null);
                            }}
                          >
                            {t('cart.co.removeAll')}
                          </Button>
                        )}
                      </>
                    )}
                    {!unavailableItems.length && (
                      <Link to="/cart" className="co-alert-link">{t('cart.co.backToCart')}</Link>
                    )}
                  </m.div>
                )}
                {serverError && (
                  <m.div key="error" className="co-alert" role="alert" {...fade}>
                    <p className="co-alert-text">
                      <Alert size={18} />
                      {serverError}
                    </p>
                    {promoError && appliedPromo && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => { clearPromo(); setPromoError(false); setServerError(''); }}
                      >
                        {t('cart.promoRemove')}
                      </Button>
                    )}
                  </m.div>
                )}
              </AnimatePresence>

              <Button type="submit" size="lg" block disabled={submitting} aria-busy={submitting || undefined}>
                {submitting ? (
                  <>
                    <Spinner />
                    {t('cart.co.submitting')}
                  </>
                ) : (
                  t('cart.co.submit')
                )}
              </Button>
              <p className="co-summary-note">{t('cart.factPay')}</p>
            </div>
          </aside>
        </form>

        <YandexMapPicker
          open={mapOpen}
          onClose={() => setMapOpen(false)}
          onConfirm={({ lat, lng, address }) => {
            setMapCoords({ lat, lng });
            setForm((f) => ({ ...f, address }));
            setErrors((er) => ({ ...er, address: '' }));
            setMapOpen(false);
          }}
        />
      </div>
    </div>
  );
}
