import React, { useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { Phone, Telegram, ArrowRight } from '../components/Icons.jsx';

export default function Contact() {
  const { t } = useI18n();
  const { get } = useSettings();
  const [form, setForm] = useState({ name: '', phone: '', message: '' });
  const [sent, setSent] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    // Frontend-only — opens Telegram deep link with prefilled text.
    const text = `${form.name} (${form.phone}): ${form.message}`;
    window.open(`https://t.me/${get('support_tg')}?text=${encodeURIComponent(text)}`, '_blank');
    setSent(true);
    setForm({ name: '', phone: '', message: '' });
  };

  return (
    <div className="contact-page">
      <div className="container">
        <Breadcrumbs trail={[{ label: t('goHome'), to: '/' }, { label: t('navContact') }]} />

        <header className="contact-hero">
          <h1 className="page-title">{t('contactTitle')}</h1>
          <p className="contact-desc">{t('contactDesc')}</p>
        </header>

        <div className="contact-layout">
          <div className="contact-channels">
            <a href={`tel:${get('support_phone_tel')}`} className="contact-channel">
              <span className="contact-channel-icon" aria-hidden="true"><Phone width={22} height={22} /></span>
              <span className="contact-channel-body">
                <strong>{t('callUs')}</strong>
                <span>{get('support_phone')}</span>
              </span>
              <span className="contact-channel-arrow" aria-hidden="true"><ArrowRight width={20} height={20} /></span>
            </a>

            <a
              href={`https://t.me/${get('support_tg')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="contact-channel"
            >
              <span className="contact-channel-icon" aria-hidden="true"><Telegram width={22} height={22} /></span>
              <span className="contact-channel-body">
                <strong>{t('writeTg')}</strong>
                <span>@{get('support_tg')}</span>
              </span>
              <span className="contact-channel-arrow" aria-hidden="true"><ArrowRight width={20} height={20} /></span>
            </a>

            <div className="contact-channel static">
              <span className="contact-channel-icon" aria-hidden="true">
                <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
              </span>
              <span className="contact-channel-body">
                <strong>{t('workHours')}</strong>
                <span>{get('support_hours')}</span>
              </span>
            </div>
          </div>

          <form className="contact-form" onSubmit={submit}>
            <h2 className="summary-title">{t('contactForm')}</h2>
            <label className="form-field">
              <span>{t('fullName')}</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </label>
            <label className="form-field">
              <span>{t('phone')}</span>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                required
              />
            </label>
            <label className="form-field">
              <span>{t('message')}</span>
              <textarea
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                rows={4}
                required
              />
            </label>
            <button type="submit" className="btn btn-primary btn-block">
              {sent ? t('sent') : t('sendMessage')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
