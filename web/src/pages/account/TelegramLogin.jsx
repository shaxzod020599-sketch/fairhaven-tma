import React, { useState } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { EASE_OUT, SPRING } from '../../motion/index.js';
import { Button } from '../../components/ui/index.js';
import { Telegram } from '../../components/Icons.jsx';
import Spinner from '../cart/Spinner.jsx';
import './TelegramLogin.css';

/**
 * Telegram sign-in, same flow as before: beginLogin() returns the bot link and starts polling, the bot
 * opens in a new tab, and while we wait the link can be reopened or the attempt cancelled. An expired
 * attempt says so. `variant="full"` is the account card with the three steps; `compact` sits on top of
 * checkout and prefills the contact fields once the sign-in lands.
 */
export default function TelegramLogin({ variant = 'full', title, text, headingLevel = 2 }) {
  const { t } = useI18n();
  const { loginState, beginLogin, cancelLogin } = useAuth();
  const reduce = useReducedMotion();
  const [botUrl, setBotUrl] = useState('');
  const waiting = loginState === 'waiting';
  const full = variant === 'full';
  const Heading = full ? `h${headingLevel}` : 'p';

  const start = async () => {
    const url = await beginLogin();
    if (url) {
      setBotUrl(url);
      window.open(url, '_blank', 'noopener');
    }
  };

  const swap = {
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, transition: { duration: 0.14 } },
    transition: reduce ? { duration: 0.2 } : SPRING.soft,
  };

  return (
    <m.section
      className={`acc-tg acc-tg--${variant}${waiting ? ' is-waiting' : ''}`}
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
      aria-label={full ? undefined : title || t('account.loginTitle')}
    >
      <div className="acc-tg-art" aria-hidden="true">
        <span className="acc-tg-ring" />
        <span className="acc-tg-ring acc-tg-ring--2" />
        <span className="acc-tg-disc">
          <Telegram size={full ? 34 : 22} />
        </span>
      </div>

      <div className="acc-tg-copy">
        <Heading className={full ? 'acc-tg-title t-h3' : 'acc-tg-title'}>{title || t('account.loginTitle')}</Heading>
        <p className="acc-tg-text">{text || t('account.loginText')}</p>
      </div>

      <div className="acc-tg-stage">
        <AnimatePresence mode="wait" initial={false}>
          {!waiting ? (
            <m.div key="cta" className="acc-tg-cta" {...swap}>
              <Button
                variant="primary"
                size={full ? 'lg' : 'md'}
                iconStart={<Telegram size={20} />}
                onClick={start}
                block={!full}
              >
                {t('account.loginCta')}
              </Button>
              {loginState === 'error' && (
                <p className="acc-tg-error" role="alert">{t('account.expired')}</p>
              )}
            </m.div>
          ) : (
            <m.div key="waiting" className="acc-tg-waiting" {...swap}>
              <p className="acc-tg-wait-text" aria-live="polite">
                <Spinner />
                {t('account.waiting')}
              </p>
              <div className="acc-tg-wait-actions">
                {botUrl && (
                  <Button variant="secondary" size="sm" href={botUrl} target="_blank" rel="noopener noreferrer">
                    {t('account.reopen')}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={cancelLogin}>
                  {t('account.cancel')}
                </Button>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>

      {full && (
        <div className="acc-tg-steps">
          <h3 className="acc-tg-steps-title">{t('account.stepsTitle')}</h3>
          <ol>
            {['account.step1', 'account.step2', 'account.step3'].map((key, i) => (
              <m.li
                key={key}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.15 + i * 0.07 }}
              >
                <span className="acc-tg-step-n t-num" aria-hidden="true">{i + 1}</span>
                <span>{t(key)}</span>
              </m.li>
            ))}
          </ol>
        </div>
      )}
    </m.section>
  );
}
