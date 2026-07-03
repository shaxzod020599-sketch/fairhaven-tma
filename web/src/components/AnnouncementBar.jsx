import React, { useState, useEffect } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useSiteContent } from '../context/SiteContentContext.jsx';

/** Rotating promo strip — lines are editable from the admin panel. */
export default function AnnouncementBar() {
  const { lang } = useI18n();
  const content = useSiteContent();
  const messages = (content.announce[lang] || content.announce.ru).filter(Boolean);
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
