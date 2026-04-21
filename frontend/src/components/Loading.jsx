import React from 'react';

export default function Loading({ text = 'Загрузка…' }) {
  return (
    <div className="loading-container" id="loading">
      <div className="spinner" />
      <span className="loading-text">{text}</span>
    </div>
  );
}
