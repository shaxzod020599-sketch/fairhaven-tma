import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import Newsletter from './Newsletter.jsx';
import TrustBadges from './TrustBadges.jsx';
import { Leaf, Telegram, Instagram, Facebook, Phone } from './Icons.jsx';

export default function Footer() {
  const { t } = useI18n();
  const { get } = useSettings();

  return (
    <footer className="site-footer">
      <div className="footer-newsletter-band">
        <div className="container">
          <Newsletter />
        </div>
      </div>

      <div className="footer-trust-band">
        <div className="container">
          <TrustBadges />
        </div>
      </div>

      <div className="footer-main">
        <div className="container footer-cols">
          <div className="footer-col footer-brand">
            <Link to="/" className="logo">
              <span className="logo-mark"><Leaf width={26} height={26} /></span>
              <span className="logo-text">
                Fairhaven<span className="logo-accent">Health</span>
              </span>
            </Link>
            <p className="footer-about">{t('footerAbout')}</p>
            <div className="footer-social">
              <a href={`https://t.me/${get('support_tg')}`} target="_blank" rel="noopener noreferrer" aria-label="Telegram">
                <Telegram width={18} height={18} />
              </a>
              <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                <Instagram width={18} height={18} />
              </a>
              <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
                <Facebook width={18} height={18} />
              </a>
            </div>
          </div>

          <div className="footer-col">
            <h4 className="footer-col-title">{t('footerShop')}</h4>
            <ul>
              <li><Link to="/shop/fertility-women">{t('famWomen')}</Link></li>
              <li><Link to="/shop/fertility-men">{t('famMen')}</Link></li>
              <li><Link to="/shop/pregnant">{t('famPrenatal')}</Link></li>
              <li><Link to="/shop/nursing">{t('famNursing')}</Link></li>
              <li><Link to="/shop">{t('famAll')}</Link></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4 className="footer-col-title">{t('footerAbout2')}</h4>
            <ul>
              <li><Link to="/about">{t('navDifference')}</Link></li>
              <li><Link to="/learn">{t('navLearn')}</Link></li>
              <li><Link to="/contact">{t('navContact')}</Link></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4 className="footer-col-title">{t('footerSupport')}</h4>
            <ul>
              <li><Link to="/faq">{t('faqTitle')}</Link></li>
              <li><Link to="/faq">{t('faqDelivery')}</Link></li>
              <li><Link to="/faq">{t('faqReturns')}</Link></li>
              <li><Link to="/account">{t('orderNumber')}</Link></li>
              <li><Link to="/contact">{t('navContact')}</Link></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4 className="footer-col-title">{t('footerContact')}</h4>
            <ul className="footer-contacts">
              <li>
                <a href={`tel:${get('support_phone_tel')}`}><Phone width={16} height={16} /> {get('support_phone')}</a>
              </li>
              <li>
                <a href={`https://t.me/${get('support_tg')}`} target="_blank" rel="noopener noreferrer">
                  <Telegram width={16} height={16} /> @{get('support_tg')}
                </a>
              </li>
              <li className="footer-hours">{get('support_hours')}</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <div className="container footer-bottom-row">
          <span>© {new Date().getFullYear()} Fairhaven Health. {t('footerRights')}.</span>
          <div className="footer-legal">
            <Link to="/faq">{t('footerOferta')}</Link>
            <span aria-hidden="true">·</span>
            <a href="/legal/oferta-ru" target="_blank" rel="noopener">{t('footerTerms')}</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
