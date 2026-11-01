/* One icon family for the whole site: Tabler geometry, 24 x 24, stroke 1.5, round joins, currentColor.
   Icons are decorative by default (aria-hidden); pass `title` to give one an accessible name.
   `size` sets width and height. Goals and kinds have one icon each: NEED_ICONS / KIND_ICONS. */
import React from 'react';

function icon(name, paths) {
  function Icon({ size = 24, title, strokeWidth = 1.5, ...props }) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
        aria-hidden={title ? undefined : true}
        role={title ? 'img' : undefined}
        {...props}
      >
        {title && <title>{title}</title>}
        {paths}
      </svg>
    );
  }
  Icon.displayName = `Icon${name}`;
  return Icon;
}

/* ---------- Interface ---------- */
export const Search = icon('Search', <><path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /><path d="M21 21l-6 -6" /></>);
export const Bag = icon('Bag', <><path d="M6.331 8h11.339a2 2 0 0 1 1.977 2.304l-1.255 8.152a3 3 0 0 1 -2.966 2.544h-6.852a3 3 0 0 1 -2.965 -2.544l-1.255 -8.152a2 2 0 0 1 1.977 -2.304z" /><path d="M9 11v-5a3 3 0 0 1 6 0v5" /></>);
export const User = icon('User', <><path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" /><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" /></>);
export const Menu = icon('Menu', <><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></>);
export const Close = icon('Close', <><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></>);
export const ChevronDown = icon('ChevronDown', <path d="M6 9l6 6l6 -6" />);
export const ChevronUp = icon('ChevronUp', <path d="M6 15l6 -6l6 6" />);
export const ChevronLeft = icon('ChevronLeft', <path d="M15 6l-6 6l6 6" />);
export const ChevronRight = icon('ChevronRight', <path d="M9 6l6 6l-6 6" />);
export const ArrowRight = icon('ArrowRight', <><path d="M5 12h14" /><path d="M13 18l6 -6" /><path d="M13 6l6 6" /></>);
export const ArrowLeft = icon('ArrowLeft', <><path d="M5 12h14" /><path d="M5 12l6 6" /><path d="M5 12l6 -6" /></>);
export const ArrowUpRight = icon('ArrowUpRight', <><path d="M17 7l-10 10" /><path d="M8 7h9v9" /></>);
export const Plus = icon('Plus', <><path d="M12 5v14" /><path d="M5 12h14" /></>);
export const Minus = icon('Minus', <path d="M5 12h14" />);
export const Trash = icon('Trash', <><path d="M4 7h16" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" /></>);
export const Filter = icon('Filter', <><path d="M12 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M4 6h8" /><path d="M16 6h4" /><path d="M6 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M4 12h2" /><path d="M10 12h10" /><path d="M15 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M4 18h11" /><path d="M19 18h1" /></>);
export const Sort = icon('Sort', <><path d="M3 9l4 -4l4 4m-4 -4v14" /><path d="M21 15l-4 4l-4 -4m4 4v-14" /></>);
export const Check = icon('Check', <path d="M5 12l5 5l10 -10" />);
export const Info = icon('Info', <><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M12 9h.01" /><path d="M11 12h1v4h1" /></>);
export const Alert = icon('Alert', <><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M12 8v4" /><path d="M12 16h.01" /></>);
export const Refresh = icon('Refresh', <><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></>);
export const Play = icon('Play', <path d="M7 4v16l13 -8z" />);
export const Globe = icon('Globe', <><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M3.6 9h16.8" /><path d="M3.6 15h16.8" /><path d="M11.5 3a17 17 0 0 0 0 18" /><path d="M12.5 3a17 17 0 0 1 0 18" /></>);
export const Package = icon('Package', <><path d="M12 3l8 4.5v9l-8 4.5l-8 -4.5v-9l8 -4.5" /><path d="M12 12l8 -4.5" /><path d="M12 12v9" /><path d="M12 12l-8 -4.5" /><path d="M16 5.25l-8 4.5" /></>);
export const Sun = icon('Sun', <><path d="M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" /><path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7" /></>);

/* ---------- Service and contact ---------- */
export const Telegram = icon('Telegram', <path d="M15 10l-4 4l6 6l4 -16l-18 7l4 2l2 6l3 -4" />);
export const Phone = icon('Phone', <path d="M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2" />);
export const Mail = icon('Mail', <><path d="M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10z" /><path d="M3 7l9 6l9 -6" /></>);
export const Clock = icon('Clock', <><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M12 7v5l3 3" /></>);
export const Truck = icon('Truck', <><path d="M5 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M15 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M5 17h-2v-11a1 1 0 0 1 1 -1h9v12m-4 0h6m4 0h2v-6h-8m0 -5h5l3 5" /></>);
export const ShieldCheck = icon('ShieldCheck', <><path d="M11.46 20.846a12 12 0 0 1 -7.96 -14.846a12 12 0 0 0 8.5 -3a12 12 0 0 0 8.5 3a12 12 0 0 1 -.09 7.06" /><path d="M15 19l2 2l4 -4" /></>);
export const MapPin = icon('MapPin', <><path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /><path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0z" /></>);
export const Instagram = icon('Instagram', <><path d="M4 8a4 4 0 0 1 4 -4h8a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-8a4 4 0 0 1 -4 -4z" /><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /><path d="M16.5 7.5v.01" /></>);
export const Facebook = icon('Facebook', <path d="M7 10v4h3v7h4v-7h3l1 -4h-4v-2a1 1 0 0 1 1 -1h3v-4h-3a5 5 0 0 0 -5 5v2h-3" />);
export const Star = icon('Star', <path d="M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z" />);
export const Gift = icon('Gift', <><path d="M3 9a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1z" /><path d="M12 8v13" /><path d="M19 12v7a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0 -5a4.8 8 0 0 1 4.5 5a4.8 8 0 0 1 4.5 -5a2.5 2.5 0 0 1 0 5" /></>);

/* ---------- Goals (needs) ---------- */
export const Seedling = icon('Seedling', <><path d="M12 10a6 6 0 0 0 -6 -6h-3v2a6 6 0 0 0 6 6h3" /><path d="M12 14a6 6 0 0 1 6 -6h3v1a6 6 0 0 1 -6 6h-3" /><path d="M12 20v-10" /></>);
export const BabyCarriage = icon('BabyCarriage', <><path d="M6 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M16 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M2 5h2.5l1.632 4.897a6 6 0 0 0 5.693 4.103h2.675a5.5 5.5 0 0 0 0 -11h-.5v6" /><path d="M6 9h14" /><path d="M9 17l1 -3" /><path d="M16 14l1 3" /></>);
export const Female = icon('Female', <><path d="M7 9a5 5 0 1 0 10 0a5 5 0 1 0 -10 0" /><path d="M12 14v7" /><path d="M9 18h6" /></>);
export const Male = icon('Male', <><path d="M5 14a5 5 0 1 0 10 0a5 5 0 1 0 -10 0" /><path d="M19 5l-5.4 5.4" /><path d="M19 5h-5" /><path d="M19 5v5" /></>);
export const Droplet = icon('Droplet', <path d="M7.502 19.423c2.602 2.105 6.395 2.105 8.996 0c2.602 -2.105 3.262 -5.708 1.566 -8.546l-4.89 -7.26c-.42 -.625 -1.287 -.803 -1.936 -.397a1.376 1.376 0 0 0 -.41 .397l-4.893 7.26c-1.695 2.838 -1.035 6.441 1.567 8.546z" />);
export const Moon = icon('Moon', <path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z" />);
export const Shield = icon('Shield', <path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3" />);
export const Heartbeat = icon('Heartbeat', <><path d="M19.5 13.572l-7.5 7.428l-2.896 -2.868m-6.117 -8.104a5 5 0 0 1 9.013 -3.022a5 5 0 1 1 7.5 6.572" /><path d="M3 13h2l2 3l2 -6l1 3h3" /></>);
export const Bowl = icon('Bowl', <path d="M4 8h16a1 1 0 0 1 1 1v.5c0 1.5 -2.517 5.573 -4 6.5v1a1 1 0 0 1 -1 1h-8a1 1 0 0 1 -1 -1v-1c-1.687 -1.054 -4 -5 -4 -6.5v-.5a1 1 0 0 1 1 -1z" />);
export const Flame = icon('Flame', <path d="M12 12c2 -2.96 0 -7 -1 -8c0 3.038 -1.773 4.741 -3 6c-1.226 1.26 -2 3.24 -2 5a6 6 0 1 0 12 0c0 -1.532 -1.056 -3.94 -2 -5c-1.786 3 -2.791 3 -4 2z" />);
export const Kid = icon('Kid', <><path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M9 10h.01" /><path d="M15 10h.01" /><path d="M9.5 15a3.5 3.5 0 0 0 5 0" /><path d="M12 3a2 2 0 0 0 0 4" /></>);
export const Bone = icon('Bone', <path d="M15 3a3 3 0 0 1 3 3a3 3 0 1 1 -2.12 5.122l-4.758 4.758a3 3 0 1 1 -5.117 2.297l-.005 -.177l-.176 -.005a3 3 0 1 1 2.298 -5.115l4.758 -4.758a3 3 0 0 1 2.12 -5.122z" />);

/* ---------- Kinds ---------- */
export const Pill = icon('Pill', <><path d="M4.5 12.5l8 -8a4.94 4.94 0 0 1 7 7l-8 8a4.94 4.94 0 0 1 -7 -7" /><path d="M8.5 8.5l7 7" /></>);
export const Atom = icon('Atom', <><path d="M12 12v.01" /><path d="M19.071 4.929c-1.562 -1.562 -6 .337 -9.9 4.243c-3.905 3.905 -5.804 8.337 -4.242 9.9c1.562 1.561 6 -.338 9.9 -4.244c3.905 -3.905 5.804 -8.337 4.242 -9.9" /><path d="M4.929 4.929c-1.562 1.562 .337 6 4.243 9.9c3.905 3.905 8.337 5.804 9.9 4.242c1.561 -1.562 -.338 -6 -4.244 -9.9c-3.905 -3.905 -8.337 -5.804 -9.9 -4.242" /></>);
export const Fish = icon('Fish', <><path d="M16.69 7.44a6.973 6.973 0 0 0 -1.69 4.56c0 1.747 .64 3.345 1.699 4.571" /><path d="M2 9.504c7.715 8.647 14.75 10.265 20 2.498c-5.25 -7.761 -12.285 -6.142 -20 2.504" /><path d="M18 11v.01" /><path d="M11.5 10.5c-.667 1 -.667 2 0 3" /></>);
export const Ripple = icon('Ripple', <><path d="M3 7c3 -2 6 -2 9 0s6 2 9 0" /><path d="M3 17c3 -2 6 -2 9 0s6 2 9 0" /><path d="M3 12c3 -2 6 -2 9 0s6 2 9 0" /></>);
export const Hexagon = icon('Hexagon', <path d="M19.875 6.27a2.225 2.225 0 0 1 1.125 1.948v7.284c0 .809 -.443 1.555 -1.158 1.948l-6.75 4.27a2.269 2.269 0 0 1 -2.184 0l-6.75 -4.27a2.225 2.225 0 0 1 -1.158 -1.948v-7.285c0 -.809 .443 -1.554 1.158 -1.947l6.75 -3.98a2.33 2.33 0 0 1 2.25 0l6.75 3.98h-.033z" />);
export const Leaf = icon('Leaf', <><path d="M5 21c.5 -4.5 2.5 -8 7 -10" /><path d="M9 18c6.218 0 10.5 -3.288 11 -12v-2h-4.014c-9 0 -11.986 4 -12 9c0 1 0 3 2 5h3z" /></>);
export const Flask = icon('Flask', <><path d="M9 3h6" /><path d="M10 9h4" /><path d="M10 3v6l-4 11a.7 .7 0 0 0 .5 1h11a.7 .7 0 0 0 .5 -1l-4 -11v-6" /></>);
export const Heart = icon('Heart', <path d="M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572" />);
export const Bottle = icon('Bottle', <><path d="M10 5h4v-2a1 1 0 0 0 -1 -1h-2a1 1 0 0 0 -1 1v2z" /><path d="M14 3.5c0 1.626 .507 3.212 1.45 4.537l.05 .07a8.093 8.093 0 0 1 1.5 4.694v6.199a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2v-6.2c0 -1.682 .524 -3.322 1.5 -4.693l.05 -.07a7.823 7.823 0 0 0 1.45 -4.537" /><path d="M7 14.5a2.5 2.5 0 0 1 3 0a2.5 2.5 0 0 0 3 0a2.5 2.5 0 0 1 3 0" /></>);
export const Diamond = icon('Diamond', <><path d="M6 5h12l3 5l-8.5 9.5a.7 .7 0 0 1 -1 0l-8.5 -9.5l3 -5" /><path d="M10 12l-2 -2.2l.6 -1" /></>);

export const NEED_ICONS = {
  fertility: Seedling,
  pregnancy: BabyCarriage,
  women: Female,
  men: Male,
  beauty: Droplet,
  sleep: Moon,
  immunity: Shield,
  heart: Heartbeat,
  digestion: Bowl,
  metabolism: Flame,
  kids: Kid,
  bones: Bone,
};

export const KIND_ICONS = {
  vitamins: Pill,
  minerals: Atom,
  omega: Fish,
  collagen: Ripple,
  inositol: Hexagon,
  herbal: Leaf,
  enzymes: Flask,
  intimate: Heart,
};

/** <NeedIcon need="sleep" />; unknown keys fall back to the pill. */
export function NeedIcon({ need, ...props }) {
  const Icon = NEED_ICONS[need] || Pill;
  return <Icon {...props} />;
}

/** <KindIcon kind="omega" />; unknown keys fall back to the pill. */
export function KindIcon({ kind, ...props }) {
  const Icon = KIND_ICONS[kind] || Pill;
  return <Icon {...props} />;
}

/* ---------- Names kept for pages written before this set ---------- */
export const Cart = Bag;
export const Flower = Droplet;
export const Sprout = Seedling;
export const Baby = Kid;
export const Sparkle = Sun;

/** Lookup by name for data-driven icons (life stages, menus, content blocks). */
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
