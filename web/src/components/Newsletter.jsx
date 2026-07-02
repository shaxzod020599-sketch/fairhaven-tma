import React, { useState } from 'react';
import { useI18n } from '../i18n/index.jsx';

export default function Newsletter() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    // Frontend-only capture — no backend endpoint for newsletter yet.
    setDone(true);
    setEmail('');
    setTimeout(() => setDone(false), 4000);
  };

  return (
    <div className="newsletter">
      <div className="newsletter-text">
        <h3 className="newsletter-title">{t('newsletterTitle')}</h3>
        <p className="newsletter-desc">{t('newsletterDesc')}</p>
      </div>
      <form className="newsletter-form" onSubmit={submit}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('newsletterPlaceholder')}
          required
        />
        <button type="submit" className="btn btn-primary">
          {done ? t('newsletterOk') : t('newsletterCta')}
        </button>
      </form>
    </div>
  );
}
