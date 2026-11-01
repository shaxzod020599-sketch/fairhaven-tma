import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { ArrowRight, ArrowUpRight, Clock, Phone, Telegram } from '../components/Icons.jsx';
import { useContacts } from '../components/shell/contacts.js';
import { Button } from '../components/ui/index.js';
import { Reveal, Stagger } from '../motion/index.js';
import { useSeo } from '../seo/useSeo.js';
import './info/Contact.css';

const EMPTY = { name: '', phone: '', message: '' };

export default function Contact() {
  useSeo();
  const { t, tf } = useI18n();
  const { phone, tel, tg, tgUrl, hours } = useContacts();
  const [form, setForm] = useState(EMPTY);
  const [sent, setSent] = useState(false);

  const change = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    if (sent) setSent(false);
  };

  // No backend: the message opens in Telegram, prefilled, and the reader presses Send there.
  const submit = (e) => {
    e.preventDefault();
    const text = `${form.name} (${form.phone}): ${form.message}`;
    window.open(`${tgUrl}?text=${encodeURIComponent(text)}`, '_blank');
    setSent(true);
    setForm(EMPTY);
  };

  const channels = [
    phone && tel && { id: 'call', href: tel, Icon: Phone, label: t('pages.contact.call'), value: phone },
    tgUrl && { id: 'tg', href: tgUrl, external: true, Icon: Telegram, label: t('pages.contact.telegram'), value: tg },
    hours && { id: 'hours', Icon: Clock, label: t('pages.contact.hours'), value: hours },
  ].filter(Boolean);

  const useful = [
    { to: '/faq#delivery', label: t('pages.contact.linkDelivery') },
    { to: '/faq', label: t('pages.contact.linkFaq') },
    { to: '/about', label: t('pages.contact.linkAbout') },
  ];

  return (
    <div className="ct-page">
      <div className="container">
        <Breadcrumbs trail={[{ label: t('home'), to: '/' }, { label: t('pages.contact.title') }]} />
        <header className="ct-head">
          <h1 className="ct-title">{t('pages.contact.title')}</h1>
          <p className="ct-lead t-muted">{t('pages.contact.lead')}</p>
        </header>

        <div className="ct-layout">
          <Stagger as="ul" className="ct-channels">
            {channels.map(({ id, href, external, Icon, label, value }) => {
              const body = (
                <>
                  <span className="ct-channel-icon" aria-hidden="true">
                    <Icon size={22} />
                  </span>
                  <span className="ct-channel-body">
                    <span className="ct-channel-label t-mono">{label}</span>
                    <span className="ct-channel-value">{value}</span>
                  </span>
                  {href && (
                    <span className="ct-channel-arrow" aria-hidden="true">
                      {external ? <ArrowUpRight size={20} /> : <ArrowRight size={20} />}
                    </span>
                  )}
                </>
              );
              return (
                <Reveal as="li" key={id}>
                  {href ? (
                    <a
                      href={href}
                      className={`ct-channel ct-channel--${id}`}
                      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    >
                      {body}
                    </a>
                  ) : (
                    <div className={`ct-channel ct-channel--${id}`}>{body}</div>
                  )}
                </Reveal>
              );
            })}
          </Stagger>

          <Reveal className="ct-form-wrap">
            <form className="ct-form" onSubmit={submit} aria-labelledby="ct-form-title">
              <h2 id="ct-form-title" className="ct-form-title">{t('pages.contact.formTitle')}</h2>
              <p className="ct-form-note t-muted">{t('pages.contact.formNote')}</p>
              <label className="ct-field">
                <span className="ct-field-label">{t('pages.contact.name')}</span>
                <input name="name" type="text" autoComplete="name" value={form.name} onChange={change} required />
              </label>
              <label className="ct-field">
                <span className="ct-field-label">{t('pages.contact.phone')}</span>
                <input
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+998"
                  value={form.phone}
                  onChange={change}
                  required
                />
              </label>
              <label className="ct-field">
                <span className="ct-field-label">{t('pages.contact.message')}</span>
                <textarea name="message" rows={5} value={form.message} onChange={change} required />
              </label>
              <Button type="submit" size="lg" block iconStart={<Telegram size={20} />} disabled={!tgUrl}>
                {t('pages.contact.submit')}
              </Button>
              <p className="ct-form-status" role="status" aria-live="polite">
                {sent ? tf('pages.contact.sent', { tg }) : ''}
              </p>
            </form>
          </Reveal>
        </div>

        <nav className="ct-useful" aria-labelledby="ct-useful-title">
          <h2 id="ct-useful-title" className="ct-useful-title t-mono">{t('pages.contact.usefulTitle')}</h2>
          <ul>
            {useful.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="ct-useful-link">
                  <span>{link.label}</span>
                  <ArrowRight size={18} />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
