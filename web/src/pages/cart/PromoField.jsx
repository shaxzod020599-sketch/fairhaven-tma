import React, { useId, useState } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { useCart } from '../../context/CartContext.jsx';
import { validatePromo } from '../../api.js';
import { formatSum } from '../../catalog/index.js';
import { EASE_OUT, SPRING } from '../../motion/index.js';
import { Check, Close, Gift } from '../../components/Icons.jsx';
import Spinner from './Spinner.jsx';
import './PromoField.css';

const KNOWN_ERRORS = ['invalid_promo', 'first_order_only', 'already_used', 'min_order_not_met'];

/**
 * The cart's promo code. Same flow as before: the trimmed code and the current subtotal go to
 * /web/promo/validate; a valid answer is stored in the cart context (so checkout sends its code), anything
 * else clears it and explains why. The server re-checks the code when the order is placed.
 */
export default function PromoField({ subtotal }) {
  const { t, tf, lang } = useI18n();
  const { appliedPromo, setAppliedPromo, clearPromo } = useCart();
  const reduce = useReducedMotion();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const id = useId();
  const errId = `${id}-err`;

  const messageFor = (res) => {
    if (res?.error === 'min_order_not_met' && Number(res.minOrderAmount) > 0) {
      return tf('cart.promoErr.minSum', { sum: formatSum(res.minOrderAmount, lang) });
    }
    if (KNOWN_ERRORS.includes(res?.error)) return t(`cart.promoErr.${res.error}`);
    return res?.message || t('cart.promoErr.invalid_promo');
  };

  const apply = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await validatePromo({ code: code.trim(), subtotal });
      if (res?.valid) {
        setAppliedPromo(res.data);
        setCode('');
      } else {
        setAppliedPromo(null);
        setError(messageFor(res));
      }
    } catch (_) {
      setAppliedPromo(null);
      setError(t('cart.promoErr.network'));
    } finally {
      setLoading(false);
    }
  };

  const swap = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 } };

  return (
    <div className="crt-promo">
      <AnimatePresence mode="wait" initial={false}>
        {appliedPromo ? (
          <m.div key="applied" className="crt-promo-applied" {...swap} transition={{ duration: 0.28, ease: EASE_OUT }}>
            <m.span
              className="crt-promo-tick"
              initial={reduce ? false : { scale: 0.4 }}
              animate={{ scale: 1 }}
              transition={SPRING.pop}
              aria-hidden="true"
            >
              <Check size={16} />
            </m.span>
            <p className="crt-promo-applied-text" role="status">
              <strong>{tf('cart.promoApplied', { code: appliedPromo.code })}</strong>
              <span className="t-price">−{formatSum(appliedPromo.discount, lang)}</span>
            </p>
            <button
              type="button"
              className="crt-promo-remove"
              onClick={() => { clearPromo(); setError(''); }}
              aria-label={t('cart.promoRemove')}
              title={t('cart.promoRemove')}
            >
              <Close size={18} />
            </button>
          </m.div>
        ) : (
          <m.form key="field" className="crt-promo-form" onSubmit={apply} noValidate {...swap} transition={{ duration: 0.28, ease: EASE_OUT }}>
            <label htmlFor={`${id}-code`} className="crt-promo-label">
              <Gift size={18} />
              {t('cart.promoLabel')}
            </label>
            <div className={`crt-promo-row${error ? ' is-error' : ''}`}>
              <input
                id={`${id}-code`}
                type="text"
                value={code}
                onChange={(e) => { setCode(e.target.value); if (error) setError(''); }}
                placeholder={t('cart.promoPlaceholder')}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errId : undefined}
              />
              <button type="submit" className="crt-promo-apply" disabled={loading || !code.trim()} aria-busy={loading || undefined}>
                {loading ? <Spinner label={t('cart.promoChecking')} /> : t('cart.promoApply')}
              </button>
            </div>
            <AnimatePresence initial={false}>
              {error && (
                <m.p
                  key={error}
                  id={errId}
                  className="crt-promo-error"
                  role="alert"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, ease: EASE_OUT }}
                >
                  {error}
                </m.p>
              )}
            </AnimatePresence>
          </m.form>
        )}
      </AnimatePresence>
    </div>
  );
}
