# Graph Report - project vitamin delivery  (2026-07-31)

## Corpus Check
- 169 files · ~139,687 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1277 nodes · 2429 edges · 74 communities (69 shown, 5 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 117 edges (avg confidence: 0.6)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `82de8628`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- frontend/src/App.jsx
- bot.js
- webAuthController.js
- sendError
- authorization.test.js
- src/api.js
- dependencies
- useI18n
- orderController.js
- dependencies
- web/src/pages/Home.jsx
- Product.jsx
- frontend/package.json
- backend/server.js
- SettingsContext.jsx
- productController.js
- web/src/components/Header.jsx
- Icons.jsx
- uploadController.js
- web/src/App.jsx
- adminRequest
- Hero3D.jsx
- userController.js
- adminApi.js
- AdminApp.jsx
- publicController.js
- PromoCodes.jsx
- siteContentController.js
- uploadImage
- scripts
- Products.jsx
- Customers.jsx
- admin/pages/Orders.jsx
- bootstrap.js
- seed.js
- index.jsx
- adminRoutes.js
- adminNotification.test.js
- orderIntegrity.test.js
- bottleLabels.js
- Dashboard.jsx
- oferta.js
- PromoCode.js
- 3D Hero Redesign — Photo-Accurate Bottle (v3)
- Telegram Mini App (TMA) - Core API Reference
- 3D Hero Design — Fairhaven Health Web
- 3. Arxitektura
- Fairhaven Security Hardening Design
- 3D Hero Photo-Accurate Bottle (v3) Implementation Plan
- Fairhaven Security Hardening Implementation Plan
- Simple Registration Design
- http.js
- Simple Registration Implementation Plan
- client.js
- db.js
- channel/package.json
- catalog.js
- AdminPanel.jsx
- webRoutes.js
- auth.js
- 1. Xavfsizlik
- channel-hub
- src/server.js
- logger.js
- 2. Bot optimizatsiyasi
- Billz → Kanal integratsiyasi (Medicalka / Uzum Tezkor / Yandex) — dizayn
- 4. Admin panel
- Xavfsizlik va bot optimizatsiyasi — audit
- 2. Tekshirilgan faktlar
- config.js
- mirrorMapping.test.js

## God Nodes (most connected - your core abstractions)
1. `sendError()` - 72 edges
2. `useI18n()` - 56 edges
3. `adminRequest()` - 32 edges
4. `hapticFeedback()` - 24 edges
5. `createBot()` - 20 edges
6. `request()` - 18 edges
7. `request()` - 18 edges
8. `3D Hero Redesign — Photo-Accurate Bottle (v3)` - 15 edges
9. `ProductDetail()` - 14 edges
10. `OrderDetail()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `getAll()` --calls--> `sendError()`  [EXTRACTED]
  backend/controllers/orderController.js → backend/utils/http.js
- `getById()` --calls--> `sendError()`  [EXTRACTED]
  backend/controllers/orderController.js → backend/utils/http.js
- `updateStatus()` --calls--> `sendError()`  [EXTRACTED]
  backend/controllers/orderController.js → backend/utils/http.js
- `getByUser()` --calls--> `sendError()`  [EXTRACTED]
  backend/controllers/orderController.js → backend/utils/http.js
- `getAll()` --calls--> `sendError()`  [EXTRACTED]
  backend/controllers/productController.js → backend/utils/http.js

## Import Cycles
- None detected.

## Communities (74 total, 5 thin omitted)

### Community 0 - "frontend/src/App.jsx"
Cohesion: 0.05
Nodes (78): App(), AUTH, CHROME_PAGES, BottomNav(), TABS, Header(), Loading(), ProductCard() (+70 more)

### Community 1 - "bot.js"
Cohesion: 0.06
Nodes (59): absolutizeUrl(), {
  acceptConsent,
  applyVerifiedContact,
  escapeRegistrationName,
  syncRegistrationUser,
}, broadcastProductToUsers(), buildChannelKeyboard(), buildProductBroadcastMessage(), categoryLabel(), claimWebLoginToken(), createBot() (+51 more)

### Community 2 - "webAuthController.js"
Cohesion: 0.08
Nodes (31): botUsername(), crypto, hashToken(), me(), publicUser(), { sendError }, {
  signSession,
  sessionCookieOptions,
  COOKIE_NAME,
}, start() (+23 more)

### Community 3 - "sendError"
Cohesion: 0.08
Nodes (44): Collection, createCollection(), createProduct(), createPromo(), deleteCollection(), deleteProduct(), deletePromo(), deleteSetting() (+36 more)

### Community 4 - "authorization.test.js"
Cohesion: 0.06
Nodes (30): whoami(), { getTelegramUserFromRequest }, resolveAdmin(), User, authError(), crypto, getTelegramUserFromRequest(), requireSelf() (+22 more)

### Community 5 - "src/api.js"
Cohesion: 0.19
Nodes (19): adminUploadImage(), authLogout(), authMe(), authStart(), authStatus(), createOrder(), fetchCategories(), fetchOrder() (+11 more)

### Community 6 - "dependencies"
Cohesion: 0.05
Nodes (38): @fontsource/prata, motion, puppeteer, react-router-dom, @react-three/drei, @react-three/fiber, @react-three/postprocessing, three (+30 more)

### Community 7 - "useI18n"
Cohesion: 0.11
Nodes (27): AnnouncementBar(), BlogTeaser(), CONTENT_ICONS, Baby(), Flower(), Leaf(), Sparkle(), User() (+19 more)

### Community 8 - "orderController.js"
Cohesion: 0.12
Nodes (29): create(), { errorLabel, sendError }, getAll(), getById(), getByUser(), messageForError(), normalizeItems(), normalizeLocation() (+21 more)

### Community 9 - "dependencies"
Cohesion: 0.06
Nodes (32): dependencies, cookie-parser, cors, dotenv, express, express-rate-limit, jsonwebtoken, mongoose (+24 more)

### Community 10 - "web/src/pages/Home.jsx"
Cohesion: 0.10
Nodes (23): clamp01(), FALLBACK_IMAGES, HeroArch(), makeArchTexture(), makeShadowTexture(), ORBS, pointer, ProductVitrine() (+15 more)

### Community 11 - "Product.jsx"
Cohesion: 0.25
Nodes (16): CartDrawer(), drawerSpring, Bottle(), Cart(), MotionLink, ProductCard, CartContext, useCart() (+8 more)

### Community 12 - "frontend/package.json"
Cohesion: 0.09
Nodes (22): dependencies, react, react-dom, devDependencies, @types/react, @types/react-dom, vite, @vitejs/plugin-react (+14 more)

### Community 13 - "backend/server.js"
Cohesion: 0.08
Nodes (24): adminRoutes, { apiLimiter }, app, cookieParser, cors, { createBot }, express, { FAIRHAVEN_PRODUCTS } (+16 more)

### Community 14 - "SettingsContext.jsx"
Cohesion: 0.21
Nodes (11): fetchPublicSettings(), Breadcrumbs(), ArrowRight(), DEFAULTS, SettingsContext, SettingsProvider(), useSettings(), Contact() (+3 more)

### Community 15 - "productController.js"
Cohesion: 0.10
Nodes (17): create(), getAll(), getById(), getCategories(), getPopular(), Order, Product, remove() (+9 more)

### Community 16 - "web/src/components/Header.jsx"
Cohesion: 0.16
Nodes (13): fetchMyOrders(), CATEGORIES, COMPANY_LINKS, FAMILIES, Header(), Gift(), Search(), useAuth() (+5 more)

### Community 17 - "Icons.jsx"
Cohesion: 0.15
Nodes (15): Footer(), base, Check(), Diamond(), Facebook(), Hexagon(), ICONS, Instagram() (+7 more)

### Community 18 - "uploadController.js"
Cohesion: 0.15
Nodes (17): crypto, deleteUpload(), ensureDir(), fs, isValidImageSignature(), isValidVideoSignature(), listUploads(), MIME_EXT (+9 more)

### Community 19 - "web/src/App.jsx"
Cohesion: 0.11
Nodes (17): About, Account, AdminPanel, App(), Blog, BlogPost, Checkout, Contact (+9 more)

### Community 20 - "adminRequest"
Cohesion: 0.24
Nodes (15): adminRequest(), createCollection(), deleteCollection(), deleteUpload(), fetchAllProductsAdmin(), listCollectionsAdmin(), listUploads(), updateCollectionAdmin() (+7 more)

### Community 21 - "Hero3D.jsx"
Cohesion: 0.17
Nodes (8): bottleSpec, labelCrop, motion, BODY_POINTS, BottleCap(), createCurvedLabelGeometry(), createRibbedCapGeometry(), PhotoLabel()

### Community 22 - "userController.js"
Cohesion: 0.27
Nodes (9): addAddress(), getByTelegramId(), getOrCreate(), normalizeProfileName(), pick(), removeAddress(), { sendError }, update() (+1 more)

### Community 23 - "adminApi.js"
Cohesion: 0.24
Nodes (10): demoteAdmin(), listAdmins(), listSettings(), promoteAdmin(), upsertSetting(), Admins(), fmtDate(), DEFAULT_ORDER (+2 more)

### Community 24 - "AdminApp.jsx"
Cohesion: 0.26
Nodes (12): clearAdminTgId(), setAdminTgId(), whoami(), AdminApp(), LoginPage(), MOBILE_NAV, NAV, Modal() (+4 more)

### Community 25 - "publicController.js"
Cohesion: 0.14
Nodes (11): Collection, getCollection(), getSettings(), listCollections(), PUBLIC_SETTING_KEYS, { sendError }, Setting, collectionSchema (+3 more)

### Community 26 - "PromoCodes.jsx"
Cohesion: 0.26
Nodes (12): createPromo(), deletePromo(), listPromos(), togglePromo(), updatePromo(), discountLabel(), fmtDate(), fmtUZS() (+4 more)

### Community 27 - "siteContentController.js"
Cohesion: 0.18
Nodes (10): getPublic(), { sendError }, SiteContent, update(), mongoose, siteContentSchema, ctrl, express (+2 more)

### Community 28 - "uploadImage"
Cohesion: 0.28
Nodes (11): uploadImage(), beautify(), clamp(), curve(), ImageUpload(), loadImage(), beautify(), clamp() (+3 more)

### Community 29 - "scripts"
Cohesion: 0.17
Nodes (11): description, name, scripts, build:frontend, dev:backend, dev:frontend, install:all, render:build (+3 more)

### Community 30 - "Products.jsx"
Cohesion: 0.31
Nodes (10): createProduct(), deleteProduct(), listProductsAdmin(), toggleProduct(), updateProduct(), CATEGORIES, catLabel(), fmtPrice() (+2 more)

### Community 31 - "Customers.jsx"
Cohesion: 0.33
Nodes (9): getUserDetail(), listUsers(), CustomerDetailModal(), Customers(), FILTERS, fmtDate(), fmtPrice(), genderLabel() (+1 more)

### Community 32 - "admin/pages/Orders.jsx"
Cohesion: 0.35
Nodes (10): listOrders(), revertOrder(), updateOrderStatus(), BUCKETS, fmtDate(), fmtPrice(), OrderDetailModal(), Orders() (+2 more)

### Community 33 - "bootstrap.js"
Cohesion: 0.28
Nodes (8): DEFAULT_SETTINGS, ensureAtLeastOneAdmin(), promoteAdminsFromEnv(), seedDefaultSettings(), Setting, User, autoSeed(), start()

### Community 34 - "seed.js"
Cohesion: 0.29
Nodes (4): FAIRHAVEN_PRODUCTS, { FAIRHAVEN_PRODUCTS }, mongoose, Product

### Community 35 - "index.jsx"
Cohesion: 0.15
Nodes (11): Reviews(), REVIEWS_RU, REVIEWS_UZ, loadYmaps(), TASHKENT_CENTER, YandexMapPicker(), DICTS, I18nContext (+3 more)

### Community 36 - "adminRoutes.js"
Cohesion: 0.16
Nodes (14): apiLimiter, authLimiter, build(), { ipKeyGenerator }, limitReached(), rateLimit, IMPORTANT: these only work correctly when `app.set('trust proxy', ...)` is, uploadLimiter (+6 more)

### Community 39 - "bottleLabels.js"
Cohesion: 0.60
Nodes (4): LABEL_SPECS, makeLabelTexture(), roundRect(), wrapLines()

### Community 40 - "Dashboard.jsx"
Cohesion: 0.83
Nodes (3): stats(), Dashboard(), formatUZS()

### Community 46 - "3D Hero Redesign — Photo-Accurate Bottle (v3)"
Cohesion: 0.10
Nodes (19): 3D Hero Redesign — Photo-Accurate Bottle (v3), Acceptance criteria, Animation — NO auto-rotation (key change from v2), Body (LatheGeometry from a profile), Cap (flat, short, wide), Comparison vs v2 (what's different), Decision, Geometry — photo-accurate (+11 more)

### Community 47 - "Telegram Mini App (TMA) - Core API Reference"
Cohesion: 0.10
Nodes (19): BackButton, Best Practices, Data Passing, Data Validation (Backend), Event, Event Listener, Events, Initialization (+11 more)

### Community 48 - "3D Hero Design — Fairhaven Health Web"
Cohesion: 0.11
Nodes (18): 3D Hero Design — Fairhaven Health Web, Architecture, Context, CSS (`web/src/site.css`), Decision, Integration, Interactivity, Loading state (+10 more)

### Community 49 - "3. Arxitektura"
Cohesion: 0.22
Nodes (9): 3.1 Umumiy ko'rinish, 3.2.1 Mahsulot faqat Billz'dan qo'shiladi, 3.2 Ma'lumot modeli, 3.3 Billz klienti, 3.4 Sinxronizatsiya, 3.5.1 Telegram xabarnomalari (hamma kanal uchun), 3.5 Zakaz → bron → sotuv, 3.6 Kanal adapterlari (+1 more)

### Community 50 - "Fairhaven Security Hardening Design"
Cohesion: 0.17
Nodes (11): Application Architecture, Compatibility Rollout, Data Integrity And Privacy, Edge And Host, Fairhaven Security Hardening Design, Goal, Resource Authorization, Rollback (+3 more)

### Community 51 - "3D Hero Photo-Accurate Bottle (v3) Implementation Plan"
Cohesion: 0.20
Nodes (9): 3D Hero Photo-Accurate Bottle (v3) Implementation Plan, Execution Handoff, File Structure, Self-Review (run after writing, before execution), Task 1: Lathe body geometry + opaque white plastic, Task 2: Central white label sleeve + black wordmark (both sides), Task 3: Mouse tilt + scroll parallax (no auto-rotation), Task 4: Subtle post-processing (Bloom + Vignette) (+1 more)

### Community 52 - "Fairhaven Security Hardening Implementation Plan"
Cohesion: 0.25
Nodes (7): Fairhaven Security Hardening Implementation Plan, Task 1: Signed Telegram Identity, Task 2: Route Authorization And Privacy, Task 3: Order Integrity And Input Hardening, Task 4: Dependencies And Build, Task 5: Reversible Edge And Host Hardening, Task 6: Production Deploy And Verification

### Community 53 - "Simple Registration Design"
Cohesion: 0.29
Nodes (6): Bot Flow, Compatibility, Goal, Profile Name Editing, Simple Registration Design, Testing

### Community 54 - "http.js"
Cohesion: 0.24
Nodes (7): assert, test, CONTENT_SECURITY_POLICY, CSP_DIRECTIVES, FRAME_ANCESTORS, redactPath(), securityHeaders()

### Community 55 - "Simple Registration Implementation Plan"
Cohesion: 0.33
Nodes (5): Simple Registration Implementation Plan, Task 1: Simple Bot Registration, Task 2: Secure Profile Name Update, Task 3: Profile Name Editor, Task 4: Production Deploy And Verification

### Community 56 - "client.js"
Cohesion: 0.12
Nodes (18): auth, BillzError, config, { createLimiter, sleep }, get(), limiter, listProducts(), listShops() (+10 more)

### Community 57 - "db.js"
Cohesion: 0.12
Nodes (15): config, defineModel(), getConnection(), logger, mongoose, OWNED_COLLECTIONS, billzProductSchema, { defineModel } (+7 more)

### Community 58 - "channel/package.json"
Cohesion: 0.10
Nodes (19): dependencies, dotenv, express, mongoose, description, engines, node, dotenv (+11 more)

### Community 59 - "catalog.js"
Cohesion: 0.17
Nodes (18): config, db, logger, main(), { runCatalogSync, fetchAllProducts }, start(), applyToMirror(), billz (+10 more)

### Community 60 - "AdminPanel.jsx"
Cohesion: 0.18
Nodes (13): adminUploadVideo(), fetchSiteContent(), TESTIMONIALS, DEFAULT_CONTENT, mergeContent(), SiteContentContext, SiteContentProvider(), ACCENTS (+5 more)

### Community 61 - "webRoutes.js"
Cohesion: 0.15
Nodes (11): webAuth, { authLimiter, uploadLimiter }, express, router, siteContentCtrl, uploadCtrl, webAdminAuth, webAuth (+3 more)

### Community 62 - "auth.js"
Cohesion: 0.30
Nodes (10): BillzToken, config, getAccessToken(), invalidate(), issue(), isUsable(), loadPersisted(), logger (+2 more)

### Community 63 - "1. Xavfsizlik"
Cohesion: 0.18
Nodes (11): 1. Xavfsizlik, HIGH-1 · Rate limiting umuman yo'q, HIGH-2 · `express.json({ limit: '6mb' })` global qo'llanilgan, HIGH-3 · `mongodb-memory-server` — production bog'liqligi, LOW, MEDIUM-1 · CSP yo'q va `X-Frame-Options` Telegram Web'ni buzadi, MEDIUM-2 · Admin amallari uchun audit jurnali yo'q, MEDIUM-3 · `listUploads` sinxron fs chaqiruvlari (+3 more)

### Community 64 - "channel-hub"
Cohesion: 0.20
Nodes (7): channel-hub, Endpoints, Operational notes, Safety rails, Setup, What it will not touch, Why a separate service

### Community 65 - "src/server.js"
Cohesion: 0.20
Nodes (9): app, billz, BillzProduct, config, db, express, logger, { runCatalogSync, startScheduler } (+1 more)

### Community 66 - "logger.js"
Cohesion: 0.28
Nodes (7): emit(), maskValue(), redact(), assert, db, mongoose, test

### Community 67 - "2. Bot optimizatsiyasi"
Cohesion: 0.22
Nodes (9): 2. Bot optimizatsiyasi, OPT-1 · Long polling → webhook (eng katta yutuq), OPT-2 · Ishga tushishda eski update'lar qayta ishlanadi, OPT-3 · Broadcast bo'lak + uyqu modeli, OPT-4 · `withTelegramRetry` konteksga qarab sozlanmagan, OPT-5 · `listProducts` sahifalashsiz, OPT-6 · Mongo indekslari, OPT-7 · Bot va HTTP bitta processda (+1 more)

### Community 68 - "Billz → Kanal integratsiyasi (Medicalka / Uzum Tezkor / Yandex) — dizayn"
Cohesion: 0.25
Nodes (8): 10. Bog'liq hujjatlar, 1. Maqsad, 5. Xavfsizlik, 6. Testlash, 7. Blokerlar (mijoz tomonidan hal qilinadi), 8. Bosqichlar, 9. Qabul qilingan qarorlar, Billz → Kanal integratsiyasi (Medicalka / Uzum Tezkor / Yandex) — dizayn

### Community 69 - "4. Admin panel"
Cohesion: 0.25
Nodes (8): 4.1 Yangi «Kanallar» sahifasi (`mini.fairhaven.uz/admin`), 4.2.1 Billz tanlagichi («Yangi mahsulot»), 4.2 Mahsulot kartasida «Kanallar» bo'limi, 4.3 Kanal zakazlari sahifasi, 4.4 Sinxronizatsiya vidjeti, 4.5 Kalitlar va kanal sozlamalari sahifasi, 4.6 «Qotib qolish» muammosini tuzatish, 4. Admin panel

### Community 70 - "Xavfsizlik va bot optimizatsiyasi — audit"
Cohesion: 0.25
Nodes (8): 0. Xulosa, 3. «Threaded mode» haqida, 4. Mini App — yangilash imkoniyatlari, 5. Bajarish tartibi, Ehtiyot bo'lish kerak, Muhim: versiya tekshiruvi yo'q, Qo'shishga arziydiganlar, Xavfsizlik va bot optimizatsiyasi — audit

### Community 71 - "2. Tekshirilgan faktlar"
Cohesion: 0.29
Nodes (7): 2.1 Billz, 2.2 Billz cheklovlari (arxitekturani belgilaydi), 2.3 Billz'da sotuv oqimi (qoldiqni kamaytirish), 2.4 Medicalka kontrakti, 2.5 Uzum Tezkor kontrakti, 2.6 Billz ma'lumotlari Uzum talablariga tayyormi, 2. Tekshirilgan faktlar

### Community 73 - "mirrorMapping.test.js"
Cohesion: 0.40
Nodes (3): assert, test, { toMirrorFields }

## Knowledge Gaps
- **507 isolated node(s):** `crypto`, `{ Telegraf, Markup }`, `User`, `Order`, `WebLoginToken` (+502 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `sendError()` connect `sendError` to `webAuthController.js`, `orderController.js`, `productController.js`, `uploadController.js`, `userController.js`, `http.js`, `publicController.js`, `siteContentController.js`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `createBot()` connect `bot.js` to `dependencies`, `sendError`, `backend/server.js`, `bootstrap.js`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Why does `telegraf` connect `dependencies` to `bot.js`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `crypto`, `{ Telegraf, Markup }`, `User` to the rest of the system?**
  _507 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `frontend/src/App.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05217391304347826 - nodes in this community are weakly interconnected._
- **Should `bot.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05541346973572037 - nodes in this community are weakly interconnected._
- **Should `webAuthController.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07823613086770982 - nodes in this community are weakly interconnected._