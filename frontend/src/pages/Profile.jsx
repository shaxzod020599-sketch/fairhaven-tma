import React from 'react';
import { getTelegramUser } from '../utils/telegram';
import { formatPrice } from '../utils/helpers';

const MENU_ITEMS = [
  { icon: '📦', label: 'Мои покупки', key: 'purchases' },
  { icon: '🔄', label: 'Возврат / Обмен', key: 'returns' },
  { icon: '❤️', label: 'Избранное', key: 'favorites' },
  { icon: '⭐', label: 'Мои отзывы', key: 'reviews' },
  { icon: '👤', label: 'Мои данные', key: 'data' },
  { icon: '📍', label: 'Сохранённые адреса', key: 'addresses' },
  { icon: '💰', label: 'Накопительный баланс', key: 'balance' },
  { icon: '🌐', label: 'Язык приложения', key: 'language' },
];

export default function Profile() {
  const user = getTelegramUser();
  const displayName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Пользователь';

  return (
    <div className="page" id="page-profile">
      {/* Profile Header */}
      <div className="profile-header">
        <div className="profile-avatar">
          {user.photo_url ? (
            <img src={user.photo_url} alt={displayName} />
          ) : (
            '👤'
          )}
        </div>
        <div className="profile-name">{displayName}</div>
        {user.username && (
          <div className="profile-phone">@{user.username}</div>
        )}
        <div className="profile-balance">
          💎 {formatPrice(0)}
        </div>
      </div>

      {/* Menu Items */}
      <div className="profile-menu">
        {MENU_ITEMS.map((item) => (
          <button
            key={item.key}
            className="profile-menu-item"
            id={`profile-${item.key}`}
            onClick={() => {
              // Placeholder — each will navigate to sub-pages in future
              console.log('Navigate to:', item.key);
            }}
          >
            <div className="menu-icon">{item.icon}</div>
            <span className="menu-label">{item.label}</span>
            <span className="menu-arrow">›</span>
          </button>
        ))}
      </div>

      {/* App Info */}
      <div style={{
        textAlign: 'center',
        padding: '24px 0 16px',
        color: 'var(--color-text-secondary)',
        fontSize: '0.75rem',
      }}>
        FairHaven v1.0.0 • fairhaven.uz
      </div>
    </div>
  );
}
