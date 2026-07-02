import React, { useState, useEffect } from 'react';
import { useI18n } from '../i18n/index.jsx';

/** Rotating promo strip — matches fairhavenhealth.com top announcement bar. */
export default function AnnouncementBar() {
  const { t } = useI18n();
  const messages = [t('announce1'), t('announce2'), t('announce3')];
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIdx((prev) => (prev + 1) % messages.length);
    }, 5000);
    return () => clearInterval(id);
  }, [messages.length]);

  return (
    <div className="announcement-bar" role="region" aria-label="promo">
      <div className="container announcement-track">
        <span key={idx} className="announcement-msg">
          {messages[idx]}
        </span>
      </div>
    </div>
  );
}
