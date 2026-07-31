import React from 'react';

/**
 * Admin icon set.
 *
 * Replaces the emoji that were used as structural icons. Emoji render from the
 * device's own font, so they changed shape between iOS, Android and desktop
 * Telegram, could not inherit colour or weight, and sat off the text baseline.
 * These are one family: 24px grid, 1.75 stroke, round caps, `currentColor`.
 */

const PATHS = {
  // ── Navigation ──
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  orders: <><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></>,
  products: <><path d="M12 3c-3.5 2-5.5 5-5.5 9A5.5 5.5 0 0 0 12 17.5 5.5 5.5 0 0 0 17.5 12c0-4-2-7-5.5-9Z" /><path d="M12 21v-6" /></>,
  collections: <><path d="M12 3 3 7.5l9 4.5 9-4.5L12 3Z" /><path d="m3 12 9 4.5L21 12" /><path d="m3 16.5 9 4.5 9-4.5" /></>,
  promos: <><path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-6Z" /><path d="M13 5v2M13 11v2M13 17v2" /></>,
  gallery: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m3 16 4.5-4.5a2 2 0 0 1 2.8 0L15 16" /><path d="m14 15 2-2a2 2 0 0 1 2.8 0L21 15" /></>,
  customers: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 14.4A6 6 0 0 1 21 20" /></>,
  admins: <><path d="M12 3 4.5 6v5.5c0 4.4 3 8.3 7.5 9.5 4.5-1.2 7.5-5.1 7.5-9.5V6L12 3Z" /><path d="m9 12 2.2 2.2L15.5 10" /></>,
  settings: <><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4" /><circle cx="16" cy="6" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="14" cy="18" r="2" /></>,
  channels: <><circle cx="18" cy="5" r="2.6" /><circle cx="6" cy="12" r="2.6" /><circle cx="18" cy="19" r="2.6" /><path d="m8.4 10.8 7.2-4.2M8.4 13.2l7.2 4.2" /></>,
  more: <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>,

  // ── Actions and state ──
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  check: <><path d="m5 12.5 4.5 4.5L19 7" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-13.7-5.3L3 9" /><path d="M3 4v5h5" /><path d="M4 13a8 8 0 0 0 13.7 5.3L21 15" /><path d="M21 20v-5h-5" /></>,
  link: <><path d="M10 13a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7L11.5 6" /><path d="M14 11a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7L12.5 18" /></>,
  unlink: <><path d="M10 13a4 4 0 0 0 5.7 0l1.3-1.3" /><path d="M14 11a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.3-1.3" /><path d="m3 3 18 18" /></>,
  alert: <><path d="M12 4.5 2.8 20h18.4L12 4.5Z" /><path d="M12 10v4M12 17.2v.1" /></>,
  chevron: <><path d="m9 6 6 6-6 6" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
};

export default function Icon({ name, size = 20, className = '', label, ...rest }) {
  const path = PATHS[name];
  if (!path) return null;

  // Decorative next to a text label; announced only when a label is supplied.
  const a11y = label
    ? { role: 'img', 'aria-label': label }
    : { 'aria-hidden': 'true', focusable: 'false' };

  return (
    <svg
      className={`ap-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...a11y}
      {...rest}
    >
      {path}
    </svg>
  );
}
