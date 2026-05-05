import React from 'react';

export default function Header({ onOpenSearch, onOpenNotifications }) {
  return (
    <header className="header" id="app-header">
      <div className="brand">
        <div className="brand-logo">
          <span className="brand-logo-name">Fairhaven</span>
          <span className="brand-logo-sub">Health<sup className="brand-logo-tm">®</sup></span>
        </div>
        <a
          className="brand-credit"
          href="https://t.me/leon7647"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Автор проекта · Telegram"
        >
          <svg className="brand-credit-icon" width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"/>
          </svg>
          <span className="brand-credit-text">tg <span className="brand-credit-handle">@leon7647</span></span>
        </a>
      </div>

      <div className="header-actions">
        <button
          className="icon-btn"
          id="header-search"
          aria-label="Поиск"
          onClick={onOpenSearch}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
            <path d="m14 14 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <button
          className="icon-btn"
          id="header-bell"
          aria-label="Уведомления"
          onClick={onOpenNotifications}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M4 15h12l-1.5-2V9a4.5 4.5 0 1 0-9 0v4L4 15Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path d="M8 17.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span className="dot" />
        </button>
      </div>
    </header>
  );
}
