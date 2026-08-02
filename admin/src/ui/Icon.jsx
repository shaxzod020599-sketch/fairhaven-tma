import React from 'react';

const paths = {
  overview: <><path d="M4 13h6V4H4zM14 20h6V11h-6zM4 20h6v-3H4zM14 7h6V4h-6z" /></>,
  sales: <><path d="M4 19V9m6 10V5m6 14v-7m4 7H2" /><path d="m4 8 6-4 6 7 4-3" /></>,
  billz: <><path d="M3 9 12 4l9 5v11H3z" /><path d="M7 20v-7h10v7M3 9h18M9 13h6" /></>,
  orders: <><path d="M6 3h12l2 4v14H4V7z" /><path d="M4 8h16M9 12h6" /></>,
  products: <><path d="M12 3c4 2 6 5 6 9a6 6 0 0 1-12 0c0-4 2-7 6-9Z" /><path d="M12 8v10M8 12h8" /></>,
  plug: <><path d="M8 3v5m8-5v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-4 2-6 6-6s6 2 6 6M16 6a3 3 0 0 1 0 6M17 14c3 0 4 2 4 5" /></>,
  shield: <><path d="M12 3 20 6v6c0 5-3 8-8 10-5-2-8-5-8-10V6z" /><path d="m9 12 2 2 4-5" /></>,
  gift: <><path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13M8 7c-3 0-3-4 0-4 2 0 4 4 4 4m4 0c3 0 3-4 0-4-2 0-4 4-4 4" /></>,
  stack: <><path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m3 17 5-4 4 3 3-2 6 5" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  bolt: <><path d="m13 2-8 12h7l-1 8 8-12h-7z" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  chevron: <><path d="m9 6 6 6-6 6" /></>,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
};

export function Icon({ name, size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {paths[name] || paths.more}
    </svg>
  );
}
