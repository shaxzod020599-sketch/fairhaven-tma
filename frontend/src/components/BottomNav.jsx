import React from 'react';
import { hapticFeedback } from '../utils/telegram';

const HomeIcon = ({ active }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1v-8Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      fill={active ? 'currentColor' : 'none'}
      fillOpacity={active ? 0.15 : 0}
    />
  </svg>
);

const GridIcon = ({ active }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.2 : 0} />
    <rect x="13" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.2 : 0} />
  </svg>
);

const BagIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M5 8h14l-1 12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 8Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M9 8V6a3 3 0 0 1 6 0v2"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

const UserIcon = ({ active }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.6" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} />
    <path
      d="M4 21a8 8 0 0 1 16 0"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

const TABS = [
  { key: 'home', label: 'Главная', Icon: HomeIcon },
  { key: 'catalog', label: 'Каталог', Icon: GridIcon },
  { key: 'cart', label: 'Корзина', Icon: BagIcon },
  { key: 'profile', label: 'Профиль', Icon: UserIcon },
];

export default function BottomNav({ active, onNavigate, cartCount }) {
  const handleTap = (key) => {
    hapticFeedback('light');
    onNavigate(key);
  };

  return (
    <nav className="bottom-nav" id="bottom-nav">
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            className={`nav-item ${isActive ? 'active' : ''}`}
            onClick={() => handleTap(tab.key)}
            id={`nav-${tab.key}`}
            aria-label={tab.label}
          >
            <span className="nav-glyph">
              <tab.Icon active={isActive} />
            </span>
            <span className="nav-label">{tab.label}</span>
            {tab.key === 'cart' && cartCount > 0 && (
              <span className="nav-badge">{cartCount > 99 ? '99+' : cartCount}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
