# FairHaven web design system

The shared foundation of the fairhaven.uz store (`web/`). Pages build on it; they do not re-create tokens,
buttons, cards, motion or catalogue logic. Visual direction and page plans live in the redesign brief; this file
is the reference for what exists in code and how to use it.

- Stack: React 18 function components in `.jsx`, plain CSS imported by the component that uses it,
  `motion/react` 12 through `LazyMotion` (use `m.*`, never `motion.*`), react-router 6.
- Load order (`src/main.jsx`): `styles/fonts.css` → `styles/tokens.css` → `styles/base.css`. Admin screens add
  `styles/admin.css` from `pages/AdminPanel.jsx`.

## 1. Tokens (`src/styles/tokens.css`)

Never hard-code a colour, radius, shadow, duration or z-index that has a token.

| Group | Tokens |
| --- | --- |
| Floor (light) | `--bg` #FFF, `--bg-2` #F4F5F7 (wells, inputs), `--bg-3` #EBEDF0, `--line` #E2E5EA |
| Ink | `--fg` #0F1115, `--fg-2` #4A505A (secondary text), `--fg-3` #6B717C (hints, still AA on `--bg`) |
| Sun (the one accent) | `--sun` #FFC93C, `--sun-600`, `--sun-100`, `--on-sun` (text on sun), `--sun-glow` |
| Status | `--ok`, `--danger` |
| Stage (dark sections) | `--stage-950`, `--stage-900`, `--stage-800`, `--stage-fg`, `--stage-fg-2` |
| Type | `--font-sans` (Geologica Variable), `--font-mono` (Martian Mono Variable); sizes `--t-hero`, `--t-h1`, `--t-h2`, `--t-h3`, `--t-body`, `--t-small`, `--t-micro`; `--lh-*`, `--ls-display`, `--ls-micro`; weights `--w-display` 760, `--w-h3`, `--w-strong`, `--w-price`, `--w-body`, `--w-micro` |
| Radius | `--r-pill`, `--r-card` 20px, `--r-well` 16px, `--r-sheet` 28px |
| Space | `--s-1` 4 … `--s-16` 64 (4/8/12/16/20/24/32/40/48/64), `--section`, `--container`, `--gutter`, `--grid-min` |
| Controls | `--tap` 44px (minimum target), `--control-h` 48px, `--control-h-sm` 44px |
| Motion | `--ease-out`, `--ease-in-out`, `--d-hover`, `--d-ui`, `--d-reveal`, `--d-hero` |
| Layers | `--z-header` 50, `--z-progress` 70, `--z-sheet` 80, `--z-fly` 90, `--z-toast` 95 |
| Chrome | `--header-h`, `--safe-top`, `--safe-bottom` |
| Focus | `--focus` (ink on the floor, sun inside `.stage`), `--focus-ring` |
| Shadow | `--shadow-1`, `--shadow-2`, `--shadow-3` |

`.stage` on any section switches it to the dark stage: it redefines the floor/ink tokens and `--focus`, so
components inside restyle themselves. Components with a stage look (buttons, chips, tabs, cards, breadcrumbs,
skeletons) need no extra prop.

## 2. Type and layout helpers (`src/styles/base.css`)

- Type: `.t-hero`, `.t-h1`, `.t-h2`, `.t-h3`, `.t-body`, `.t-small`, `.t-muted`, `.t-mono` (uppercase micro
  label), `.t-price`, `.t-num` (tabular figures).
- Layout: `.container`, `.container-narrow`, `.section`, `.section-tight`, `.section-2` (grey floor), `.stack`
  (`--stack-gap`), `.cluster` (`--cluster-gap`), `.grid-products` (auto-fill; exactly two columns under 640px).
- Utility: `.sr-only`, `.skip-link`, `.route-fallback`, `.site-main`.
- Fonts: self-hosted variable fonts in latin, latin-ext and cyrillic subsets, `font-display: swap`, plus a
  metric-matched `Geologica Fallback` so the swap does not shift layout.

## 3. CSS conventions

- One CSS file per component, imported by that component. No Tailwind, CSS-in-JS or inline style objects for
  static styling (inline style is for runtime values and CSS variables such as `--rail-item`).
- Class prefixes: `ui-*` shared components, `fx-*` motion primitives, a page or area prefix for page CSS
  (`home-*`, `pdp-*`, `shop-*`, `hdr-*` …). Modifiers are `--name`; states are `is-*` / ARIA attributes.
- Animate `transform` and `opacity` only. Hover effects go inside `@media (hover: hover)`.
- Every interactive target is at least `--tap` (44px). Focus is `:focus-visible` with `--focus`; never remove
  an outline without a replacement.
- The global reduced-motion block in base.css cuts CSS animations and transitions; JS motion is handled by
  `MotionConfig reducedMotion="user"` and the primitives below.

## 4. Brand marks (`components/ui/Wordmark.jsx`)

- `<Wordmark to="/" size={28} />` — sun mark plus «FairHaven»; a link (or a span with `to={null}`). The sun
  rises once on load; the glow shows on hover and focus.
- `<SunMark size={32} rise title />` — the mark alone (favicon, empty states, loaders).

## 5. Components (`src/components/ui/`, barrel `ui/index.js`)

```js
import { Button, ProductCard, Rail, useAddToCart } from '../components/ui/index.js';
```

| Component | Props | Notes |
| --- | --- | --- |
| `Button` | `variant` primary/secondary/ghost/stage, `size` sm 44/md 48/lg 56, `block`, `magnetic`, `iconStart`, `iconEnd`, `to` (Link), `href` (a), else a `type="button"` button | Hover: a fill sweeps in from the left. `stage` = sun fill for dark sections (a primary inside `.stage` is the same). |
| `IconButton` | `label` (required: aria-label and title), `variant` plain/outline/solid, `size` md/lg | 44px round. |
| `Chip`, `ChipGroup` | Chip: `value`, `count`, `icon`, `selected`, `onClick`. Group: `label`, `value`, `onChange`, `multiple`, `scroll` | `aria-pressed`. Single select: pressing the active chip clears it (`null`); the fill glides between chips. `count={0}` disables. `scroll` makes one swipeable row. |
| `Select` | `label`, `hideLabel`, `value`, `onChange(value)`, `options` [{value, label, disabled}] | Native select in a pill. |
| `Tabs`, `TabPanel` | Tabs: `label`, `idPrefix` (required), `value`, `onChange`, `tabs` [{value, label}]. Panel: `idPrefix`, `value`, `active` | Arrow/Home/End keys, roving tabindex, sliding underline. |
| `QuantityStepper` | `value`, `onChange`, `onRemove`, `min` 1, `max` 99, `label`, `size` md/lg | At `min` with `onRemove`, minus becomes a bin. Value in `<output aria-live>`. |
| `Price` | `value`, `old`, `showPercent`, `size` sm/md/lg | Old price as `<del>` with a spoken label; the `−N%` chip only with `showPercent` (savings sections). |
| `ProductCard` | `product` (raw API or normalised), `variant` default/compact/stage, `showPercent`, `priority`, `headingLevel` 3 | The whole card opens `/product/:id` with the image morphing into the product page; «В корзину» uses `useAddToCart`. `compact` is a one-row card for search, cart suggestions and lists (give it a full-width row). `stage` belongs inside `.stage` and tilts toward the cursor. |
| `ProductGrid` | `items`, `status`, `total`, `hasMore`, `onLoadMore`, `onRetry`, `empty`, `skeletons` 8, `showPercent`, `priorityCount` | Filter changes animate: staying cards glide, new ones rise in one after another (≤360ms), removed ones fade. Skeletons while loading, error with retry, empty state, «Показать ещё» and «Показано N из M». |
| `Rail` | `label` (region name), `itemWidth` (CSS length), `arrows` | Snap scrolling; mouse drag (a drag never opens a card); arrows page by 85% and disable at the ends, hidden on touch screens; arrow keys scroll when focused. Each child becomes an item. |
| `SectionHeader` | `title`, `eyebrow`, `desc`, `linkTo`, `linkLabel`, `action`, `as` h2, `size` h2, `id` | Title left, link or action right. |
| `EmptyState` | `icon` (default SunMark), `title`, `text`, `action`, `as` h2 | |
| `Skeleton`, `SkeletonCard` | Skeleton: `w`, `h`, `r`. SkeletonCard: `variant` | Sheen stops under reduced motion. |
| `ToastProvider`, `useToast` | `toast({ message, action: {label, onClick}, id, duration })` | Max three; the same `id` replaces the old toast; pauses on hover and focus; polite live region. A bottom bar that toasts must clear sets `--toast-lift` on `<html>` (the cart drawer footer and the product sticky bar do). |
| `Sheet` | `open`, `onClose`, `side` right/left/bottom, `title` or `label`, `footer` | Modal: focus trap, Esc, scroll lock, background inert, focus returns. Bottom sheet can be pulled down by its head. `[data-autofocus]` inside gets first focus. |
| `Accordion` | `items` [{id, title, content}], `multiple`, `defaultOpen`, `headingLevel` 3 | Buttons with `aria-expanded`; regions hidden when closed. |
| `OpenCartProvider`, `useOpenCart` | App passes its drawer opener | `useOpenCart()` returns `() => void` or null. |
| `useAddToCart` | `addToCart(product, { qty, sourceEl })` | The one add action: adds with the display title, flies `sourceEl` (an image) to the header cart, shows «Добавлено в корзину» with «Открыть». The drawer never opens by itself. |

Older shared components in `src/components/`:

- `Breadcrumbs` — `trail` [{label, to}]; the last crumb is the current page. It has its own CSS.
- `ScrollToTop` — jumps to the top before paint on every new path; query-only changes keep the scroll.
- `SectionHeader` — the old API (`title`, `desc`, `linkTo`, `linkLabel`), drawn by the ui SectionHeader.
- `ProductCard` — re-exports the ui card.
- `Icons` — `<Name size={20} strokeWidth />` line icons; `ICONS` maps string keys to components.

## 6. Motion (`src/motion/`, barrel `motion/index.js`)

Rules:

- One ease family: `EASE_OUT` [0.22, 1, 0.36, 1] for nearly everything, `EASE_IN_OUT` for loops.
- `DURATION` hover .16, ui .28, reveal .52, hero .9 (seconds).
- `SPRING.snappy` for UI, `.soft` for follow effects, `.pop` for badges.
- Only `transform` and `opacity` move. Reduced motion keeps fades, drops movement, stops loops and marquees.
- Pointer effects (Magnetic, Tilt) run only with a fine pointer.

| Primitive | Use |
| --- | --- |
| `MotionProvider` | Already in App: LazyMotion with `domAnimation`, swapped to `domMax` after idle (layout, layoutId, drag), and `MotionConfig reducedMotion="user"`. |
| `<Reveal as y delay>` / `<Stagger as stagger delay>` | Rise-in on scroll, once. Children of `Stagger` that are `Reveal` follow one another (60ms, at most 360ms). Starts when any part is 10% above the bottom edge (`REVEAL.margin`), so very tall blocks still appear. |
| `<Magnetic strength={6}>` | Pulls its child a few px toward the cursor (`Button magnetic` uses it). |
| `<Tilt max={6} glare trackRef>` | 3D tilt toward the cursor with a soft highlight. `trackRef` lets a bigger element (a card) drive it. |
| `<Counter value from format duration>` | Counts up once when visible; screen readers get the final value only. |
| `<Marquee speed={48} direction velocity gap>` | Endless row that speeds up and skews with scroll velocity; pauses on hover/focus, off-screen and in hidden tabs; reduced motion gives a still, hand-scrollable row. Repeats are `aria-hidden`, `inert` and `pointer-events: none`; a host that reacts to the pointer maps a point over a repeat back to the first copy. |
| `FlyToCartProvider`, `useFlyToCart()` | `fly(imgEl) → Promise<boolean>`: a copy of the image flies to `[data-cart-target]` and the `[data-cart-badge]` inside it pops. The header marks these two elements and does not animate the badge itself. |
| `useVTNavigate()` | `go(to, { sharedEl })`: navigates inside a View Transition; `sharedEl` morphs into the element on the next page that has the same name. The product page sets `style={{ viewTransitionName: PRODUCT_IMAGE_VT }}` on its main image. Without support or with reduced motion it navigates plainly. |
| `startViewTransition(update)`, `inViewTransition()` | Low-level helpers; App skips its page fade during a transition. |
| `RouteProgress`, `RouteFallback`, `useRouteBusy(busy)` | Thin sun bar at the top while a lazy route or data loads (shows after 120ms). `useProduct` already drives it; call `useRouteBusy(true)` while other page-blocking data loads. |
| `useMediaQuery(q)`, `useFinePointer()`, `usePageVisible()` | Media and visibility hooks. |
| `EASE_OUT`, `EASE_IN_OUT`, `DURATION`, `SPRINGS`, `SPRING`, `REVEAL`, `tween()` | Constants. |

App-level motion: a light page fade (opacity and 6px, no exit phase) on every path change, the top progress
bar, and the fly-to-cart layer.

## 7. i18n (`src/i18n/`)

- `useI18n()` → `{ lang, setLang, toggle, t(key), tf(key, vars), plural(n, forms) }`.
  - `tf('shownOf', { shown: 8, total: 106 })` fills `{name}` placeholders.
  - `plural(5, t('unitProducts'))` picks the Russian form from a `'товар|товара|товаров'` string; Uzbek has one form.
- One file per namespace in `ru/` and `uz/`, with the same keys in both (the i18n test enforces it). `dicts.js`
  merges the namespaces into one flat dictionary per language, so keys must be unique across namespaces.

| Namespace | Scope | Owner |
| --- | --- | --- |
| `common` | Shared words, taxonomy labels (`need.*`, `kind.*`), UI strings | foundation |
| `shell` | Header, mega menu, search overlay, announcement bar, footer | shell builder |
| `home` | Home sections | home builder |
| `catalog` | /shop filters, sorting, results | catalogue builder |
| `product` | Product page | product builder |
| `brands` | /brands and /brands/:slug | brands builder |
| `cart` | Drawer, /cart, /checkout, order success | cart builder |
| `account` | Account, Telegram sign-in, order history | account builder |
| `journal` | /learn and articles | journal builder |
| `pages` | About, Contact, FAQ, 404 | pages builder |

Add a namespace with one export line in `ru/index.js` and `uz/index.js`. Long content (home copy, blog posts,
about page) lives in `src/content/` (`home.js`, `blog.js`, `about.js`, `defaults.js`, `guides.js`); the backend
imports `defaults.js` and `guides.js`, so those stay plain ESM without JSX.

## 8. Catalogue (`src/catalog/`, barrel `catalog/index.js`)

The whole catalogue (about a hundred products) is loaded once by `CatalogProvider` (in App) and filtered on the
client.

- `useCatalog()` → `{ products, status, error, reload, taxonomy, taxonomySource, index, byId }`.
- `useProducts(filter, { sort, page, size })` → `{ items, total, hasMore, page, pages, shown, all, facets, status }`.
  - `filter`: `{ need: [] | key, kind, brand, q, sale, min, max, available }`, compared by value.
  - `items` holds pages 1…`page`; `all` is the full sorted list.
  - `facets`: `{ total, sale, needs: [{key, count}], kinds: [{key, count}], brands: [{slug, name, count}] }`.
  - `SORTS`: recommended, price-asc, price-desc, saving, name; `PAGE_SIZE` is 24.
- `useProduct(id)` → `{ product, status: loading | ready | notfound | error }`: from the catalogue when loaded,
  else one request.
- `useTaxonomy()` → `{ taxonomy, source, status }`: counts per need, kind and brand. It comes from the API when
  available, else is computed locally.
- Normalised product, from `normalizeProduct(raw)` (idempotent):
  - text: `title`, `titleUz`, `spec` (for example «50 мл · 15 шт»), `brandName`, `brandSlug`;
  - taxonomy: `needs`, `kind`;
  - money: `price`, `oldPrice`, `saving`, `percent`;
  - `image`, `isAvailable`.
  - Use `productTitle(p, lang)` for display; never show the raw ALL-CAPS `name`.
- Other helpers:
  - search: `searchProducts(products, q, index)`, `fold` (one folded Latin form, so «солгар» finds Solgar and «magniy» finds «магний»; synonym groups);
  - money: `formatSum(n, lang)` → «1 190 000 сум», `percentOff`;
  - shelves: `savingsShelf`;
  - taxonomy: `NEED_KEYS`, `KIND_KEYS`, `LEGACY_STAGES`, `needFromSlug`;
  - brands: `BRANDS`, `brandBySlug`.
- The brand registry and classification mirror `backend/utils/catalog/`. `catalog/parity.test.mjs` fails when
  the two copies drift apart.

## 9. Accessibility rules

- Every page has one `h1`. Sections use `SectionHeader` (`h2`); cards default to `h3`.
- Targets are at least 44×44. Focus is always visible: ink ring on the floor, sun ring on the stage.
- Icon-only buttons use `IconButton` with a `label`. Decorative images get `alt=""` (cards: the title is the
  link text).
- Live updates (toasts, quantity, counts) go through polite live regions. Modals use `Sheet`, which traps focus
  and makes the page behind inert.
- `<a class="skip-link" href="#main">` is the first focusable element (App); `main#main` takes the focus.
- Colour is never the only signal: the old price is struck through and spoken, out-of-stock is written.
- Reduced motion is respected everywhere (see §6). Test at 390px and 1440px with no horizontal scroll.

## 10. Tests and checks

```sh
node --test web/src/catalog/*.test.mjs web/src/i18n/*.test.mjs
cd web && npm run build
```

## 11. Shell

Header, mega menu, phone menu, search overlay, cart drawer, announcement bar and footer live in
`web/src/components/` (`Header.jsx`, `Footer.jsx`, `CartDrawer.jsx`, `AnnouncementBar.jsx`) and
`web/src/components/shell/`. Their copy is in `i18n/{ru,uz}/shell.js` under `shell.*` keys.

**Header tone.** A page that opens on a dark stage calls the hook once:

```jsx
import { useHeaderTone } from '../components/shell/HeaderTone.jsx';
useHeaderTone('stage'); // or 'floor' (the default; no call needed)
```

With `'stage'` the header starts see-through with light text and the page slides under it; after 24 px of
scroll it turns white glass with a hairline. The first stage section must make room for it:

```css
.my-hero { padding-top: calc(var(--header-overlap) + var(--s-12)); }
```

`--header-overlap` equals `--header-h` (60 px on phones, 72 px from 1080 px) while a stage page is
mounted and `0px` otherwise, so the same rule is safe on any page. The tone resets to `'floor'` when the
page unmounts. Past 400 px the header hides on scroll down and comes back on scroll up.

**Search.** Anything can open the search overlay, optionally prefilled:

```jsx
import { useSearch } from '../components/shell/SearchContext.jsx';
const { openSearch } = useSearch();
<button onClick={() => openSearch('омега')}>…</button>
```

`openSearch(query?)` opens it with the field focused (and the text selected); `closeSearch()` closes it;
`isOpen` tells whether it is open. `/` and Cmd/Ctrl+K open it from anywhere. Enter without a highlighted
result goes to `/shop?q=…`; focus returns to the element that opened it.

**Cart landing point.** The header cart button carries `data-cart-target` and its badge `data-cart-badge`;
FlyToCart flies products there and pops the badge. Do not animate the badge elsewhere.
