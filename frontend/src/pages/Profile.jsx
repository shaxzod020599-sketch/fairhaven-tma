import React from 'react';
import { getTelegramUser, hapticFeedback } from '../utils/telegram';

const SUPPORT_PHONE = '+998 78 150 04 40';
const SUPPORT_PHONE_TEL = '+998781500440';
const SUPPORT_TG = 'fairhaven_support';

function genderLabel(g) {
  if (g === 'male') return 'Мужской';
  if (g === 'female') return 'Женский';
  return '—';
}

function initials(firstName, lastName) {
  const a = (firstName || '').charAt(0).toUpperCase();
  const b = (lastName || '').charAt(0).toUpperCase();
  return (a + b) || '◉';
}

export default function Profile({ dbUser }) {
  const tg = getTelegramUser();

  // Prefer backend-registered data; fall back to Telegram-native data only when empty.
  const firstName = dbUser?.firstName || tg.first_name || '';
  const lastName = dbUser?.lastName || tg.last_name || '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Гость';
  const username = dbUser?.username || tg.username || '';
  const phone = dbUser?.phone || '';
  const birthYear = dbUser?.birthYear || null;
  const gender = dbUser?.gender || '';
  const photoUrl = dbUser?.photoUrl || tg.photo_url || '';
  const registered = dbUser?.registrationStep === 'done';

  const consentDate = dbUser?.consentAcceptedAt
    ? new Date(dbUser.consentAcceptedAt).toLocaleDateString('ru-RU')
    : null;

  const callSupport = () => {
    hapticFeedback('medium');
    window.location.href = `tel:${SUPPORT_PHONE_TEL}`;
  };

  const openTgSupport = () => {
    hapticFeedback('light');
    window.open(`https://t.me/${SUPPORT_TG}`, '_blank');
  };

  const openOferta = () => {
    hapticFeedback('light');
    window.open('/legal/oferta-ru', '_blank');
  };

  return (
    <div className="page" id="page-profile">
      {/* Hero card */}
      <section className="profile-hero">
        <div className="profile-row">
          <div className="profile-avatar">
            {photoUrl ? (
              <img src={photoUrl} alt={fullName} />
            ) : (
              <span aria-hidden="true">{initials(firstName, lastName)}</span>
            )}
          </div>
          <div className="profile-text">
            <div className="profile-eyebrow">
              {registered ? 'Клиент FairHaven' : 'Гость · зарегистрируйтесь в боте'}
            </div>
            <div className="profile-name">{fullName}</div>
            {username && <div className="profile-handle">@{username}</div>}
          </div>
        </div>
      </section>

      {/* Personal data — real registration fields only */}
      <div className="profile-section">Личные данные</div>
      <div className="profile-data">
        <div className="profile-data-row">
          <span className="profile-data-label">Имя</span>
          <span className="profile-data-value">{firstName || '—'}</span>
        </div>
        <div className="profile-data-row">
          <span className="profile-data-label">Фамилия</span>
          <span className="profile-data-value">{lastName || '—'}</span>
        </div>
        <div className="profile-data-row">
          <span className="profile-data-label">Год рождения</span>
          <span className="profile-data-value">{birthYear || '—'}</span>
        </div>
        <div className="profile-data-row">
          <span className="profile-data-label">Пол</span>
          <span className="profile-data-value">{genderLabel(gender)}</span>
        </div>
        <div className="profile-data-row">
          <span className="profile-data-label">Телефон</span>
          <span className="profile-data-value">{phone || '—'}</span>
        </div>
        <div className="profile-data-row">
          <span className="profile-data-label">Telegram ID</span>
          <span className="profile-data-value mono">{tg.id || '—'}</span>
        </div>
      </div>

      {/* Consent status */}
      <div className="profile-section">Документы</div>
      <div className="profile-menu">
        <button
          className="profile-menu-item"
          onClick={openOferta}
          id="profile-oferta"
        >
          <div className="menu-glyph" aria-hidden="true">§</div>
          <span className="menu-label">Публичная оферта</span>
          {consentDate && (
            <span className="menu-meta">Принята {consentDate}</span>
          )}
          <span className="menu-arrow" aria-hidden="true">›</span>
        </button>
      </div>

      {/* Big contact centre — mirrors the Home block */}
      <section className="contact-centre" id="profile-contact-centre" aria-label="Контакт-центр">
        <div className="contact-leaf" aria-hidden="true">☎</div>
        <div className="contact-eyebrow">КОНТАКТ-ЦЕНТР · 24/7</div>
        <div className="contact-title">
          Нужна <em>помощь?</em>
        </div>
        <div className="contact-desc">
          Вопросы по заказу, подбор продукта, возврат — наш специалист
          ответит по телефону или в Telegram.
        </div>
        <a
          href={`tel:${SUPPORT_PHONE_TEL}`}
          className="contact-phone"
          onClick={callSupport}
          id="profile-contact-phone"
        >
          <span className="contact-phone-icon" aria-hidden="true">☎</span>
          <span className="contact-phone-number">{SUPPORT_PHONE}</span>
          <span className="contact-phone-arrow" aria-hidden="true">→</span>
        </a>
        <button
          className="contact-tg"
          onClick={openTgSupport}
          id="profile-contact-tg"
        >
          <span aria-hidden="true">✈</span>
          Написать в Telegram · @{SUPPORT_TG}
        </button>
        <div className="contact-meta">
          Ежедневно · 9:00 – 21:00 (Asia/Tashkent)
        </div>
      </section>

      <div className="profile-footer">
        <div className="fh-sig">FairHaven Health</div>
        <div>Uzbekistan distributor · fairhaven.uz</div>
      </div>
    </div>
  );
}
