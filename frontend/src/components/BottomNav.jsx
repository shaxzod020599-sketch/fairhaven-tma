import React from 'react';
import { hapticFeedback } from '../utils/telegram';

const TABS = [
  { key: 'home', label: 'Главная', icon: '🏠' },
  { key: 'catalog', label: 'Каталог', icon: '📋' },
  { key: 'cart', label: 'Корзина', icon: '🛒' },
  { key: 'profile', label: 'Профиль', icon: '👤' },
];

export default function BottomNav({ active, onNavigate, cartCount }) {
  const handleTap = (key) => {
    hapticFeedback('light');
    onNavigate(key);
  };

  return (
    <nav className="bottom-nav" id="bottom-nav">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          className={`nav-item ${active === tab.key ? 'active' : ''}`}
          onClick={() => handleTap(tab.key)}
          id={`nav-${tab.key}`}
        >
          <span className="nav-icon">{tab.icon}</span>
          <span className="nav-label">{tab.label}</span>
          {tab.key === 'cart' && cartCount > 0 && (
            <span className="nav-badge">{cartCount > 99 ? '99+' : cartCount}</span>
          )}
        </button>
      ))}
    </nav>
  );
}
