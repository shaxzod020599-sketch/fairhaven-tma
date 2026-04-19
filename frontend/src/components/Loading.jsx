import React from 'react';

export default function Loading({ text = 'Загрузка...' }) {
  return (
    <div className="loading-container" id="loading">
      <div className="spinner"></div>
      <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>{text}</span>
    </div>
  );
}
