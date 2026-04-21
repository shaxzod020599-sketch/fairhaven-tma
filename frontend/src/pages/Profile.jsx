import React from 'react';
import { getTelegramUser } from '../utils/telegram';
import { hapticFeedback } from '../utils/telegram';

const GROUPS = [
  {
    title: 'Заказы',
    items: [
      { glyph: '📦', label: 'Мои покупки', key: 'purchases', meta: '4' },
      { glyph: '↻', label: 'Возврат и обмен', key: 'returns' },
      { glyph: '☆', label: 'Отзывы', key: 'reviews' },
    ],
  },
  {
    title: 'Профиль',
    items: [
      { glyph: '♡', label: 'Избранное', key: 'favorites', meta: '12' },
      { glyph: '◎', label: 'Адреса доставки', key: 'addresses' },
      { glyph: '✎', label: 'Личные данные', key: 'data' },
    ],
  },
  {
    title: 'Приложение',
    items: [
      { glyph: '◐', label: 'Язык', key: 'language', meta: 'RU' },
      { glyph: '?', label: 'Поддержка', key: 'support' },
      { glyph: '§', label: 'Условия сервиса', key: 'terms' },
    ],
  },
];

export default function Profile() {
  const user = getTelegramUser();
  const displayName =
    `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Гость FairHaven';

  const handleMenu = (key) => {
    hapticFeedback('light');
    console.log('Navigate to:', key);
  };

  return (
    <div className="page" id="page-profile">
      {/* Hero card */}
      <section className="profile-hero">
        <div className="profile-row">
          <div className="profile-avatar">
            {user.photo_url ? (
              <img src={user.photo_url} alt={displayName} />
            ) : (
              <span aria-hidden="true">◉</span>
            )}
          </div>
          <div className="profile-text">
            <div className="profile-eyebrow">Участник · Член клуба</div>
            <div className="profile-name">{displayName}</div>
            {user.username && (
              <div className="profile-handle">@{user.username}</div>
            )}
          </div>
        </div>

        <div className="profile-stats">
          <div className="profile-stat">
            <div className="stat-val">4</div>
            <div className="stat-label">Заказа</div>
          </div>
          <div className="profile-stat">
            <div className="stat-val">12</div>
            <div className="stat-label">Избранных</div>
          </div>
          <div className="profile-stat">
            <div className="stat-val">1 450</div>
            <div className="stat-label">Баллов</div>
          </div>
        </div>
      </section>

      {/* Menu groups */}
      {GROUPS.map((group) => (
        <React.Fragment key={group.title}>
          <div className="profile-section">{group.title}</div>
          <div className="profile-menu">
            {group.items.map((item) => (
              <button
                key={item.key}
                className="profile-menu-item"
                id={`profile-${item.key}`}
                onClick={() => handleMenu(item.key)}
              >
                <div className="menu-glyph" aria-hidden="true">{item.glyph}</div>
                <span className="menu-label">{item.label}</span>
                {item.meta && <span className="menu-meta">{item.meta}</span>}
                <span className="menu-arrow" aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </React.Fragment>
      ))}

      <div className="profile-footer">
        <div className="fh-sig">FairHaven</div>
        <div>Apothecary · v1.0 · fairhaven.uz</div>
      </div>
    </div>
  );
}
