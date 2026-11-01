import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m, useInView, useReducedMotion } from 'motion/react';
import { useI18n } from '../i18n/index.jsx';
import { useSiteContent } from '../context/SiteContentContext.jsx';
import { usePageVisible } from '../motion/media.js';
import { EASE_OUT } from '../motion/easings.js';
import './AnnouncementBar.css';

const EVERY = 4500;

/**
 * Thin stage strip above the header. The lines come from the admin panel (site content «announce»)
 * and slide up one after another. It holds still while hovered, while the tab is hidden or
 * the strip is scrolled away; with reduced motion only the first line shows.
 */
export default function AnnouncementBar() {
  const { lang, t } = useI18n();
  const content = useSiteContent();
  const lines = (content?.announce?.[lang] || content?.announce?.ru || []).filter((x) => typeof x === 'string' && x.trim());
  const reduce = useReducedMotion();
  const visible = usePageVisible();
  const ref = useRef(null);
  const onScreen = useInView(ref);
  const [held, setHeld] = useState(false);
  const [index, setIndex] = useState(0);

  const rotating = !reduce && lines.length > 1;
  const running = rotating && visible && onScreen && !held;

  useEffect(() => {
    if (!running) return undefined;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % lines.length), EVERY);
    return () => window.clearInterval(id);
  }, [running, lines.length]);

  useEffect(() => setIndex(0), [lang]);

  if (!lines.length) return null;
  const current = rotating ? index % lines.length : 0;

  return (
    <div
      ref={ref}
      className="ann stage"
      role="region"
      aria-label={t('shell.announcements')}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
    >
      <div className="container ann-track">
        <AnimatePresence initial={false} mode="popLayout">
          <m.p
            key={`${lang}-${current}`}
            className="ann-line"
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: '0%', opacity: 1 }}
            exit={{ y: '-100%', opacity: 0 }}
            transition={{ duration: 0.42, ease: EASE_OUT }}
          >
            <span className="ann-dot" aria-hidden="true" />
            {lines[current]}
          </m.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
