import React from 'react';

export default function Header({ onOpenSearch, onOpenNotifications }) {
  return (
    <header className="header" id="app-header">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">Fh</div>
        <div className="brand-text">
          <div className="brand-name">FairHaven Health</div>
          <div className="brand-tag">Officially in Uzbekistan</div>
        </div>
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
