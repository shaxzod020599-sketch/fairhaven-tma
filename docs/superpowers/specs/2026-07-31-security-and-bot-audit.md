# Xavfsizlik va bot optimizatsiyasi — audit

Sana: 2026-07-31
Qamrov: `backend/`, `frontend/src/`, Telegram bot, Mini App
Bog'liq: [Billz kanal integratsiyasi dizayni](2026-07-31-billz-channel-hub-design.md)

---

## 0. Xulosa

Auth qatlami kutilganidan kuchli — `validateTelegramInitData` to'g'ri yozilgan (HMAC-SHA256,
`timingSafeEqual`, `auth_date` yangiligi, uzunlik chegarasi). Rasm yuklash magic-bayt
tekshiruvi bilan himoyalangan. Bular tegilmaydi.

Asosiy bo'shliqlar boshqa joyda: **rate limiting umuman yo'q**, **CSP yo'q**, bot
**long polling** da ishlaydi (VPS uchun noto'g'ri transport), va bir nechta sinxron
fs/DB chaqiruvlari event loop'ni bloklaydi.

Jiddiylik bo'yicha: 3 ta HIGH, 6 ta MEDIUM, 5 ta LOW + 8 ta optimizatsiya.

---

## 1. Xavfsizlik

### HIGH-1 · Rate limiting umuman yo'q

`backend/` da `express-rate-limit`, `helmet` yoki boshqa cheklovchi yo'q. Tekshirildi:
qidiruv `rateLimit|express-rate|helmet` bo'yicha hech narsa topilmadi.

Ta'sir:

- `/api/admin/*` — admin aniqlash `initData` orqali, lekin cheksiz urinish mumkin.
- `/api/admin/uploads` — 4 MB rasm, cheksiz marta → disk to'ldirish.
- `/api/web/*` — sayt login va guest checkout.
- Yangi kanal API'si — Medicalka/Uzum kalitini bilgan har kim cheksiz so'rov yubora oladi.

nginx darajasida `fairhaven.uz/api` cheklangan (oldingi ishdan), lekin
`mini.fairhaven.uz` uchun tasdiqlanmagan — VPS'da tekshirish kerak.

**Tuzatish:** `express-rate-limit` qo'shish, uch qatlam:

| Qatlam | Limit |
|---|---|
| Global `/api` | 300 so'rov / 5 daqiqa / IP |
| Auth va admin (`/api/admin`, `/api/web/auth`) | 30 / 5 daqiqa / IP |
| Yuklash (`/api/admin/uploads`) | 20 / soat / admin |
| Kanal API (yangi servis) | kanal kaliti bo'yicha, 60 / daqiqa |

`trust proxy` ni to'g'ri sozlash shart, aks holda hamma IP nginx'niki bo'lib ko'rinadi.

---

### HIGH-2 · `express.json({ limit: '6mb' })` global qo'llanilgan

`backend/server.js:45` — barcha marshrutlarda 6 MB JSON tanasi qabul qilinadi. Faqat
rasm yuklash (`dataUrl`) shuncha joy talab qiladi.

Ta'sir: autentifikatsiyadan oldin ishlaydigan har qanday `POST` 6 MB parsing'ga majbur
qiladi. Bir nechta parallel so'rov CPU va xotirani yeydi.

**Tuzatish:**

```js
app.use(express.json({ limit: '100kb' }));                       // global
// upload marshrutida alohida:
router.post('/uploads', express.json({ limit: '6mb' }), upload.uploadImage);
```

---

### HIGH-3 · `mongodb-memory-server` — production bog'liqligi

`backend/package.json:17` — `dependencies` ichida (`devDependencies` emas).

Ikki xavf:

1. `npm ci --omit=dev` ishlatilmasa, prod serverga ~200 MB va MongoDB binary tushadi.
2. `ALLOW_IN_MEMORY_DB=true` bo'lsa va Mongo bir lahzaga javob bermasa
   (`server.js:157`), server **bo'sh vaqtinchalik bazada** ko'tariladi. Keyin
   `autoSeed()` ishga tushadi va katalogni seed ma'lumot bilan to'ldiradi
   (`server.js:141`). Bot esa bo'sh bazadagi mahsulotlarni ko'rsatadi.

**Tuzatish:** `devDependencies` ga ko'chirish; `ALLOW_IN_MEMORY_DB` prod `.env` da
umuman bo'lmasligi; `autoSeed()` ni `NODE_ENV !== 'production'` sharti bilan o'rash.

Billz integratsiyasidan keyin `autoSeed` butunlay olib tashlanadi — mahsulot faqat
Billz'dan qo'shiladi.

---

### MEDIUM-1 · CSP yo'q va `X-Frame-Options` Telegram Web'ni buzadi

`backend/utils/http.js:6-13` — `nosniff`, `X-Frame-Options: SAMEORIGIN`,
`Referrer-Policy`, `Permissions-Policy`, `CORP` bor. **`Content-Security-Policy` yo'q.**

Ikkinchi muammo: Telegram Web (brauzerdagi `web.telegram.org`) Mini App'ni **iframe**
ichida ochadi. `X-Frame-Options: SAMEORIGIN` uni bloklaydi. Telegram Desktop va mobil
ilovalarda native webview ishlatilgani uchun muammo ko'rinmaydi — shuning uchun hozirgacha
sezilmagan.

`X-Frame-Options` da allow-list yo'q (`ALLOW-FROM` o'lgan). Yechim — CSP `frame-ancestors`.

**Tuzatish:**

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' https://telegram.org;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self';
  frame-ancestors https://web.telegram.org https://telegram.org;
  base-uri 'self';
  object-src 'none'
```

`X-Frame-Options` olib tashlanadi (CSP `frame-ancestors` uni almashtiradi).
`script-src` da `https://telegram.org` — `telegram-web-app.js` shundan yuklanadi.

---

### MEDIUM-2 · Admin amallari uchun audit jurnali yo'q

`adminAuth` = Telegram imzosi + `role === 'admin'`. Kim qachon narxni o'zgartirgani,
mahsulot o'chirgani, admin qo'shgani hech qayerda yozilmaydi.

Kanal narxlari qo'shilgach bu jiddiyroq bo'ladi — noto'g'ri narx to'g'ridan-to'g'ri
Medicalka va Uzumga chiqadi.

**Tuzatish:** `auditlogs` kolleksiyasi — `{ adminTelegramId, action, entity, entityId,
before, after, ip, at }`. Yozuvchi marshrutlar uchun umumiy middleware.

---

### MEDIUM-3 · `listUploads` sinxron fs chaqiruvlari

`backend/controllers/uploadController.js:88-94` — `readdirSync` + har fayl uchun
`statSync`. 500 ta rasmda bu ~500 ta bloklovchi syscall, event loop to'xtaydi va
**butun bot ham** shu vaqtda javob bermaydi (bir process).

**Tuzatish:** `fs.promises.readdir(dir, { withFileTypes: true })` + `Promise.all` bilan
`stat`, yoki sahifalash.

---

### MEDIUM-4 · Yuklangan fayllar cheksiz o'sadi

`/uploads` da hech qanday tozalash yo'q. O'chirilgan mahsulotning rasmlari qoladi.
Video 100 MB gacha (`uploadController.js:121`).

**Tuzatish:** disk kvotasi monitoringi + bog'lanmagan fayllarni topuvchi vaqtli ish.

---

### MEDIUM-5 · CORS bitta origin bilan cheklangan

`server.js:33` — `CORS_ORIGIN = FRONTEND_URL`. Sayt (`fairhaven.uz`) va mini app
(`mini.fairhaven.uz`) — ikki xil origin. Hozir ishlayotgani nginx ikkalasini bir
originga proksilayotganini bildiradi, lekin bu yozib qo'yilmagan.

**Tuzatish:** ruxsat etilgan originlar ro'yxati (massiv) + aniq izoh. Kanal API'sida
CORS umuman **o'chiriladi** (server-to-server, brauzer emas).

---

### MEDIUM-6 · Har so'rovda sinxron `console.log`

`server.js:48-51` — har so'rovda `console.log`. pm2 buni faylga yozadi; stdout yozuvi
sinxron. Yuk ostida bu sezilarli.

**Tuzatish:** `pino` + async transport, yoki prod'da faqat xatolarni loglash.
Kanal servisida `pino` boshidan.

---

### LOW

| # | Topilma | Joy |
|---|---|---|
| L-1 | `X-Powered-By` o'chirilgan ✅, lekin `Server` sarlavhasi nginx'dan chiqadi | nginx |
| L-2 | Xato javoblari umumiy (`internal_error`) ✅ — ma'lumot sizmaydi | `utils/http.js:1` |
| L-3 | `redactPath` faqat 24-belgili hex va 5+ raqamni maskalaydi; token'lar query'da bo'lsa loglanadi | `utils/http.js:15` |
| L-4 | Dev fallback `getTelegramUser()` `{id: 0}` qaytaradi — backend rad etadi ✅, lekin UI chalkash holatga tushadi | `frontend/src/utils/telegram.js:26` |
| L-5 | `.env` da PRODUCTION bot tokeni turibdi — lokal ishga tushirish jonli botdan polling'ni o'g'irlaydi | ma'lum muammo |

**L-5 webhook'ga o'tilgandan keyin o'z-o'zidan yo'qoladi** (pastga qarang).

---

## 2. Bot optimizatsiyasi

### OPT-1 · Long polling → webhook (eng katta yutuq)

`server.js:185` → `launchBotWithRetry(bot, ...)` → `bot.launch()` = long polling.

`utils/telegramRetry.js:26` dagi izoh muammoni aniq ta'riflaydi:

> VPS egress to api.telegram.org is throttled (~60% failure rate per call from UZ networks)

Long polling'da bot **doim** `api.telegram.org` ga chiqishi kerak. Aynan shu yo'nalish
sekin. Webhook'da yo'nalish teskari — Telegram bizga keladi.

Foydasi:

- Chiquvchi `getUpdates` butunlay yo'qoladi → asosiy sekinlik manbai yo'q.
- `409 Conflict` sinfidagi xatolar yo'qoladi (`telegramRetry.js:56`).
- Lokal ishga tushirish jonli botni buzolmaydi (L-5 hal bo'ladi).
- Javob kechikishi sezilarli kamayadi.

Talab: TLS'li domen — allaqachon bor (`mini.fairhaven.uz`, Let's Encrypt).

```js
// server.js
const secretPath = `/tg/${process.env.TELEGRAM_WEBHOOK_SECRET}`;
app.use(await bot.createWebhook({
  domain: process.env.TELEGRAM_WEBHOOK_DOMAIN,   // mini.fairhaven.uz
  path: secretPath,
  secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
  drop_pending_updates: true,
}));
```

`secret_token` Telegram tomonidan `X-Telegram-Bot-Api-Secret-Token` sarlavhasida
qaytariladi — Telegraf uni o'zi tekshiradi. nginx'da `/tg/` marshruti `:3000` ga
proksilanadi va rate limitdan chiqariladi.

Polling'ga qaytish imkoni saqlanadi: `TELEGRAM_USE_WEBHOOK=false` bo'lsa eski yo'l.

---

### OPT-2 · Ishga tushishda eski update'lar qayta ishlanadi

`bot.launch()` `dropPendingUpdates` siz chaqiriladi. Server bir soat o'chib turgan bo'lsa,
ko'tarilganda soatlik navbat qayta ishlanadi — foydalanuvchilar eski javoblarni oladi.

**Tuzatish:** webhook'da `drop_pending_updates: true` (yuqorida), polling'da
`bot.launch({ dropPendingUpdates: true })`.

---

### OPT-3 · Broadcast bo'lak + uyqu modeli

`bot/bot.js:453-500` — 25 talik bo'lak, orasida 1 sekund uyqu.

Muammo: bo'lak ichidagi har xabar `withTelegramRetry` bilan **5 marta** qayta uriniladi,
kechikishlar `[500, 1500, 3500, 7500, 15000]` — eng yomon holatda **28 sekund**.
`Promise.allSettled` butun bo'lakni kutadi. Ya'ni bitta yomon qabul qiluvchi 25 tasini
28 sekundga to'xtatadi.

10 000 foydalanuvchi = 400 bo'lak. Eng yaxshi holatda ~7 daqiqa, yomon holatda soatlar.

**Tuzatish:**

1. Bo'lak+uyqu o'rniga **chegaralangan parallellik pool** (25 ta parallel ish, biri
   tugashi bilan keyingisi boshlanadi) — 25 msg/s tezlik saqlanadi, lekin turg'unlik yo'q.
2. Broadcast uchun qayta urinish **2 taga** cheklanadi (`delays: [500, 1500]`).
   Zakaz kabi kritik chaqiruvlarda 5 ta qoladi.
3. Broadcast holati bazada saqlanadi (`broadcastjobs`) — server qayta ishga tushsa
   qayerdan to'xtaganidan davom etadi.
4. `403 Forbidden: bot was blocked by the user` → foydalanuvchida
   `notificationsEnabled = false` qilib belgilash. Hozir har broadcast'da bloklaganlarga
   ham urinilaveradi.

---

### OPT-4 · `withTelegramRetry` konteksga qarab sozlanmagan

Bitta funksiya hamma joyda 5 ta urinish bilan ishlatiladi. Kontekstlar farq qiladi:

| Kontekst | Urinish | Sabab |
|---|---|---|
| Zakaz kanalga yuborish | 5 | yo'qotib bo'lmaydi |
| Mijozga status xabari | 3 | muhim, lekin kritik emas |
| Broadcast | 2 | ommaviy, yo'qotish arzon |
| Kartochkani tahrirlash | 2 | keyingi tahrir tuzatadi |

---

### OPT-5 · `listProducts` sahifalashsiz

`controllers/adminController.js:listProducts` — butun katalog, `.lean()` yo'q,
`$regex` indekssiz. Admin panel «qotib qolishi»ning asosiy sababi.

Dizayn hujjatida batafsil (§4.6).

---

### OPT-6 · Mongo indekslari

Hozir: `name` (index), `category` (index), `isAvailable` (index), text index
`{name, description, brand}`.

Yetishmaydi: `sku`, `barcode` — Billz bog'lash skripti aynan shular bo'yicha qidiradi,
28 mahsulotda sezilmaydi, 2000 da sezilади.

---

### OPT-7 · Bot va HTTP bitta processda

Har qanday bloklovchi operatsiya (masalan MEDIUM-3 dagi `statSync`) botni ham
to'xtatadi. Kanal servisi allaqachon ajratilmoqda; keyingi qadamda bot ham alohida
processga chiqarilishi mumkin.

Hozircha ustuvor emas — webhook'ga o'tish yukni sezilarli kamaytiradi.

---

### OPT-8 · Frontend bog'liqliklari minimal ✅

`frontend` da faqat `react` + `react-dom`. Bundle kichik. O'zgartirish shart emas.

---

## 3. «Threaded mode» haqida

Talab: *bot har safar yangi xabar yubormasin*.

Telegram'da «Threaded mode» = supergruppada **Topics (forum)** rejimi. U xabarlarni
mavzular bo'yicha guruhlaydi, lekin **yangi xabar yuborilishini to'xtatmaydi**.

Yangi xabar muammosining haqiqiy yechimi — **mavjud xabarni tahrirlash**. Bu kodda
allaqachon bor: `bot/bot.js:527` `markOrderCancelledByCustomer` `editMessageText`
ishlatadi va tugmalarni olib tashlaydi.

Ikkalasi birga eng yaxshi natija beradi:

| Vazifa | Vosita |
|---|---|
| Zakaz statusi o'zgardi | `editMessageText` — kartochka joyida yangilanadi |
| Kanallarni ajratish | Topics: «🤖 Bot», «🏥 Medicalka», «🟣 Uzum», «⚠️ Xatolar» |

Topic'ga yuborish:

```js
bot.telegram.sendMessage(ORDERS_CHANNEL_ID, text, {
  message_thread_id: TOPIC_IDS[channel],
  parse_mode: 'HTML',
});
```

`TOPIC_IDS` — admin panel sozlamalarida (`Setting` modeli) saqlanadi, kodda emas.
Guruh forum rejimida bo'lmasa `message_thread_id` e'tiborsiz qoldiriladi — xavfsiz.

Agar «Threaded mode» boshqa narsani (masalan Claude Code sozlamasini) anglatgan bo'lsa —
ayting, botga aloqasi yo'q.

---

## 4. Mini App — yangilash imkoniyatlari

Hozirgi holat (`frontend/src/utils/telegram.js`): `ready`, `expand`,
`disableVerticalSwipes` (7.7), `setHeaderColor`, `setBackgroundColor`, `MainButton`,
`BackButton` (stack bilan — yaxshi yozilgan), `HapticFeedback`, `showAlert`, `showConfirm`.

### Muhim: versiya tekshiruvi yo'q

`initTelegram()` `tg.disableVerticalSwipes()` ni shartsiz chaqiradi. Bot API 7.7 dan
eski klientda bu ishlamaydi va konsolga ogohlantirish chiqaradi.

**Tuzatish:** `tg.isVersionAtLeast('7.7')` bilan o'rash. Bir marta yoziladigan kichik
yordamchi:

```js
const atLeast = (v) => Boolean(tg?.isVersionAtLeast?.(v));
if (atLeast('7.7')) tg.disableVerticalSwipes();
```

### Qo'shishga arziydiganlar

| API | Versiya | Nima beradi |
|---|---|---|
| `safeAreaInset` / `contentSafeAreaInset` | 8.0 | `index.css` da notch uchun qo'lda yozilgan tuzatishlar bor (`index.css:109`, `:162`, `:725`, `:2051`). 8.0 haqiqiy qiymatlarni beradi — taxminlar o'rniga CSS o'zgaruvchilariga ulanadi |
| `CloudStorage` | 6.9 | Savatni qurilmalar orasida saqlash (1024 element) |
| `SecondaryButton` | 7.10 | «Xaridni davom ettirish» + «Rasmiylashtirish» yonma-yon |
| `hideKeyboard()` | 9.1 | Qidiruvdan keyin klaviaturani yopish |
| `MainButton.hasShineEffect` | 7.10 | Rasmiylashtirish tugmasiga urg'u |

`safeAreaInset` eng foydali — CSS'dagi qo'lda yozilgan taxminlar aynan shuning yo'qligi
sababli paydo bo'lgan.

### Ehtiyot bo'lish kerak

- `MainButton` 7.10 da `BottomButton` deb qayta nomlandi; `MainButton` alias sifatida
  ishlayveradi — o'zgartirish shart emas.
- `DeviceStorage` / `SecureStorage` (9.0) hozircha kerak emas.
- `requestFullscreen` (8.0) do'kon uchun mos emas.

---

## 5. Bajarish tartibi

Xavfsizlik va bot ishlari Billz bosqichlariga parallel ketadi.

| Navbat | Ish | Kuch |
|---|---|---|
| 1 | HIGH-2 body limit, HIGH-3 `mongodb-memory-server` + `autoSeed` | kichik |
| 2 | HIGH-1 rate limiting (3 qatlam) | o'rta |
| 3 | OPT-1 webhook'ga o'tish | o'rta |
| 4 | MEDIUM-1 CSP + `frame-ancestors` (Telegram Web tuzaladi) | kichik |
| 5 | OPT-5 `listProducts` sahifalash + OPT-6 indekslar | kichik |
| 6 | OPT-3 broadcast pool + bloklaganlarni belgilash | o'rta |
| 7 | MEDIUM-2 audit jurnali (kanal narxlari bilan birga) | o'rta |
| 8 | MEDIUM-3 async fs, MEDIUM-6 `pino` | kichik |
| 9 | Mini App: versiya tekshiruvi + `safeAreaInset` | o'rta |

1, 4, 5 — bir necha soatlik ish va darhol foyda beradi. 3 (webhook) — eng katta
sifat sakrashi.
