/* ==========================================================================
   Monoline SVG icon set — single source for the whole site.
   All icons inherit `currentColor`, 24x24 viewBox, strokeWidth 1.8.
   Wellness/clinical monoline style (no emoji).
   ========================================================================== */

const base = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export function Leaf(props) {
  return (
    <svg {...base} {...props}>
      <path d="M11 20A7 7 0 0 1 4 13c0-5 3-8 8-9 5-1 8 2 8 7a8 8 0 0 1-9 9Z" />
      <path d="M4 20c2-6 6-9 12-10" />
    </svg>
  );
}

export function Flower(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2a3 3 0 0 1 3 3c0 1.5-1.5 3-3 3S9 6.5 9 5a3 3 0 0 1 3-3Z" />
      <path d="M12 22a3 3 0 0 0 3-3c0-1.5-1.5-3-3-3s-3 1.5-3 3a3 3 0 0 0 3 3Z" />
      <path d="M2 12a3 3 0 0 1 3-3c1.5 0 3 1.5 3 3s-1.5 3-3 3a3 3 0 0 1-3-3Z" />
      <path d="M22 12a3 3 0 0 0-3-3c-1.5 0-3 1.5-3 3s1.5 3 3 3a3 3 0 0 0 3-3Z" />
    </svg>
  );
}

export function Sprout(props) {
  return (
    <svg {...base} {...props}>
      <path d="M7 20h10" />
      <path d="M12 20c0-6 0-9 0-9" />
      <path d="M12 11C12 7 9 5 5 5c0 4 3 6 7 6Z" />
      <path d="M12 11c0-3 2.5-5 6-5 0 3.5-2.5 5-6 5Z" />
    </svg>
  );
}

export function Baby(props) {
  return (
    <svg {...base} {...props}>
      <path d="M9 12h.01M15 12h.01" />
      <path d="M10 16c.7.3 1.3.5 2 .5s1.3-.2 2-.5" />
      <path d="M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1 5 1.5" />
    </svg>
  );
}

export function Bottle(props) {
  return (
    <svg {...base} {...props}>
      <path d="M9 3h6v3l1.5 1.5a4 4 0 0 1 1.5 3V19a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V8.5a4 4 0 0 1 1.5-3L9 5V3Z" />
      <path d="M6 12h12" />
    </svg>
  );
}

export function Gift(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
      <path d="M12 8S11 4 8 4s-3 4 4 4ZM12 8s1-4 4-4 3 4-4 4Z" />
    </svg>
  );
}

export function Check(props) {
  return (
    <svg {...base} {...props}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function Star(props) {
  return (
    <svg {...base} fill="currentColor" stroke="none" {...props}>
      <path d="M12 2l3 6.5 7 .9-5 4.8 1.3 7L12 18l-6.3 3.2L7 14.2l-5-4.8 7-.9L12 2z" />
    </svg>
  );
}

export function Hexagon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    </svg>
  );
}

export function Diamond(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6 3h12l4 6-10 13L2 9l4-6Z" />
      <path d="M2 9h20M12 22 8 9l4-6 4 6-4 13Z" />
    </svg>
  );
}

export function Sparkle(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function Shield(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function Cart(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    </svg>
  );
}

export function Search(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function User(props) {
  return (
    <svg {...base} {...props}>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function ArrowRight(props) {
  return (
    <svg {...base} {...props}>
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}

export function ArrowLeft(props) {
  return (
    <svg {...base} {...props}>
      <path d="M19 12H5M11 19l-7-7 7-7" />
    </svg>
  );
}

export function Phone(props) {
  return (
    <svg {...base} {...props}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

export function Mail(props) {
  return (
    <svg {...base} {...props}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 5L2 7" />
    </svg>
  );
}

/* Brand social icons */
export function Telegram(props) {
  return (
    <svg {...base} {...props}>
      <path d="M22 4 11 14M22 4l-7 18-4-7-7-4 18-7Z" />
    </svg>
  );
}

export function Instagram(props) {
  return (
    <svg {...base} {...props}>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M17.5 6.5h.01" />
    </svg>
  );
}

export function Facebook(props) {
  return (
    <svg {...base} {...props}>
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3V2Z" />
    </svg>
  );
}

/* Map slug → icon for dynamic use (mega-menu, life stages, pillars) */
export const ICONS = {
  leaf: Leaf,
  flower: Flower,
  sprout: Sprout,
  baby: Baby,
  bottle: Bottle,
  gift: Gift,
  check: Check,
  star: Star,
  hexagon: Hexagon,
  diamond: Diamond,
  sparkle: Sparkle,
  shield: Shield,
  cart: Cart,
  search: Search,
  user: User,
  arrowRight: ArrowRight,
  arrowLeft: ArrowLeft,
  phone: Phone,
  mail: Mail,
  telegram: Telegram,
  instagram: Instagram,
  facebook: Facebook,
};
