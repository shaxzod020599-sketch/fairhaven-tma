# Deploy va ishga tushirish

Fairhaven Health UZ — bot, mini app, sayt, `channel-hub` (Billz mirror + kanallar).

VPS: `95.182.119.86`, foydalanuvchi `movixa-bridge2`, repo `~/fairhaven-tma`.

---

## 0. Oldindan bajarilishi shart

| # | Ish | Kim |
|---|---|---|
| 1 | **Billz secret tokenini almashtirish** — eskisi chatga ochiq ketgan | Mijoz |
| 2 | **VPS parolini almashtirish**, iloji bo'lsa SSH kalitga o'tish | Mijoz |
| 3 | Billz UI'da integratsiya kalitiga **zakaz/sotuv metodlariga ruxsat** (hozir `403`) | Mijoz / Billz |
| 4 | Kanal sotuvlari uchun `company_payment_type_id` | Mijoz / Billz |
| 5 | `api.fairhaven.uz` subdomeni + TLS — **faqat Medicalka/Uzum uchun**, panel va mirror usiz ham ishlaydi | Biz |

3 va 4 bo'lmasa: mirror, panel, Medicalka o'qish API'si ishlaydi; **sotuv yozish ishlamaydi**.

---

## 1. Kodni yetkazish

GitHub tokeni o'lgan (2026-07-03), shuning uchun `git bundle` orqali:

```bash
cd "/Users/tm/Projects/project vitamin delivery" && git bundle create /tmp/fh.bundle feat/billz-channel-hub
```

```bash
scp /tmp/fh.bundle movixa-bridge2@95.182.119.86:/tmp/
```

Serverda — **avval zaxira**:

```bash
cd ~/fairhaven-tma && git branch backup-$(date +%Y%m%d-%H%M) && mongodump --db fairhaven --out ~/backups/mongo-$(date +%Y%m%d-%H%M)
```

```bash
cd ~/fairhaven-tma && git fetch /tmp/fh.bundle feat/billz-channel-hub:feat/billz-channel-hub && git checkout feat/billz-channel-hub
```

---

## 2. Backend

```bash
cd ~/fairhaven-tma/backend && npm ci --omit=dev
```

`.env` ga qo'shiladi (`backend/.env.example` ga qarang) — **hammasi o'chirilgan holatda**:

```
STOCK_RECONCILE_ENABLED=false
TELEGRAM_USE_WEBHOOK=false
CHANNEL_HUB_URL=http://127.0.0.1:3100
CHANNEL_INTERNAL_TOKEN=<pastda generatsiya qilinadi>
```

Frontend build:

```bash
cd ~/fairhaven-tma/frontend && npm ci && npm run build
```

```bash
pm2 restart fairhaven && pm2 logs fairhaven --lines 40 --nostream
```

**Tekshirish:** panelda «Каналы» sahifasi ochilishi kerak. Hamma mahsulot «Нет в Billz» deb ko'rinadi — bu normal, mirror hali bo'sh.

Bu bosqichda **do'kon xatti-harakati o'zgarmaydi**: reconciler o'chirilgan, webhook o'chirilgan.

---

## 3. channel-hub

Ichki token — backend va channel-hub uchun **bir xil qiymat**:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

```bash
cd ~/fairhaven-tma/channel && npm ci && cp .env.example .env && chmod 600 .env
```

`.env` ga: `BILLZ_SECRET_TOKEN` (**yangisi**), `BILLZ_SHOP_ID=d25689cf-cefa-470e-9a54-6b2f9ea0fb0f`, `BILLZ_CASHBOX_ID=9238c93c-1506-451f-9ff5-a548bb135030`, `MONGO_URI`, `CHANNEL_INTERNAL_TOKEN`.

To'lov turi `.env.example` da to'ldirilgan — barcha kanal sotuvlari
«Баланс поставщика» ga yoziladi:

```
BILLZ_PAYMENT_TYPE_ID=42bb647e-9533-4104-a018-8fd79e8387b3
BILLZ_PAYMENT_TYPE_NAME=Баланс поставщика
```

`BILLZ_WRITE_ENABLED=false` — **shunday qoldiring**.

Avval quruq yurish:

```bash
cd ~/fairhaven-tma/channel && node scripts/sync-once.js --dry-run
```

28 ta mahsulot ko'rinsa, yozamiz:

```bash
cd ~/fairhaven-tma/channel && node scripts/sync-once.js --force
```

`--force` faqat **birinchi to'ldirishda** — kamayish qo'riqchisi bo'sh mirror'ni «katalog qisqardi» deb hisoblamasligi uchun.

```bash
cd ~/fairhaven-tma/channel && pm2 start src/server.js --name channel-hub && pm2 save
```

**Tekshirish:**

```bash
curl -s http://127.0.0.1:3100/health/detail
```

### Kanal sotuvlari tarixini tayyorlash

Yangi analitika `soldAt` vaqtini ishlatadi. Eski sotilgan Medicalka/Uzum
buyurtmalarini faqat hisobotdan keyin to'ldiring:

```bash
cd ~/fairhaven-tma/channel && node scripts/backfill-channel-sold-at.js
```

Natijadagi `eligible` sonini kanal buyurtmalari bilan solishtiring. Mos bo'lsa:

```bash
cd ~/fairhaven-tma/channel && node scripts/backfill-channel-sold-at.js --apply
```

`applied` soni `eligible` bilan teng bo'lishi shart. Shu tekshiruv tugamaguncha
admin paneldagi kanal sotuvlari analitikasini ishlab chiqarish hisobotiga
tayyor deb hisoblamang.

---

### Eski indeksni tozalash

Agar avvalgi versiya bir marta ishga tushgan bo'lsa, `products` da endi keraksiz
`billzProductId_1` indeksi qolgan bo'lishi mumkin. Zarar qilmaydi, lekin yozishga
ortiqcha yuk. Tekshirish va olib tashlash:

```bash
mongosh fairhaven --eval 'db.products.getIndexes().map(i=>i.name)'
```

```bash
mongosh fairhaven --eval 'db.products.dropIndex("billzProductId_1")'
```

Kerakli indeks — `billzProductId_unique`. U bir Billz mahsuloti ikkita kartaga
bog'lanishini bazada to'sadi.

---

## 4. Mahsulotlarni Billz'ga bog'lash

```bash
cd ~/fairhaven-tma/backend && node scripts/link-billz.js
```

Hisobot uch bo'limga bo'linadi:

- **CONFIDENT** — shtrix-kod, artikul yoki ishonchli nom bo'yicha. Yoziladi.
- **AMBIGUOUS** — ikki Billz yozuvi teng darajada mos (odatda bir mahsulotning ikki qadog'i). **Yozilmaydi** — panelda qo'lda tanlaysiz.
- **NO MATCH** — Billz'da o'xshashi yo'q. Bu normal: test poloskalari, emizish aksessuarlari Billz'da yuritilmaydi.

Ro'yxatni ko'rib chiqing, keyin:

```bash
cd ~/fairhaven-tma/backend && node scripts/link-billz.js --apply
```

Qolganini panelda: «Каналы» → «Без Billz» filtri → har kartada «Связать?».

---

## 5. Ostatok avtomatikasi

⚠️ Bu do'kondagi ko'rinishni o'zgartiradi. **Avval hisobot:**

```bash
cd ~/fairhaven-tma/backend && node scripts/reconcile-stock.js
```

Diqqat bilan qarang:

- **`no_image`** — rasmsiz tovarlar yashiriladi. Bu qoida qo'lda «bor» deyilgan bo'lsa ham ishlaydi. Ro'yxat kutilganidan uzun bo'lsa — to'xtang, avval rasm qo'shing.
- **`gone_from_billz`** — Billz'ga bog'langan, lekin Billz'da yo'q. Bog'lash noto'g'ri bo'lsa ham shu chiqadi.
- **`not_linked`** va **`manual_override`** — tegilmaydi.

Ma'qul bo'lsa:

```bash
cd ~/fairhaven-tma/backend && node scripts/reconcile-stock.js --apply
```

Keyin `.env` da `STOCK_RECONCILE_ENABLED=true` va `pm2 restart fairhaven`.

**Orqaga qaytarish:** `.env` da `false`, `pm2 restart`. O'zgargan `isAvailable` qiymatlari qoladi — kerak bo'lsa mongodump'dan tiklanadi.

---

## 6. Telegram webhook

Faqat 2–5 barqaror ishlagandan keyin.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

`backend/.env`:

```
TELEGRAM_USE_WEBHOOK=true
TELEGRAM_WEBHOOK_DOMAIN=mini.fairhaven.uz
TELEGRAM_WEBHOOK_SECRET=<yuqoridagi qiymat>
```

nginx'da `mini.fairhaven.uz` uchun `/tg/` yo'li `:3000` ga proksilanishi kerak (odatda mavjud `location /` buni allaqachon qamrab oladi).

```bash
pm2 restart fairhaven && pm2 logs fairhaven --lines 30 --nostream | grep -i webhook
```

`🤖 Telegram webhook active at ...` chiqishi kerak. Botga `/start` yozib tekshiring.

**Orqaga qaytarish:** `TELEGRAM_USE_WEBHOOK=false`, `pm2 restart`. Kod webhook'ni o'zi o'chiradi va polling'ga qaytadi.

Webhook o'rnatilmasa kod **o'zi polling'ga tushadi** — bot o'lik qolmaydi.

---

## 7. Kanal kalitlari

`api.fairhaven.uz` tayyor bo'lgandan keyin.

**Odatiy yo'l — admin panel:** «Каналы продаж» → «Доступ и ИКПУ». Kalit
tugma bilan chiqariladi va **bir marta** ko'rsatiladi. SSH shart emas, shuning
uchun sizib ketgan kalitni darhol bekor qilish mumkin — bu qulaylik emas,
xavfsizlik.

Terminal muqobili:

```bash
cd ~/fairhaven-tma/channel && node scripts/issue-key.js medicalka token --label "Medicalka prod"
```

```bash
cd ~/fairhaven-tma/channel && node scripts/issue-key.js uzum oauth --label "Uzum Tezkor prod"
```

Bazada faqat SHA-256 saqlanadi. Yo'qolsa — qayta chiqariladi, tiklab bo'lmaydi.

| Kanal | Kalit turi | Nima uchun |
|---|---|---|
| medicalka | `token` | katalog va ostatok o'qish |
| medicalka | `secret` | zakaz qabul qilish va status |
| uzum | `oauth` | `client_id` + `client_secret` → bearer token |

Hujjatlar: [Medicalka](integrations/medicalka-api.ru.md) ·
[Uzum Tezkor](integrations/uzum-tezkor-api.ru.md)

Ro'yxat: `node scripts/issue-key.js --list` · Bekor qilish: `--revoke <prefix>…<last4>`

Bekor qilish **darhol** kuchga kiradi — Uzum bearer token'i ham, chunki u har
so'rovda kalitga qarab tekshiriladi.

---

## 8. Medicalka inbound approval va paid orderlar

Bu oqim Medicalka bizning `/medicalka/v1` endpointlarimizni o'qishidan alohida.
Eski katalog tokeni va order secreti o'zgarmaydi: yangi kalit chiqarmang,
rotatsiya yoki revoke qilmang.

Medicalka bergan partner login/parol `channel/.env` ga secret store orqali
uzatiladi. Qiymatni repo yoki logga yozmang:

```
MEDICALKA_INBOUND_ENABLED=true
MEDICALKA_PARTNER_BASE_URL=https://api.medicalka.com/api/v1
MEDICALKA_PARTNER_USERNAME=<Medicalka bergan login>
MEDICALKA_PARTNER_PASSWORD=<Medicalka bergan parol>
MEDICALKA_APPROVAL_POLL_MS=5000
MEDICALKA_HISTORY_POLL_MS=60000
MEDICALKA_LEGACY_ORDERS_ENABLED=true
MEDICALKA_SUBORDERS_ENABLED=false
MEDICALKA_SUBORDER_POLL_MS=15000
MEDICALKA_SUBORDER_HISTORY_POLL_MS=300000
MEDICALKA_SUBORDER_HISTORY_DAYS=180
```

`MEDICALKA_USERNAME` va `MEDICALKA_PASSWORD` eski secret-store nomlari ham
alias sifatida ishlaydi. Yangi nomlar berilsa ular ustun.

Birinchi yoqish faqat approval oqimi:

1. channel-hub Medicalka'dan pending zayavkalarni o'qiydi.
2. Zayavka mavjud `Orders` panelidagi `Medicalka` bo'limida ko'rinadi.
3. Har bir hozirgi `users.role=admin` foydalanuvchiga botdan shaxsiy xabar
   boradi. Kanal yoki alohida Telegram allow-list ishlatilmaydi.
4. Panel va Telegram bir xil atomik accept/reject servisidan foydalanadi.
5. Medicalka kabinetida qilingan qaror history sync orqali lokal holatga tushadi.
6. Telegram yuborish Medicalka poll'dan ajratilgan durable worker orqali yuradi.
   Telegram sekin yoki o'chiq bo'lsa ham yangi zayavkalar DB/admin panelga tushadi.
   Har bir xabar retry/backoff va finalization holatini saqlaydi.

Approve Billz ostatokni kamaytirmaydi. Faqat Medicalka `paid` sub-order berganda
sotuv chegarasi boshlanadi. Shu sabab birinchi deployda
`MEDICALKA_SUBORDERS_ENABLED=false` qoladi.

Approval oqimini read/decision darajasida tekshirgandan keyin paid orderlarni
alohida yoqing:

```
BILLZ_WRITE_ENABLED=true
MEDICALKA_LEGACY_ORDERS_ENABLED=false
MEDICALKA_SUBORDERS_ENABLED=true
```

Server `MEDICALKA_SUBORDERS_ENABLED=true` holatini inbound yoki Billz write
o'chiq bo'lsa yoki `MEDICALKA_LEGACY_ORDERS_ENABLED=true` bo'lsa rad etadi.
Bu ikkita sotuv manbasi bir orderni turli external ID bilan ikki marta Billz'ga
yozishini qat'iy to'xtatadi. `false` qilishdan oldin Medicalka legacy order
senderni o'chirganini tasdiqlashi shart. Eski key revoke/rotate qilinmaydi:
katalog va ostatka tokeni ishlayveradi; mavjud secret autentifikatsiyadan o'tadi,
lekin legacy order write partner flow faol vaqtda `503 mk_legacy_orders_disabled`
oladi.

Paid orderdagi har bir product ID aniq Medicalka mappingga ega bo'lishi shart;
nom bo'yicha taxmin qilinmaydi. Mapping yo'q yoki Billz natijasi noaniq bo'lsa
avtomatik retry/spisanie to'xtaydi va panelda `reconciliation required` chiqadi.

Delivery order: markirovka talab qilingan barcha qatorga fiscal label kiritiladi,
keyin faqat `shipped`; `delivered` Medicalka/kuryer tomoni. Pickup order:
`shipped`, `delivered`, `completed` ruxsat. Sotilgan order bekor qilinsa Billz
qaytarish avtomatik qilinmaydi — manual reconciliation talab qilinadi.
Sub-order poll contractdagi takroriy `pharmacy_ids` parametrini ishlatadi.
Active statuslar 15 soniyada, terminal/refund history 5 daqiqada va oxirgi
180 kun bilan chegaralangan holda tekshiriladi. Medicalka return policy uzunroq
bo'lsa `MEDICALKA_SUBORDER_HISTORY_DAYS` shu policyga mos oshiriladi. Kechikkan
`returned/refunded` holati reconciliation navbatiga chiqadi. Billz yakunlangan,
lekin projection update crash bo'lgan bo'lsa authoritative `ChannelOrder`
holati keyingi poll'da projectionni tiklaydi.

**Orqaga qaytarish:** avval `MEDICALKA_SUBORDERS_ENABLED=false`, keyin eski
senderga qaytilsa `MEDICALKA_LEGACY_ORDERS_ENABLED=true`; kerak bo'lsa
`MEDICALKA_INBOUND_ENABLED=false`, so'ng `pm2 restart channel-hub`. Bu eski
`/medicalka/v1` token/secretni o'chirmaydi.

---

## 9. Uzum Tezkor

Uzum menejeri bilan kelishilgandan keyin. `channel/.env`:

```
UZUM_ENABLED=true
UZUM_STORE_ID=<Uzum bergan do'kon ID>
UZUM_TOKEN_SIGNING_KEY=<32+ belgi, faqat shu server uchun>
PUBLIC_IMAGE_BASE_URL=https://fairhaven.uz
UPLOADS_DIR=/var/www/fairhaven/backend/uploads
```

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Servis to'liqsiz sozlamada **ishga tushmaydi** — bu ataylab: yarim sozlangan
integratsiya runtime'da chalg'ituvchi xato beradi.

Rasmsiz mahsulot Uzum'ga **chiqmaydi**. Uzum har qatorga rasm chizadi, bo'sh
massiv mijozga bo'sh katak ko'rsatadi. Billz CDN'dan rasm olinmaydi — Billz buni
taqiqlaydi.

---

## 10. Bot zakazlari → Billz

Eng oxirida yoqiladi, 1–8 barqaror ishlagandan keyin.

`backend/.env`:

```
BILLZ_BRIDGE_ENABLED=true
BILLZ_BRIDGE_SINCE=2026-08-01T00:00:00.000Z
```

`BILLZ_BRIDGE_SINCE` — **qattiq chegara**. Undan oldin yaratilgan zakazlarga
umuman qaralmaydi. Uni yoqayotgan kunga qo'ying, aks holda butun zakaz tarixi
Billz'ga yangi bron bo'lib ketadi.

Oqim: `pending` → lokal bron · `confirmed` → Billz'da bron · `delivered` →
sotuv · `cancelled` → bo'shatish.

Lokal bron (`pendingQty`) — Telegram kanalida tasdiqlangunicha tovarni
marketpleyslardan olib turadi. `BOT_HOLD_TTL_MS` (default 2 soat) o'tgach
bo'shaydi; zakaz ochiq qoladi va keyin tasdiqlansa oddiy tarzda bron qilinadi.

Tekshirish:

```bash
pm2 logs fairhaven --lines 50 --nostream | grep billz-bridge
```

**Orqaga qaytarish:** `BILLZ_BRIDGE_ENABLED=false`, `pm2 restart fairhaven`.
Ochiq bronlar Billz'da o'z muddati bilan bo'shaydi.

---

## Xavfsizlik bayroqlari

Hammasi **o'chirilgan holatda** keladi. Har birini alohida, tekshirib yoqing.

| Bayroq | Nima qiladi | Yoqishdan oldin |
|---|---|---|
| `BILLZ_WRITE_ENABLED` | Billz'ga yozishga ruxsat | Oqim jonli tekshirilgan (01.08.2026) — Medicalka ulangach yoqiladi |
| `MEDICALKA_INBOUND_ENABLED` | Medicalka approvallarni o'qish va accept/reject | Partner login/parol, admin roli, panel tekshirilsin |
| `MEDICALKA_LEGACY_ORDERS_ENABLED` | Eski Medicalka order write endpointini ochadi | Partner paid sub-order oqimi bilan bir vaqtda yoqmang; eski keyning o'zini o'zgartirmaydi |
| `MEDICALKA_SUBORDERS_ENABLED` | Paid Medicalka sub-orderni Billz sotuviga o'tkazish | Inbound va Billz write yoqilgan, product mapping to'liq |
| `BILLZ_BRIDGE_ENABLED` | Bot zakazlari Billz'ga | `BILLZ_BRIDGE_SINCE` qo'yilsin |
| `UZUM_ENABLED` | Uzum endpointlari | Store ID, signing key, rasm domeni |
| `STOCK_RECONCILE_ENABLED` | Ostatokni avtomatik boshqarish | `reconcile-stock.js` hisoboti ko'rilsin |
| `TELEGRAM_USE_WEBHOOK` | Webhook transporti | Domen va TLS ishlasin |
| `SEED_ON_EMPTY` | Bo'sh katalogni to'ldirish | **Production'da hech qachon** |
| `ALLOW_IN_MEMORY_DB` | Vaqtinchalik baza | `NODE_ENV=production` da o'zi rad etadi |

### nginx

`/internal` **hech qachon** proksilanmasligi kerak — u ostatokni harakatlantiradi.

```nginx
location /internal { return 404; }
```

Servis odatda `127.0.0.1` ga bog'lanadi, ya'ni tashqaridan yetib bo'lmaydi.
`HOST` boshqa qiymatga o'zgartirilsa, servis `CHANNEL_INTERNAL_TOKEN` 32+ belgi
bo'lishini talab qiladi va ishga tushmaydi.

---

## Nosozliklar

**Panel «Сервис каналов не подключён» deydi** — `CHANNEL_HUB_URL` yoki `CHANNEL_INTERNAL_TOKEN` yo'q, yoki channel-hub ishlamayapti. `pm2 status channel-hub`.

**Sinxron «отклонена» bo'ldi** — Billz mirror'dagidan 2 barobar kam mahsulot qaytardi. Bu himoya: qisman javob hamma kanalda tovarni «yo'q» qilib qo'yishining oldini oladi. Billz tomonini tekshiring; katalog haqiqatan qisqargan bo'lsa `sync-once.js --force`.

**Mahsulot do'kondan yo'qoldi** — `node scripts/reconcile-stock.js` sababni aytadi. Ko'p hollarda `no_image` yoki `gone_from_billz`.

**Bot javob bermayapti** — `pm2 logs fairhaven | grep -i "webhook\|polling"`. Webhook o'rnatilgan, lekin nginx `/tg/` ni proksilamayotgan bo'lsa Telegram bizga yeta olmaydi: `TELEGRAM_USE_WEBHOOK=false` qilib qaytaring.

**Billz `429`** — rate limit. Klient o'zi kutib qayta uradi. Doimiy bo'lsa `BILLZ_RPS` ni pasaytiring.

**Zakaz Billz'ga tushmadi** — `orders` kolleksiyasida `billzSync` ga qarang:
`lastError` — vaqtinchalik xato, o'zi qayta uriladi; `conflict` — o'zi
tuzalmaydi, odam aralashuvi kerak (masalan, yetkazilgan zakazni bekor qilishga
urinish — bu qaytarish, boshqa hisob).

**Marketpleys `429` oldi** — `RATE_LIMIT_CHANNEL_MAX` (kalit boshiga daqiqada)
yoki `RATE_LIMIT_CHANNEL_AUTH_MAX` (IP boshiga 5 daqiqada, faqat rad etilganlar).
Ikkinchisi bir IP'dan kelayotgan xatolar oqimi bilan to'ladi — o'sha kompaniyaning
boshqa buzuq skripti bo'lishi mumkin.

**Uzum `401`** — token muddati (1 soat) tugagan yoki kalit bekor qilingan.
Uzum o'zi qayta token oladi. Kalit bekor qilingan bo'lsa yangisini chiqaring.

**Tovar Uzum'da yo'q** — sabablari tartib bilan: rasm yo'q, narx yo'q,
`channels.uzum.enabled` o'chiq, Billz'da o'chirilgan.

---

## Zaxira

```bash
mongodump --db fairhaven --out ~/backups/mongo-$(date +%Y%m%d-%H%M)
```

`channel-hub` kolleksiyalari (`billzproducts`, `synclogs`, `billztokens`) sinxrondan tiklanadi. `channelkeys` — **tiklanmaydi**, kalitlar qayta chiqariladi. `products`, `orders`, `users` — asosiy ma'lumot, zaxira shular uchun.
