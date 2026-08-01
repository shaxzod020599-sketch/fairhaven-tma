# Graph Report - project vitamin delivery  (2026-08-01)

## Corpus Check
- 230 files · ~197,581 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1934 nodes · 3473 edges · 115 communities (101 shown, 14 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 264 edges (avg confidence: 0.61)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f582e13f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- frontend/src/App.jsx
- db.js
- issue-key.js
- stockReconciler.test.js
- Icons.jsx
- sendError
- authorization.test.js
- botOrders.js
- channel-hub service :3100
- channelController.js
- src/api.js
- backend/server.js
- uzum/serializers.js
- Billz → Kanal integratsiyasi (Medicalka / Uzum Tezkor / Yandex) — dizayn
- orderController.js
- Product.jsx
- bot.js
- POST /orders (create order)
- client.js
- useI18n
- sync/catalog.js
- channel-hub Service
- productController.js
- medicalka/routes.js
- adminApi.js
- Channels.jsx
- uzum/routes.js
- http.js
- 3D Hero Redesign — Photo-Accurate Bottle (v3)
- Telegram Mini App (TMA) - Core API Reference
- web/src/pages/Home.jsx
- 3D Hero Design — Fairhaven Health Web
- uploadController.js
- webAuthController.js
- src/server.js
- AdminApp.jsx
- createBot
- adminRoutes.js
- logger.js
- orders.js
- uzumContract.test.js
- dependencies
- web/src/App.jsx
- Hero3D.jsx
- images.js
- Collections.jsx
- index.jsx
- dependencies
- billzBridge.js
- Scene3D.jsx
- publicController.js
- oauth.js
- internal.js
- PromoCodes.jsx
- siteContentController.js
- webRoutes.js
- uploadImage
- Broadcast Pool with Bounded Parallelism (OPT-3)
- notify/telegram.js
- Fairhaven Health — API для Uzum Tezkor
- Fairhaven Security Hardening Design
- Modal.jsx
- scripts
- bootstrap.js
- withTelegramRetry
- webhookIntegration.test.js
- Products.jsx
- Customers.jsx
- admin/pages/Orders.jsx
- userController.js
- rateLimit.test.js
- 3D Hero Photo-Accurate Bottle (v3) Implementation Plan
- handleWebLoginPayload
- billzBridge.test.js
- frontend/package.json
- statuses.js
- mirrorMapping.test.js
- Account.jsx
- dev-admin.js
- seed.js
- channel/package.json
- Fairhaven Security Hardening Implementation Plan
- pool.test.js
- webhook.test.js
- formatOrderReceipt
- botOrders.test.js
- catalogPaging.test.js
- orders.test.js
- Simple Registration Design
- forwardOrderToChannel
- adminNotification.test.js
- broadcastNotification.test.js
- counters.test.js
- Simple Registration Implementation Plan
- orderIntegrity.test.js
- productIndexes.test.js
- internalAuth.test.js
- bottleLabels.js
- oferta.js
- PromoCode.js
- defineModel (Collection Allow-list Enforcement)
- Content Security Policy with frame-ancestors (MEDIUM-1)
- Threaded Mode: Forum Topics for Channel Separation
- pendingQty Counter
- Pino Async Logger
- safeAreaInset (Telegram API 8.0)
- Access Token Cache (15-day TTL, 401 Invalidates)
- BILLZ_WRITE_ENABLED Safety Rail
- billztokens collection
- channelcounters collection
- synclogs collection

## God Nodes (most connected - your core abstractions)
1. `sendError()` - 87 edges
2. `useI18n()` - 56 edges
3. `adminRequest()` - 46 edges
4. `hapticFeedback()` - 24 edges
5. `createBot()` - 19 edges
6. `request()` - 18 edges
7. `request()` - 18 edges
8. `errorLabel()` - 17 edges
9. `3D Hero Redesign — Photo-Accurate Bottle (v3)` - 15 edges
10. `ProductDetail()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `autoSeed (Empty DB Catalogue Seeding)` --semantically_similar_to--> `Billz Catalogue`  [INFERRED] [semantically similar]
  docs/superpowers/specs/2026-07-31-security-and-bot-audit.md → channel/README.md
- `Bot and HTTP Process Separation (OPT-7)` --semantically_similar_to--> `Separate Service Rationale (Isolation from Bot)`  [INFERRED] [semantically similar]
  docs/superpowers/specs/2026-07-31-security-and-bot-audit.md → channel/README.md
- `createBot()` --indirect_call--> `order()`  [INFERRED]
  backend/bot/bot.js → channel/src/adapters/uzum/serializers.js
- `similarity()` --indirect_call--> `token()`  [INFERRED]
  backend/utils/billzMatch.js → channel/tests/uzumContract.test.js
- `Mongo Indexes: sku, barcode (OPT-6)` --conceptually_related_to--> `Billz Catalogue`  [INFERRED]
  docs/superpowers/specs/2026-07-31-security-and-bot-audit.md → channel/README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Billz order chain draft->line->reserve->release->delete** — docs_architecture_uz_billz_order_draft, docs_architecture_uz_billz_create_postpone, docs_architecture_uz_billz_return_postpone, docs_architecture_uz_billz_order_payment [EXTRACTED 1.00]
- **Ostatok counters on a billzproducts record** — docs_architecture_uz_ostatok_model, docs_architecture_uz_reserved_qty_subtraction, docs_architecture_uz_local_hold, docs_architecture_uz_billzproducts_collection [EXTRACTED 1.00]
- **Channel order lifecycle received/reserved/sold/cancelled/failed** — docs_architecture_uz_order_lifecycle, docs_architecture_uz_repeat_order_protection, docs_architecture_uz_response_before_billz, docs_architecture_uz_goal_not_event, docs_architecture_uz_payment_type_unification [EXTRACTED 1.00]
- **Order lifecycle: accept -> reserve -> pay/cancel -> stock adjust** — docs_integrations_medicalka_api_ru_orders_endpoint, docs_integrations_medicalka_api_ru_order_status_endpoint, docs_integrations_medicalka_api_ru_order_status_paid, docs_integrations_medicalka_api_ru_order_status_cancelled, docs_integrations_medicalka_api_ru_reserve_on_accept_decision [INFERRED 0.85]
- **Token-scoped read endpoints (catalog + stock)** — docs_integrations_medicalka_api_ru_token_key, docs_integrations_medicalka_api_ru_pharmacies_endpoint, docs_integrations_medicalka_api_ru_products_endpoint, docs_integrations_medicalka_api_ru_inventory_endpoint, docs_integrations_medicalka_api_ru_stock_endpoint, docs_integrations_medicalka_api_ru_search_endpoint [INFERRED 0.75]
- **Design decisions preventing price and stock mismatches** — docs_integrations_medicalka_api_ru_catalog_publishing_rule, docs_integrations_medicalka_api_ru_price_from_catalog_decision, docs_integrations_medicalka_api_ru_reserve_on_accept_decision, docs_integrations_medicalka_api_ru_stock_404_is_none [INFERRED 0.75]
- **channel-hub Safety Rails System** — channel_readme_billz_write_enabled, channel_readme_rate_limiter, channel_readme_sync_min_catalog_ratio, channel_readme_atomic_catalogue_write, channel_readme_log_masking, channel_readme_image_mirror [EXTRACTED 0.95]
- **Telegram Web iframe CSP Fix** — docs_superpowers_specs_2026_07_31_security_and_bot_audit_csp, docs_superpowers_specs_2026_07_31_security_and_bot_audit_x_frame_options, docs_superpowers_specs_2026_07_31_security_and_bot_audit_telegram_web_iframe [EXTRACTED 0.95]
- **Webhook Migration Optimization Stack** — docs_superpowers_specs_2026_07_31_security_and_bot_audit_webhook_migration, docs_superpowers_specs_2026_07_31_security_and_bot_audit_long_polling, docs_superpowers_specs_2026_07_31_security_and_bot_audit_telegram_retry, docs_superpowers_specs_2026_07_31_security_and_bot_audit_drop_pending_updates, docs_superpowers_specs_2026_07_31_security_and_bot_audit_nginx [INFERRED 0.85]

## Communities (115 total, 14 thin omitted)

### Community 0 - "frontend/src/App.jsx"
Cohesion: 0.05
Nodes (80): App(), AUTH, CHROME_PAGES, BottomNav(), TABS, Header(), Loading(), ProductCard() (+72 more)

### Community 1 - "db.js"
Cohesion: 0.06
Nodes (46): availableStock(), BillzProduct, channelConfig(), ensureMedicalkaId(), findForChannel(), isAvailable(), isPublishable(), listForChannel() (+38 more)

### Community 2 - "issue-key.js"
Cohesion: 0.10
Nodes (31): arg(), ChannelKey, db, {
  generateKey, generateClientId, hashKey, describeKey, CHANNEL_TAG, KIND_TAG,
}, issue(), KIND_PURPOSE, list(), logger (+23 more)

### Community 3 - "stockReconciler.test.js"
Cohesion: 0.06
Nodes (43): billzProductViewSchema, mongoose, READ_METHODS, view, APPLY, BillzProductView, main(), { matchCatalogue, similarity } (+35 more)

### Community 4 - "Icons.jsx"
Cohesion: 0.07
Nodes (39): CONTENT_ICONS, CATEGORIES, COMPANY_LINKS, FAMILIES, Header(), Baby(), base, Diamond() (+31 more)

### Community 5 - "sendError"
Cohesion: 0.09
Nodes (42): Collection, createCollection(), createProduct(), createPromo(), deleteCollection(), deleteProduct(), deletePromo(), deleteSetting() (+34 more)

### Community 6 - "authorization.test.js"
Cohesion: 0.06
Nodes (30): whoami(), { getTelegramUserFromRequest }, resolveAdmin(), User, authError(), crypto, getTelegramUserFromRequest(), requireSelf() (+22 more)

### Community 7 - "botOrders.js"
Cohesion: 0.12
Nodes (22): order(), ChannelOrder, config, conflictFor(), ensureState(), GOALS, logger, orders (+14 more)

### Community 8 - "channel-hub service :3100"
Cohesion: 0.06
Nodes (42): Backend (bot) service :3000, Billz external API, BILLZ_BRIDGE_SINCE hard boundary, POST /v2/order/create_postpone (bron/reserve), POST /v2/order (draft), POST /v2/order-payment/:id (sale, deliberately untested), POST /v2/order/return-postpone (release reserve), billzproducts collection (writes: channel-hub) (+34 more)

### Community 9 - "channelController.js"
Cohesion: 0.08
Nodes (36): availability(), BillzProductView, bulkUpdate(), channelHub, channelOf(), CHANNELS, escapeRegex(), FORCE_STATUSES (+28 more)

### Community 10 - "src/api.js"
Cohesion: 0.12
Nodes (29): adminUploadImage(), adminUploadVideo(), authLogout(), authMe(), authStart(), authStatus(), createOrder(), fetchCategories() (+21 more)

### Community 11 - "backend/server.js"
Cohesion: 0.07
Nodes (27): adminRoutes, { apiLimiter }, app, billzBridge, cookieParser, cors, { createBot }, { errorLabel, redactPath, securityHeaders } (+19 more)

### Community 12 - "uzum/serializers.js"
Cohesion: 0.16
Nodes (12): catalog, categoriesFrom(), categoryIdFor(), composition(), compositionItem(), config, CONTENT_TYPES, images (+4 more)

### Community 13 - "Billz → Kanal integratsiyasi (Medicalka / Uzum Tezkor / Yandex) — dizayn"
Cohesion: 0.06
Nodes (32): 10. Bog'liq hujjatlar, 1. Maqsad, 2.1 Billz, 2.2 Billz cheklovlari (arxitekturani belgilaydi), 2.3 Billz'da sotuv oqimi (qoldiqni kamaytirish), 2.4 Medicalka kontrakti, 2.5 Uzum Tezkor kontrakti, 2.6 Billz ma'lumotlari Uzum talablariga tayyormi (+24 more)

### Community 14 - "orderController.js"
Cohesion: 0.12
Nodes (29): create(), { errorLabel, sendError }, getAll(), getById(), getByUser(), messageForError(), normalizeItems(), normalizeLocation() (+21 more)

### Community 15 - "Product.jsx"
Cohesion: 0.19
Nodes (21): fetchProducts(), Breadcrumbs(), CartDrawer(), drawerSpring, Bottle(), Cart(), MotionLink, ProductCard (+13 more)

### Community 16 - "bot.js"
Cohesion: 0.13
Nodes (21): absolutizeUrl(), {
  acceptConsent,
  applyVerifiedContact,
  escapeRegistrationName,
  syncRegistrationUser,
}, BROADCAST_PACING, broadcastProductToUsers(), buildProductBroadcastMessage(), categoryLabel(), crypto, { errorLabel } (+13 more)

### Community 17 - "POST /orders (create order)"
Cohesion: 0.10
Nodes (28): Stricter auth-failure limit 60 per 5 minutes per IP, Base URL api.fairhaven.uz/medicalka/v1, Catalog only publishes products with assigned Medicalka price and issuance enabled, Fairhaven Health API for Medicalka, price/quantity as string with 2 decimals for arithmetic safety, Free quantity = warehouse minus reserved, GET /inventory (available stock only), Key prefix encodes purpose and gives descriptive 401 (+20 more)

### Community 18 - "client.js"
Cohesion: 0.07
Nodes (36): BillzToken, config, getAccessToken(), invalidate(), issue(), isUsable(), { limiter }, loadPersisted() (+28 more)

### Community 19 - "useI18n"
Cohesion: 0.14
Nodes (19): fetchPublicSettings(), Footer(), ArrowRight(), Phone(), Telegram(), Newsletter(), Reviews(), REVIEWS_RU (+11 more)

### Community 20 - "sync/catalog.js"
Cohesion: 0.18
Nodes (17): config, db, logger, main(), { runCatalogSync, fetchAllProducts }, applyToMirror(), billz, BillzProduct (+9 more)

### Community 21 - "channel-hub Service"
Cohesion: 0.09
Nodes (23): Atomic Catalogue Write (No Partial Writes), Billz Catalogue, Bot Backend, channel-hub Service, Fairhaven Database, Local Image Mirroring (Billz CDN Forbidden), Credential Log Masking, Medicalka Channel (+15 more)

### Community 22 - "productController.js"
Cohesion: 0.09
Nodes (19): create(), getAll(), getById(), getCategories(), getPopular(), Order, Product, remove() (+11 more)

### Community 23 - "medicalka/routes.js"
Cohesion: 0.08
Nodes (22): BillzProduct, catalog, { channelLimiter, authFailureLimiter }, ChannelOrder, config, express, logger, notify (+14 more)

### Community 24 - "adminApi.js"
Cohesion: 0.19
Nodes (18): adminRequest(), channelSettings(), channelSummary(), channelSyncStatus(), issueChannelKey(), listChannelKeys(), listChannelProducts(), revokeChannelKey() (+10 more)

### Community 25 - "Channels.jsx"
Cohesion: 0.15
Nodes (16): bulkUpdateChannel(), linkProductToBillz(), searchBillzProducts(), CHANNEL_LABEL, ChannelCard(), ChannelRow(), money(), SHOP_STATE (+8 more)

### Community 26 - "uzum/routes.js"
Cohesion: 0.10
Nodes (18): catalog, { channelLimiter, authFailureLimiter }, ChannelOrder, checkStore(), config, express, fail(), findOrder() (+10 more)

### Community 27 - "http.js"
Cohesion: 0.14
Nodes (15): clearWebhook(), crypto, { errorLabel }, readConfig(), useWebhook(), webhookPath(), cancelByCustomer(), assert (+7 more)

### Community 28 - "3D Hero Redesign — Photo-Accurate Bottle (v3)"
Cohesion: 0.10
Nodes (19): 3D Hero Redesign — Photo-Accurate Bottle (v3), Acceptance criteria, Animation — NO auto-rotation (key change from v2), Body (LatheGeometry from a profile), Cap (flat, short, wide), Comparison vs v2 (what's different), Decision, Geometry — photo-accurate (+11 more)

### Community 29 - "Telegram Mini App (TMA) - Core API Reference"
Cohesion: 0.10
Nodes (19): BackButton, Best Practices, Data Passing, Data Validation (Backend), Event, Event Listener, Events, Initialization (+11 more)

### Community 30 - "web/src/pages/Home.jsx"
Cohesion: 0.17
Nodes (16): AnnouncementBar(), BlogTeaser(), resetScrollBus(), scrollBus, clamp01(), innerRise, innerStagger, TestimonialCascade() (+8 more)

### Community 31 - "3D Hero Design — Fairhaven Health Web"
Cohesion: 0.11
Nodes (18): 3D Hero Design — Fairhaven Health Web, Architecture, Context, CSS (`web/src/site.css`), Decision, Integration, Interactivity, Loading state (+10 more)

### Community 32 - "uploadController.js"
Cohesion: 0.15
Nodes (17): crypto, deleteUpload(), ensureDir(), fs, isValidImageSignature(), isValidVideoSignature(), listUploads(), MIME_EXT (+9 more)

### Community 33 - "webAuthController.js"
Cohesion: 0.08
Nodes (31): botUsername(), crypto, hashToken(), me(), publicUser(), { sendError }, {
  signSession,
  sessionCookieOptions,
  COOKIE_NAME,
}, start() (+23 more)

### Community 34 - "src/server.js"
Cohesion: 0.19
Nodes (12): billz, botOrders, checkInternalExposure(), checkUzumConfig(), config, db, express, logger (+4 more)

### Community 35 - "AdminApp.jsx"
Cohesion: 0.17
Nodes (13): listSettings(), stats(), upsertSetting(), whoami(), AdminApp(), MOBILE_NAV, NAV, AdminToast() (+5 more)

### Community 36 - "createBot"
Cohesion: 0.22
Nodes (14): createBot(), sendOpenShop(), sendStep(), shortOrderId(), T, {
  acceptConsent,
  applyVerifiedContact,
  escapeRegistrationName,
  syncRegistrationUser,
}, assert, test (+6 more)

### Community 37 - "adminRoutes.js"
Cohesion: 0.15
Nodes (15): apiLimiter, authLimiter, build(), { ipKeyGenerator }, limitReached(), rateLimit, IMPORTANT: these only work correctly when `app.set('trust proxy', ...)` is, uploadLimiter (+7 more)

### Community 38 - "logger.js"
Cohesion: 0.83
Nodes (3): emit(), maskValue(), redact()

### Community 39 - "orders.js"
Cohesion: 0.08
Nodes (36): addLine(), billz, config, createDraft(), ensurePricing(), formatBillzTime(), HTTP_CHANNEL, logger (+28 more)

### Community 40 - "uzumContract.test.js"
Cohesion: 0.14
Nodes (16): BillzProduct, api(), assert, crypto, fs, ORDER, os, path (+8 more)

### Community 41 - "dependencies"
Cohesion: 0.05
Nodes (38): @fontsource/prata, motion, puppeteer, react-router-dom, @react-three/drei, @react-three/fiber, @react-three/postprocessing, three (+30 more)

### Community 42 - "web/src/App.jsx"
Cohesion: 0.13
Nodes (13): About, Account, AdminPanel, App(), Blog, BlogPost, Checkout, Contact (+5 more)

### Community 43 - "Hero3D.jsx"
Cohesion: 0.17
Nodes (8): bottleSpec, labelCrop, motion, BODY_POINTS, BottleCap(), createCurvedLabelGeometry(), createRibbedCapGeometry(), PhotoLabel()

### Community 44 - "images.js"
Cohesion: 0.22
Nodes (12): cache, config, crypto, fs, hashFor(), hasUsableImage(), imagesFor(), logger (+4 more)

### Community 45 - "Collections.jsx"
Cohesion: 0.21
Nodes (14): createCollection(), deleteCollection(), deleteUpload(), fetchAllProductsAdmin(), listCollectionsAdmin(), listUploads(), updateCollectionAdmin(), ConfirmDialog() (+6 more)

### Community 46 - "index.jsx"
Cohesion: 0.16
Nodes (11): fetchOrder(), Check(), loadYmaps(), TASHKENT_CENTER, YandexMapPicker(), DICTS, I18nContext, I18nProvider() (+3 more)

### Community 47 - "dependencies"
Cohesion: 0.06
Nodes (32): dependencies, cookie-parser, cors, dotenv, express, express-rate-limit, jsonwebtoken, mongoose (+24 more)

### Community 48 - "billzBridge.js"
Cohesion: 0.26
Nodes (14): backoffFor(), buildLines(), claim(), disabledReason(), dispatchOne(), GOAL_BY_STATUS, Order, pendingFilter() (+6 more)

### Community 49 - "Scene3D.jsx"
Cohesion: 0.17
Nodes (10): clamp01(), FALLBACK_IMAGES, HeroArch(), makeArchTexture(), makeShadowTexture(), ORBS, pointer, ProductVitrine() (+2 more)

### Community 50 - "publicController.js"
Cohesion: 0.14
Nodes (11): Collection, getCollection(), getSettings(), listCollections(), PUBLIC_SETTING_KEYS, { sendError }, Setting, collectionSchema (+3 more)

### Community 51 - "oauth.js"
Cohesion: 0.24
Nodes (13): ChannelKey, config, crypto, { hashKey }, issueToken(), logger, mintToken(), oauthError() (+5 more)

### Community 52 - "internal.js"
Cohesion: 0.08
Nodes (22): config, path, config, crypto, logger, requireInternalToken(), tokensMatch(), botOrders (+14 more)

### Community 53 - "PromoCodes.jsx"
Cohesion: 0.26
Nodes (12): createPromo(), deletePromo(), listPromos(), togglePromo(), updatePromo(), discountLabel(), fmtDate(), fmtUZS() (+4 more)

### Community 54 - "siteContentController.js"
Cohesion: 0.18
Nodes (10): getPublic(), { sendError }, SiteContent, update(), mongoose, siteContentSchema, ctrl, express (+2 more)

### Community 55 - "webRoutes.js"
Cohesion: 0.15
Nodes (11): webAuth, { authLimiter, uploadLimiter }, express, router, siteContentCtrl, uploadCtrl, webAdminAuth, webAuth (+3 more)

### Community 56 - "uploadImage"
Cohesion: 0.28
Nodes (11): uploadImage(), beautify(), clamp(), curve(), ImageUpload(), loadImage(), beautify(), clamp() (+3 more)

### Community 57 - "Broadcast Pool with Bounded Parallelism (OPT-3)"
Cohesion: 0.20
Nodes (12): Billz Rate Limiter (1.5 req/s Shared), Blocked User: notificationsEnabled=false Handling, Broadcast Pool with Bounded Parallelism (OPT-3), broadcastjobs Collection (Broadcast Persistence), Context-aware Retry Configuration (OPT-4), Drop Pending Updates on Launch (OPT-2), express.json 6MB Global Limit (HIGH-2), Long Polling Transport (VPS Egress Throttled) (+4 more)

### Community 58 - "notify/telegram.js"
Cohesion: 0.26
Nodes (11): announceOrder(), call(), CHANNEL_LABELS, ChannelOrder, config, escapeHtml(), formatUZS(), isConfigured() (+3 more)

### Community 59 - "Fairhaven Health — API для Uzum Tezkor"
Cohesion: 0.17
Nodes (11): Fairhaven Health — API для Uzum Tezkor, Базовый адрес, Контакты, Ограничения частоты, Формат ошибок, Шаг 1. Получение токена, Шаг 2. Каталог, Шаг 3. Остатки (+3 more)

### Community 60 - "Fairhaven Security Hardening Design"
Cohesion: 0.17
Nodes (11): Application Architecture, Compatibility Rollout, Data Integrity And Privacy, Edge And Host, Fairhaven Security Hardening Design, Goal, Resource Authorization, Rollback (+3 more)

### Community 61 - "Modal.jsx"
Cohesion: 0.29
Nodes (9): demoteAdmin(), listAdmins(), promoteAdmin(), Modal(), Admins(), fmtDate(), applyTopHandler(), popBackButton() (+1 more)

### Community 62 - "scripts"
Cohesion: 0.17
Nodes (11): description, name, scripts, build:frontend, dev:backend, dev:frontend, install:all, render:build (+3 more)

### Community 63 - "bootstrap.js"
Cohesion: 0.28
Nodes (8): DEFAULT_SETTINGS, ensureAtLeastOneAdmin(), promoteAdminsFromEnv(), seedDefaultSettings(), Setting, User, autoSeed(), start()

### Community 64 - "withTelegramRetry"
Cohesion: 0.29
Nodes (9): assert, { launchBotWithRetry, withTelegramRetry }, test, isTransientTelegramError(), launchBotWithRetry(), RETRY_TIERS, retryDelay(), TRANSIENT_CODES (+1 more)

### Community 65 - "webhookIntegration.test.js"
Cohesion: 0.18
Nodes (8): assert, BOT_INFO, express, http, SECRET, { Telegraf }, test, UPDATE

### Community 66 - "Products.jsx"
Cohesion: 0.31
Nodes (10): createProduct(), deleteProduct(), listProductsAdmin(), toggleProduct(), updateProduct(), CATEGORIES, catLabel(), fmtPrice() (+2 more)

### Community 67 - "Customers.jsx"
Cohesion: 0.33
Nodes (9): getUserDetail(), listUsers(), CustomerDetailModal(), Customers(), FILTERS, fmtDate(), fmtPrice(), genderLabel() (+1 more)

### Community 68 - "admin/pages/Orders.jsx"
Cohesion: 0.35
Nodes (10): listOrders(), revertOrder(), updateOrderStatus(), BUCKETS, fmtDate(), fmtPrice(), OrderDetailModal(), Orders() (+2 more)

### Community 69 - "userController.js"
Cohesion: 0.27
Nodes (9): addAddress(), getByTelegramId(), getOrCreate(), normalizeProfileName(), pick(), removeAddress(), { sendError }, update() (+1 more)

### Community 70 - "rateLimit.test.js"
Cohesion: 0.22
Nodes (6): LIMITS, app, assert, test, assert, test

### Community 71 - "3D Hero Photo-Accurate Bottle (v3) Implementation Plan"
Cohesion: 0.20
Nodes (9): 3D Hero Photo-Accurate Bottle (v3) Implementation Plan, Execution Handoff, File Structure, Self-Review (run after writing, before execution), Task 1: Lathe body geometry + opaque white plastic, Task 2: Central white label sleeve + black wordmark (both sides), Task 3: Mouse tilt + scroll parallax (no auto-rotation), Task 4: Subtle post-processing (Bloom + Vignette) (+1 more)

### Community 72 - "handleWebLoginPayload"
Cohesion: 0.40
Nodes (6): claimWebLoginToken(), finishPendingWebLogin(), handleWebLoginPayload(), hashWebToken(), webLoginExpiredText(), webLoginSuccessText()

### Community 73 - "billzBridge.test.js"
Cohesion: 0.22
Nodes (5): assert, http, hubCalls, mongoose, test

### Community 74 - "frontend/package.json"
Cohesion: 0.09
Nodes (22): dependencies, react, react-dom, devDependencies, @types/react, @types/react-dom, vite, @vitejs/plugin-react (+14 more)

### Community 75 - "statuses.js"
Cohesion: 0.40
Nodes (4): actionFor(), KNOWN_STATUSES, OURS_TO_THEIRS, THEIRS_TO_ACTION

### Community 76 - "mirrorMapping.test.js"
Cohesion: 0.40
Nodes (3): assert, test, { toMirrorFields }

### Community 77 - "Account.jsx"
Cohesion: 0.31
Nodes (7): fetchMyOrders(), useAuth(), Account(), LoginPanel(), OrdersList(), stageFade, STATUS_KEYS

### Community 78 - "dev-admin.js"
Cohesion: 0.32
Nodes (7): crypto, DIST, fs, injectStub(), main(), path, signInitData()

### Community 79 - "seed.js"
Cohesion: 0.29
Nodes (4): FAIRHAVEN_PRODUCTS, { FAIRHAVEN_PRODUCTS }, mongoose, Product

### Community 80 - "channel/package.json"
Cohesion: 0.09
Nodes (21): dependencies, dotenv, express, express-rate-limit, mongoose, description, engines, node (+13 more)

### Community 81 - "Fairhaven Security Hardening Implementation Plan"
Cohesion: 0.25
Nodes (7): Fairhaven Security Hardening Implementation Plan, Task 1: Signed Telegram Identity, Task 2: Route Authorization And Privacy, Task 3: Order Integrity And Input Hardening, Task 4: Dependencies And Build, Task 5: Reversible Edge And Host Hardening, Task 6: Production Deploy And Verification

### Community 83 - "pool.test.js"
Cohesion: 0.33
Nodes (4): assert, { mapWithConcurrency }, test, mapWithConcurrency()

### Community 84 - "webhook.test.js"
Cohesion: 0.29
Nodes (4): assert, GOOD_SECRET, test, webhook

### Community 85 - "formatOrderReceipt"
Cohesion: 0.52
Nodes (6): escapeHtml(), formatOrderReceipt(), formatUZS(), googleMapsLink(), paymentLabel(), yandexMapsLink()

### Community 87 - "catalogPaging.test.js"
Cohesion: 0.29
Nodes (4): assert, billz, { fetchAllProducts }, test

### Community 88 - "orders.test.js"
Cohesion: 0.29
Nodes (3): assert, mongoose, test

### Community 89 - "Simple Registration Design"
Cohesion: 0.29
Nodes (6): Bot Flow, Compatibility, Goal, Profile Name Editing, Simple Registration Design, Testing

### Community 90 - "forwardOrderToChannel"
Cohesion: 0.33
Nodes (5): buildChannelKeyboard(), forwardOrderToChannel(), assert, { forwardOrderToChannel }, test

### Community 92 - "broadcastNotification.test.js"
Cohesion: 0.40
Nodes (5): assert, PRODUCT, stubModule(), test, withStubbedBot()

### Community 94 - "Simple Registration Implementation Plan"
Cohesion: 0.33
Nodes (5): Simple Registration Implementation Plan, Task 1: Simple Bot Registration, Task 2: Secure Profile Name Update, Task 3: Profile Name Editor, Task 4: Production Deploy And Verification

### Community 98 - "productIndexes.test.js"
Cohesion: 0.40
Nodes (4): assert, base, mongoose, test

### Community 100 - "internalAuth.test.js"
Cohesion: 0.40
Nodes (3): assert, crypto, test

### Community 101 - "bottleLabels.js"
Cohesion: 0.60
Nodes (4): LABEL_SPECS, makeLabelTexture(), roundRect(), wrapLines()

### Community 105 - "defineModel (Collection Allow-list Enforcement)"
Cohesion: 0.67
Nodes (3): src/db.js (Dedicated Mongoose Connection), defineModel (Collection Allow-list Enforcement), tests/safety.test.js

### Community 106 - "Content Security Policy with frame-ancestors (MEDIUM-1)"
Cohesion: 1.00
Nodes (3): Content Security Policy with frame-ancestors (MEDIUM-1), Telegram Web iframe (web.telegram.org), X-Frame-Options: SAMEORIGIN (Blocks Telegram Web)

### Community 107 - "Threaded Mode: Forum Topics for Channel Separation"
Cohesion: 0.67
Nodes (3): editMessageText (In-place Order Card Update), Setting Model (TOPIC_IDS Storage), Threaded Mode: Forum Topics for Channel Separation

## Knowledge Gaps
- **745 isolated node(s):** `crypto`, `{ Telegraf, Markup }`, `User`, `Order`, `WebLoginToken` (+740 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createBot()` connect `createBot` to `withTelegramRetry`, `botOrders.js`, `handleWebLoginPayload`, `backend/server.js`, `bot.js`, `formatOrderReceipt`, `forwardOrderToChannel`, `http.js`, `bootstrap.js`?**
  _High betweenness centrality (0.098) - this node is a cross-community bridge._
- **Why does `order()` connect `botOrders.js` to `createBot`, `uzum/serializers.js`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **Why does `errorLabel()` connect `http.js` to `createBot`, `sendError`, `backend/server.js`, `orderController.js`, `bot.js`, `forwardOrderToChannel`, `bootstrap.js`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `createBot()` (e.g. with `bot.js` and `order()`) actually correct?**
  _`createBot()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `crypto`, `{ Telegraf, Markup }`, `User` to the rest of the system?**
  _745 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `frontend/src/App.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05113468906572355 - nodes in this community are weakly interconnected._
- **Should `db.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05639097744360902 - nodes in this community are weakly interconnected._