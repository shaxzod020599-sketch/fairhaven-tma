import React, { useEffect, useState } from 'react';
import { getTelegramUser, hapticFeedback } from '../utils/telegram';
import { fetchPublicSettings } from '../utils/api';

const DEFAULT_SUPPORT_PHONE = '+998 78 150 04 40';
const DEFAULT_SUPPORT_PHONE_TEL = '+998781500440';
const DEFAULT_SUPPORT_HOURS = 'Ежедневно · 9:00 – 21:00 (Asia/Tashkent)';
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

export default function Profile({ dbUser, ordersCount = 0, activeOrdersCount = 0, onNavigate, onOpenAdmin }) {
  const tg = getTelegramUser();
  const [supportPhone, setSupportPhone] = useState(DEFAULT_SUPPORT_PHONE);
  const [supportPhoneTel, setSupportPhoneTel] = useState(DEFAULT_SUPPORT_PHONE_TEL);
  const [supportHours, setSupportHours] = useState(DEFAULT_SUPPORT_HOURS);

  useEffect(() => {
    fetchPublicSettings()
      .then((res) => {
        const s = res?.data || {};
        if (s.support_phone) setSupportPhone(s.support_phone);
        if (s.support_phone_tel) setSupportPhoneTel(s.support_phone_tel);
        if (s.support_hours) setSupportHours(s.support_hours);
      })
      .catch(() => {});
  }, []);

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
    window.location.href = `tel:${supportPhoneTel}`;
  };

  const openTgSupport = () => {
    hapticFeedback('light');
    window.open(`https://t.me/${SUPPORT_TG}`, '_blank');
  };

  const openOferta = () => {
    hapticFeedback('light');
    window.open('/legal/oferta-ru', '_blank');
  };

  const openOrders = () => {
    hapticFeedback('light');
    onNavigate?.('orders');
  };

  const openAdmin = () => {
    hapticFeedback('medium');
    onOpenAdmin?.();
  };

  const isAdmin = dbUser?.role === 'admin';

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
              {registered ? 'Клиент Fairhaven Health' : 'Гость · зарегистрируйтесь в боте'}
            </div>
            <div className="profile-name">{fullName}</div>
            {username && <div className="profile-handle">@{username}</div>}
          </div>
        </div>
      </section>

      {/* Admin panel — only for admins */}
      {isAdmin && (
        <button
          className="profile-admin-card"
          onClick={openAdmin}
          id="profile-admin-card"
          type="button"
        >
          <div className="profile-admin-leaf" aria-hidden="true">👑</div>
          <div className="profile-admin-body">
            <div className="profile-admin-eyebrow">ПАНЕЛЬ УПРАВЛЕНИЯ</div>
            <div className="profile-admin-title">Админ-панель</div>
            <div className="profile-admin-desc">
              Заказы · товары · подборки · настройки
            </div>
          </div>
          <div className="profile-admin-arrow" aria-hidden="true">→</div>
        </button>
      )}

      {/* Orders card — big CTA */}
      <button className="profile-orders-card" onClick={openOrders} id="profile-orders-card">
        <div className="profile-orders-glyph" aria-hidden="true">📦</div>
        <div className="profile-orders-body">
          <div className="profile-orders-title">Мои заказы</div>
          <div className="profile-orders-desc">
            {ordersCount === 0
              ? 'История пока пуста'
              : `Всего ${ordersCount}${activeOrdersCount > 0 ? ` · активных ${activeOrdersCount}` : ''}`}
          </div>
        </div>
        {activeOrdersCount > 0 && (
          <span className="profile-orders-badge">{activeOrdersCount}</span>
        )}
        <span className="profile-orders-arrow" aria-hidden="true">→</span>
      </button>

      {/* Personal data */}
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

      {/* Documents */}
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

      {/* Big contact centre */}
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
          href={`tel:${supportPhoneTel}`}
          className="contact-phone"
          onClick={callSupport}
          id="profile-contact-phone"
        >
          <span className="contact-phone-icon" aria-hidden="true">☎</span>
          <span className="contact-phone-number">{supportPhone}</span>
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
          {supportHours}
        </div>
      </section>

      <div className="profile-footer">
        <div className="fh-sig">Fairhaven Health</div>
        <div>Uzbekistan distributor · fairhaven.uz</div>
      </div>
    </div>
  );
}
