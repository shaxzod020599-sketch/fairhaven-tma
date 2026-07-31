# Billz → Kanal integratsiyasi (Medicalka / Uzum Tezkor / Yandex) — dizayn

Sana: 2026-07-31
Holat: tasdiqlash kutilmoqda

---

## 1. Maqsad

Fairhaven Health UZ tovar qoldig'i va narxlarini **Billz 2.0** da yuritadi. Distribyutor sifatida
mahsulotlarni tashqi kanallarga (Medicalka, Uzum Tezkor, kelajakda Yandex) chiqarish kerak.

Talablar:

1. Kanallar Billz'dan **narx va qoldiq** oladi.
2. Kanal sotganda Billz'da qoldiq **kamayishi** kerak.
3. Har kanal uchun **alohida narx** bo'lishi mumkin (Billz roznitsa narxidan farqli).
4. Qoldiq **soni mijozga ko'rinmaydi** — faqat adminga.
5. Admin har mahsulot uchun har kanalda **qo'lda «bor / yo'q»** qila oladi (Billz'ni bekor qiladi).
6. Narxlar **qo'lda** qo'yiladi; Billz narxi faqat ma'lumot uchun ko'rinadi.
7. Yangi mahsulot **faqat Billz katalogidan tanlab** qo'shiladi — Billz'da yo'q tovarni
   qo'shib bo'lmaydi.
8. Bot/mini app zakazlari ham Billz'ga yoziladi, lekin **Telegram kanalda tasdiqlangandan
   keyin**.
9. Bot barcha platformalardagi zakazlarning statusini Telegram kanalga yuborib turadi.
10. Admin panel tez ishlashi va maksimal xavfsiz bo'lishi kerak.

---

## 2. Tekshirilgan faktlar

### 2.1 Billz

Tizim — **Billz 2.0**, `https://api-admin.billz.ai`. (`api.billz.uz/docs` — bu eski Billz 1.0,
JSON-RPC; bizga aloqasi yo'q.)

| Narsa | Qiymat |
|---|---|
| Auth | `POST /v1/auth/login` `{secret_token}` → `access_token` (15 kun) + `refresh_token` |
| Har so'rov | `Authorization: Bearer <access_token>` |
| company_id | `bd0c2e13-99ef-401d-a721-9345ef890a40` — FAIRHAVEN HEALTH |
| shop_id | `d25689cf-cefa-470e-9a54-6b2f9ea0fb0f` |
| cashbox_id | `9238c93c-1506-451f-9ff5-a548bb135030` («Cashbox vitabeauty») |

Ishlaydigan metodlar (tekshirilgan, faqat o'qish):

- `GET /v2/products?limit=&page=` — katalog (28 mahsulot)
- `GET /v2/category`, `GET /v2/brand`, `GET /v2/product-type`
- `GET /v1/shop`, `GET /v1/cash-box`, `GET /v1/supplier`, `GET /v1/user`, `GET /v1/client`
- `GET /v2/write-off-reason`, `GET /v2/stocktaking`

`403 access denied` (kalitga ruxsat berilmagan):

- `GET /v1/product`, `/v1/category`, `/v1/brand`, `/v1/payment-type`, `/v1/customer`
- `GET /v1/order`, `/v2/order`

Mahsulot strukturasi (kerakli maydonlar):

```
id                        uuid
name, sku, barcode
brand_id, brand_name, categories[]
main_image_url, photos[]
description               (HTML)
measurement_unit          {name, short_name}
shop_measurement_values[] {shop_id, active_measurement_value}   ← QOLDIQ
shop_prices[]             {shop_id, retail_price, promo_price}  ← NARX
```

### 2.2 Billz cheklovlari (arxitekturani belgilaydi)

- **Rate limit: 2 so'rov/sekund bitta IP'dan**, oshsa `429`.
- **Billz CDN'dan rasmni to'g'ridan-to'g'ri ko'rsatish taqiqlangan** — rasmlarni o'z serverimizga
  ko'chirish shart.
- Evristik anti-DDoS analizatori bor — burst so'rovlar IP blokiga olib kelishi mumkin.

Xulosa: kanallar Billz'ga to'g'ridan-to'g'ri bormaydi. Bizda **mirror** bo'ladi.

### 2.3 Billz'da sotuv oqimi (qoldiqni kamaytirish)

```
POST /v2/order?Billz-Response-Channel=HTTP        {shop_id, cashbox_id}      → order_id (chernovik)
POST /v2/order-product/:order_id                  {product_id, sold_measurement_value,
                                                   use_free_price, free_price, seller_ids,
                                                   response_type:"HTTP"}
POST /v2/order-manual-discount/:order_id          {discount_unit, discount_value, product_id}
POST /v2/order/create_postpone                    {order_id, time, comment}   ← BRON
POST /v2/order-payment/:order_id                  {payments:[{company_payment_type_id,
                                                   paid_amount}], comment}    ← SOTUV
```

Kanal narxi Billz roznitsa narxidan farq qilsa — `use_free_price: true` + `free_price: N`
(mahsulotda «свободная цена» yoqilgan bo'lishi kerak), aks holda
`order-manual-discount` `CURRENCY` rejimida.

Bron (`create_postpone`) qoldiqni band qiladi — boshqa hech kim sotolmaydi. Aynan shuning
uchun oversell bo'lmaydi.

### 2.4 Medicalka kontrakti

Biz **provayder** tomonmiz: API'ni biz yozamiz, ularga `token` (o'qish) va `secret` (zakaz)
beramiz. Ularning hujjatidagi shakl:

| Metod | Endpoint | Auth |
|---|---|---|
| GET | `/pharmacies` | `?token=` |
| GET | `/products?skip=&limit=` (limit ≤ 1000) | `?token=` |
| GET | `/products/{id}` | `?token=` |
| GET | `/products/search?q=&limit=` | `?token=` |
| GET | `/inventory?skip=&limit=` | `?token=` |
| GET | `/stock?pharmacy_id=&product_id=` | `?token=` |
| POST | `/orders` | `?secret=` |
| POST | `/orders/{order_id}/status` | `?secret=` |

Qattiq talablar:

- `id`, `total` — **butun son**; `price`, `quantity` — **string** (`"749000.00"`).
- `/inventory` faqat **naqd bor** tovarlarni qaytaradi; `is_available` doim `true`.
- `/stock` tovar yo'q bo'lsa **404**.
- Zakaz statuslari: `paid`, `payment_confirmed`, `cancelled`, `cancelled_by_buyer`;
  boshqasi → `422`, noma'lum `order_id` → `404`.
- Xatolar: `401` (kalit noto'g'ri), `403` (kalit o'chirilgan), `404`, `422`.

Billz UUID → Medicalka butun son ID: bizda barqaror `medicalkaId` (auto-increment) saqlanadi.

### 2.5 Uzum Tezkor kontrakti

Uzum Tezkor Retail API — **Yandex Eats** oilasidan. Ya'ni kelajakdagi Yandex integratsiyasi
shu bazadan chiqadi. Biz server tomonmiz, ular bizni so'raydi.

Endpointlar (`/` va `/v1/` prefikslari **ikkalasi ham** ishlashi kerak):

| Metod | Endpoint | Izoh |
|---|---|---|
| POST | `/security/oauth/token` | OAuth2 `client_credentials`, `x-www-form-urlencoded` → `{access_token}` |
| GET | `/v1/nomenclature/{storeId}/composition` | katalog + kategoriyalar + narx |
| GET | `/v1/nomenclature/{storeId}/availability` | `{items:[{id, stock}]}` |
| POST | `/order` | Uzum zakaz yuboradi → `{orderId, result:"OK"}` |
| GET | `/order/{orderId}` | zakaz tarkibi |
| PUT | `/order/{orderId}` | zakazni yangilash |
| DELETE | `/order/{orderId}` | bekor qilish, body `{eatsId, comment}` |
| GET | `/order/{orderId}/status` | `{status, comment, updatedAt}` |
| GET | `/restaurants` | ixtiyoriy, faqat start uchun |

So'rov chastotasi (Uzum tomonidan):

- katalog — **soatiga 1 marta**
- qoldiq — **5 daqiqada 1 marta**
- zakaz statusi — **daqiqada 1 marta**

Muhim qoidalar:

- **15 daqiqa** ichida `ACCEPTED_BY_RESTAURANT` bermasak — Uzum zakazni bekor qiladi.
- Zakaz takrorlansa (`eatsId` bo'yicha) — **o'sha `orderId` bilan yana `200`** qaytarish shart
  (idempotentlik).
- `Content-Type` aniq bo'lishi kerak:
  `application/vnd.eda.picker.nomenclature.v1+json`,
  `application/vnd.eda.picker.availability.v1+json`,
  `application/vnd.eats.order.v2+json`.
- Xato javobi — massiv: `[{code:int, description:string}]`, `description` da real sabab.
- Status oqimi: `NEW → ACCEPTED_BY_RESTAURANT → COOKING → READY → TAKEN_BY_COURIER → DELIVERED`;
  `CANCELLED` — istalgan bosqichda; `POSTPONED` — terminal bo'lmagan bosqichda.
- Host **domen bo'yicha** berilishi kerak (IP emas) → `api.fairhaven.uz` + TLS.

### 2.6 Billz ma'lumotlari Uzum talablariga tayyormi

28 mahsulot bo'yicha audit:

| Maydon | Holat |
|---|---|
| `barcode` | 28/28 ✅ |
| `sku` (→ `vendorCode`) | 28/28 ✅ |
| narx | 28/28 ✅ |
| o'lchov birligi | 28/28 «шт» → `isCatchWeight: false`, tarozi tovari yo'q ✅ |
| qoldiq > 0 | 26/28 |
| rasm | 23/28 ⚠️ 5 tasida yo'q |
| tavsif | 1/28 ⚠️ 27 tasida yo'q |
| MXIK / ИКПУ (`serviceCodesUz.mxikCodeUz`) | Billz'da **0/28**, bizda default bilan hal qilindi ✅ |

MXIK kodlari Billz'da umuman yo'q (`custom_fields` bo'sh), shuning uchun ular **bizning
bazamizda** yuritiladi:

- **Default MXIK: `02106999028000000`** — sozlamalarda saqlanadi, MXIK'i alohida
  belgilanmagan barcha mahsulotlarga qo'llanadi.
- Har mahsulot uchun admin panelda **alohida MXIK** qo'yish mumkin — u default'ni
  bekor qiladi.

```
effectiveMxik(product) = product.mxikCode || settings.defaultMxikCode
```

Xuddi shu qoida `packageCode` uchun ham (ixtiyoriy, default bo'sh).

---

## 3. Arxitektura

### 3.1 Umumiy ko'rinish

```
                 ┌──────────────────────────────────────────┐
   Billz 2.0 ◄───┤  channel-hub  (yangi servis, :3100)      │
  api-admin      │  · billz-client (auth + 1.5 rps limiter) │
  .billz.ai      │  · sync worker (katalog + qoldiq)        │
                 │  · image mirror (SHA1)                   │
                 │  · reservation/sale worker (navbat)      │
                 │  · adapters: medicalka | uzum | yandex   │
                 └───────┬──────────────────────┬───────────┘
                         │ Mongo (bir xil baza) │  HTTPS api.fairhaven.uz
                         ▼                      ▼
                 ┌───────────────┐      Medicalka  ·  Uzum Tezkor
                 │ fairhaven DB  │
                 └───────┬───────┘
                         │
        ┌────────────────┴────────────────┐
        │  backend :3000 (bot + sayt)     │  ← tegilmaydi, faqat admin panel kengayadi
        │  mini.fairhaven.uz/admin        │
        └─────────────────────────────────┘
```

Nima uchun alohida servis:

- Billz sinxronizatsiyasi va kanal trafigi bot bilan bitta processda emas — biri sekinlashsa
  ikkinchisi ta'sirlanmaydi.
- Kanal kalitlari va Billz tokeni faqat shu servisning `.env` da.
- `pm2` da alohida process, alohida log, alohida restart.

Joylashuv: bir xil repozitoriyda yangi papka `channel/` (deploy allaqachon `git bundle`
orqali ishlaydi — yangi repo qo'shimcha murakkablik beradi).

Ma'lumot almashinuvi: **bir xil Mongo bazasi** (`fairhaven`), yangi kolleksiyalar. Admin panel
(`:3000`) kanal narxlarini yozadi, `channel-hub` (`:3100`) o'qiydi. RPC kerak emas.

### 3.2 Ma'lumot modeli

Ikki kolleksiya, ikki aniq vazifa. Billz mirror'i Fairhaven mahsulot kartasidan **ajratilgan**:
mirror'da Billz'dagi hamma tovar bor (hali sotuvga qo'yilmaganlari ham), `Product` da esa
faqat biz sotayotgan tovarlar.

**`billzproducts`** — sof Billz mirror'i. Faqat sinxron yozadi, admin tahrirlamaydi.

```
billzProductId   String  unique index     Billz uuid
medicalkaId      Number  unique sparse    Medicalka butun son ID talab qiladi;
                                          nashr etilganda bir marta beriladi
sku, barcode, name, brandName
billzCategoryId, categoryPath
measurementUnit                            'шт' / 'мл' / ...
retailPrice, promoPrice   Number
stock                     Number           shop_measurement_values dan
reservedQty               Number default 0 Billz'dagi faol bronlar yig'indisi
pendingQty                Number default 0 tasdiqlanmagan bot zakazlari (lokal, Billz'ga tegmaydi)
sourceImageUrl                             Billz CDN havolasi (ko'rsatilmaydi, faqat taqqoslash uchun)
syncedAt, deletedInBillz
```

**`Product`** (mavjud model kengaytiriladi) — Fairhaven mahsulot kartasi. Bot, mini app,
sayt va kanallar shundan o'qiydi.

```
// yangi maydonlar
billzProductId   String  unique sparse index    ← Billz bilan bog'lanish, MAJBURIY
barcode          String  default ''             Billz'ga bog'lash uchun
mxikCode         String  default ''             bo'sh bo'lsa settings.defaultMxikCode ishlatiladi
packageCode      String  default ''
vatPercent
images[]         { url, sha1 }                  o'z serverimizda, Uzum uchun sha1 kerak

channels: {
  bot:       { enabled, price, forceStatus, minStock },
  medicalka: { enabled, price, forceStatus, minStock },
  uzum:      { enabled, price, oldPrice, forceStatus, minStock }
}

// mavjud maydonlar saqlanadi: name, nameUz, description*, category, imageUrl, brand, sku, tags
```

Mavjud `price` maydoni → `channels.bot.price` ga ko'chiriladi (migratsiya), lekin eski
maydon orqaga moslik uchun qoladi va `channels.bot.price` bilan sinxron yuritiladi.

`forceStatus`: `'auto' | 'in' | 'out'`.

Kanal uchun mavjudlikni hisoblash — bitta joyda, bitta funksiya (`core/availability.js`):

```
b = billzproducts[product.billzProductId]
availableStock = max(0, b.stock - b.reservedQty - b.pendingQty)

isAvailable(product, channel) =
  channel.enabled === false            → false
  channel.forceStatus === 'out'        → false
  channel.forceStatus === 'in'         → true
  b yo'q yoki b.deletedInBillz         → false
  else                                 → availableStock > (channel.minStock ?? 0)
```

`minStock` — xavfsizlik zapasi (masalan 2 dona do'kon uchun qoldirish).

`reservedQty` `billzproducts` da turadi — chunki bron Billz qoldig'iga qarshi qilinadi va
hamma kanallar bitta qoldiqni bo'lishadi.

### 3.2.1 Mahsulot faqat Billz'dan qo'shiladi

Admin panelda **bo'sh joydan mahsulot yaratish o'chiriladi**. Yangi mahsulot qo'shish oqimi:

```
«Yangi mahsulot» → Billz tanlagichi (modal)
   qidiruv: nom / artikul / shtrix-kod → billzproducts dan
   ro'yxatda: nom, artikul, shtrix-kod, Billz narxi, qoldiq, rasm
   «allaqachon qo'shilgan» tovarlar kulrang, tanlab bo'lmaydi
→ tanlanadi
→ Product yaratiladi: billzProductId bog'lanadi,
   name / brand / sku / barcode / rasm Billz'dan oldindan to'ldiriladi
→ admin tavsif, kategoriya, kanal narxlarini qo'shadi
```

Billz'da bo'lmagan tovarni qo'shib bo'lmaydi. Shu bilan har bir Fairhaven kartasi Billz
nomi, artikuli va qoldig'iga qattiq bog'lanadi.

**Mavjud mahsulotlarni bog'lash (migratsiya).** Hozirgi `Product` yozuvlarida
`billzProductId` yo'q. Bir martalik skript avtomatik moslashtiradi:

1. `barcode` bo'yicha aniq moslik
2. `sku` bo'yicha aniq moslik
3. normalizatsiya qilingan nom bo'yicha (registr, ortiqcha bo'shliq, `№`/`No` olib tashlanadi)

Moslanmaganlar admin panelda **«Billz'ga bog'lanmagan»** filtrida qoladi; admin qo'lda
tanlaydi. Bog'lanmagan mahsulot hech qaysi kanalga chiqmaydi.

Skript avval **quruq rejimda** (`--dry-run`) hisobot beradi, tasdiqlangandan keyin yozadi.

**`channelorders`** — kanal zakazlari.

```
channel          'medicalka' | 'uzum'
externalId       String     Medicalka: order_id | Uzum: eatsId
internalOrderId  String     biz qaytaradigan uuid
unique index (channel, externalId)        ← idempotentlik

items[]  { billzProductId, name, qty, unitPrice }
totalAmount
customer { name, phone, address }
status   'received'|'accepted'|'reserved'|'paid'|'sold'|'cancelled'|'failed'
billz    { draftOrderId, postponeId, saleOrderId, attempts, lastError, lastTriedAt }
telegramMessageId  Number    zakaz kanalidagi kartochka (tahrirlash uchun)
rawIn    Mixed      original payload (audit uchun)
```

**`channelkeys`** — kanal kalitlari.

```
channel, keyType ('token'|'secret'|'oauth')
clientId               (Uzum uchun)
secretHash             sha256 (ochiq matn saqlanmaydi)
prefix                 ko'rsatish uchun oxirgi 4 belgi
active, createdAt, rotatedAt, lastUsedAt
```

**`synclogs`** — sinxronizatsiya tarixi: `startedAt, finishedAt, kind, ok, changed, errors[]`.

**`billztokens`** — Billz `access_token` / `refresh_token` keshi (bitta hujjat), `expiresAt` bilan.

### 3.3 Billz klienti

- Yagona **token bucket**: 1.5 so'rov/sek (2/sek limitdan pastda), global navbat.
- `429` → eksponensial backoff (1s, 2s, 4s, 8s), maksimum 5 urinish.
- `401` → token yangilash (mutex bilan, faqat bitta yangilash bir vaqtda), so'ng qayta urinish.
- Har so'rov `synclogs` ga emas, `pino` log'ga yoziladi; secret hech qachon log'da yo'q.
- Barcha yozuv (write) operatsiyalari **navbat** orqali — parallel emas.

### 3.4 Sinxronizatsiya

| Ish | Davri | Nima qiladi |
|---|---|---|
| Katalog + qoldiq + narx | **5 daqiqa** | `GET /v2/products` sahifama-sahifa → `billzproducts` upsert |
| Rasm mirror | katalog bilan | `sourceImageUrl` o'zgargan bo'lsa yuklab olinadi, SHA1 hisoblanadi |

28 mahsulot = 1 so'rov. 2000 mahsulot = 20 so'rov ≈ 14 sekund. Rate limitga tegmaydi.

Admin panelda **«Hozir sinxronla»** tugmasi (throttle: 1 daqiqada 1 marta).

Billz'da yo'qolgan mahsulot `deletedInBillz: true` bo'ladi — o'chirilmaydi, kanallardan
avtomatik chiqariladi (tarix va zakaz havolalari saqlanadi).

### 3.5 Zakaz → bron → sotuv

Har kanalda `requireManualConfirm` sozlamasi bor:

| Kanal | `requireManualConfirm` | Sabab |
|---|---|---|
| bot / mini app / sayt | **true** | Telegram kanalda qo'lda tasdiqlanadi |
| medicalka | false | ular zakazni allaqachon qabul qilgan |
| uzum | false | 15 daqiqa deadline — odam kutib bo'lmaydi |

Admin bu sozlamani panelda o'zgartira oladi.

**Bot / mini app / sayt zakazi (`requireManualConfirm: true`)**

Mavjud oqim saqlanadi, faqat Billz ilgagi qo'shiladi. `bot/bot.js` da Telegram kanalda
allaqachon `✅ Tasdiqlash / ❌ Rad etish` tugmalari bor va status `pending → confirmed`
ga o'tadi — yangi tugma kerak emas.

```
zakaz → Telegram kanalga kartochka (status 'pending')   ← Billz'ga HECH NARSA yozilmaydi
  ✅ Tasdiqlash bosiladi  → status 'confirmed'  → Billz'da BRON
  🚚 'delivered'                                → Billz'da SOTUV
  ❌ Rad etish / 'cancelled'                    → bron bekor (bron bo'lgan bo'lsa)
```

Billz yozuvi status o'tishiga ulanadi (`orderController` va `adminController.updateOrderStatus`
ikkalasida bitta umumiy ilgak), tugmaning o'zida emas — shunda admin paneldan status
o'zgartirilsa ham ishlaydi.

**Muammo: tasdiqlashgacha bo'lgan oraliq.** Zakaz `pending` turganda Billz'da hech narsa
band emas. Shu oraliqda oxirgi dona Medicalka'ga sotilib ketishi mumkin — keyin admin
tasdiqlaganda bron muvaffaqiyatsiz bo'ladi.

Yechim — **lokal yumshoq bron** (`pendingQty`, Billz'ga tegmaydi):

```
billzproducts.pendingQty   ← 'pending' holatdagi bot zakazlari yig'indisi
availableStock = max(0, stock - reservedQty - pendingQty)
```

Bot zakazi kelganda `pendingQty += qty` (faqat bizning bazada). Tasdiqlanganda
`pendingQty -= qty` va Billz'da haqiqiy bron ochiladi. Rad etilsa yoki
**vaqti o'tsa (default 2 soat)** `pendingQty -= qty`.

Shunda «Billz'ga tasdiqlashgacha yozilmasin» talabi buziladigan joyi yo'q, lekin kanallar
o'sha tovarni sotib yubormaydi. Vaqt chegarasi kanal sozlamalarida o'zgartiriladi.

**Kanal zakazi (`requireManualConfirm: false`)**

```
1. Kanal POST yuboradi
   └→ validatsiya (ajv/zod) → channelorders ga yoziladi (idempotent) → DARHOL 200
      (Billz kutilmaydi — Uzum 15 daqiqa deadline'i va Medicalka timeout'i uchun kritik)
   └→ Telegram zakaz kanaliga xabar: «🏥 Medicalka» / «🟣 Uzum» yorlig'i bilan

2. Fon worker (navbat, ketma-ket):
   POST /v2/order                    → draftOrderId
   har item uchun:
     POST /v2/order-product/:draft   (kanal narxi: use_free_price yoki manual-discount)
   POST /v2/order/create_postpone    → BRON. status='reserved', reservedQty += qty

3. Kanal to'lov/yakun statusini yuboradi
   (Medicalka: paid | payment_confirmed;  Uzum: DELIVERED)
   └→ POST /v2/order-payment/:draft  → SOTUV. status='sold', reservedQty -= qty
      (Billz qoldiqni o'zi kamaytiradi)

4. Bekor (Medicalka: cancelled/cancelled_by_buyer;  Uzum: DELETE /order/{id})
   └→ bronni bekor qilish → status='cancelled', reservedQty -= qty
```

Xato bo'lsa: `status='failed'`, `billz.lastError` yoziladi, admin panelda qizil qatorda
ko'rinadi + Telegram kanalga ogohlantirish. **Zakaz rad etilmaydi** — chunki rad etish
kanalda zakaz yo'qolishiga olib keladi. Admin qo'lda «Qayta urinish» bosadi.

`reservedQty` — bizning himoya qatlamimiz: Billz qoldig'i 5 daqiqada bir yangilansa ham,
bron qilingan tovar boshqa kanalga ko'rinmaydi.

### 3.5.1 Telegram xabarnomalari (hamma kanal uchun)

Bot mavjud zakaz kanaliga (`ORDERS_CHANNEL_ID`) hamma platforma zakazlarini yuboradi:

| Hodisa | Xabar |
|---|---|
| Yangi kanal zakazi | Kartochka: kanal yorlig'i, tashqi ID, mijoz, tarkib, summa. Tugmalar **yo'q** (avto-qabul) |
| Status o'zgardi | O'sha kartochka tahrirlanadi: `qabul qilindi → bron → to'landi → sotildi` |
| Billz xatosi | ⚠️ alohida xabar + «Qayta urinish» tugmasi |
| Bekor qilindi | Kartochka `❌ Bekor qilindi` deb yangilanadi |

Kartochka **tahrirlanadi**, yangi xabar yuborilmaydi — kanal toza qoladi. Buning uchun
`channelorders.telegramMessageId` saqlanadi (bot zakazlaridagi `channelMessageId` bilan
bir xil shakl).

### 3.6 Kanal adapterlari

Har adapter — mustaqil papka, bitta vazifa: **ichki modelni kanal formatiga aylantirish**.
Billz mantiqi adapterda yo'q.

```
channel/src/
  billz/          client.js  ratelimit.js  auth.js  sale.js
  sync/           catalog.js  stock.js  images.js
  core/           availability.js  pricing.js  reservations.js
  adapters/
    medicalka/    routes.js  serializers.js  auth.js
    uzum/         routes.js  serializers.js  oauth.js  statuses.js
  models/         (bir xil Mongo, backend modellarini qayta ishlatadi)
  server.js
```

Yangi kanal qo'shish = yangi `adapters/<nom>/` papka + `channels.<nom>` maydoni.
Yandex — Uzum adapterining nusxasi (bir xil Yandex Eats kontrakti).

Uzum uchun ikkita nuqta:

- Router `/` va `/v1` da bir vaqtda mount qilinadi (hujjat talabi).
- Javob `Content-Type` lari aniq vendor tipida beriladi.

---

## 4. Admin panel

### 4.1 Yangi «Kanallar» sahifasi (`mini.fairhaven.uz/admin`)

Jadval — qator = mahsulot, ustunlar:

| Mahsulot | Billz narx | Billz qoldiq | Bron | Bot narx | Bot | Medicalka narx | Medicalka | Uzum narx | Uzum |
|---|---|---|---|---|---|---|---|---|---|

- Billz narx/qoldiq — **faqat o'qish**, kulrang. Qoldiq faqat shu yerda ko'rinadi (mijozga hech qayerda).
- Narx katakchasi — joyida tahrirlash, optimistik saqlash + toast.
- Kanal tugmasi — 3 holat: `avto` / `bor` / `yo'q`.
- Ommaviy amallar: belgilangan qatorlarga «Medicalka narxi = Billz + N%», «Uzumda yoqish» va h.k.
- Filtrlar: kanal bo'yicha, «narx qo'yilmagan», «rasm yo'q», «MXIK yo'q», «qoldiq 0»,
  **«Billz'ga bog'lanmagan»**.

### 4.2 Mahsulot kartasida «Kanallar» bo'limi

O'sha ma'lumot bitta mahsulot kesimida + tavsif (ru/uz/uzLat), MXIK kodi, rasm yuklash
(mavjud `MultiImageUpload` qayta ishlatiladi).

Kartaning yuqorisida Billz bog'lanishi ko'rinadi: Billz nomi, artikuli, joriy narxi va
qoldig'i. Bog'lanmagan bo'lsa — sariq ogohlantirish + «Billz'ga bog'lash» tugmasi.

### 4.2.1 Billz tanlagichi («Yangi mahsulot»)

Eski «bo'sh forma» o'rniga modal:

- Qidiruv maydoni — nom / artikul / shtrix-kod bo'yicha `billzproducts` dan (server tomonda,
  debounce 300 ms, sahifalash).
- Har qator: rasm, nom, artikul, shtrix-kod, Billz narxi, qoldiq.
- Allaqachon qo'shilganlar kulrang va tanlanmaydi.
- Tanlangach — nom, brend, artikul, shtrix-kod, rasm Billz'dan oldindan to'ldirilgan
  tahrirlash formasi ochiladi.

`POST /admin/products` endi `billzProductId` ni **majburiy** talab qiladi va uning
`billzproducts` da mavjudligini tekshiradi.

### 4.3 Kanal zakazlari sahifasi

Ro'yxat: kanal, tashqi ID, summa, status, Billz holati. «Qayta urinish» va «Bronni bekor
qilish» tugmalari. Xatolar qizil.

### 4.4 Sinxronizatsiya vidjeti

Oxirgi sinxron vaqti, o'zgargan mahsulotlar soni, xatolar, «Hozir sinxronla».

### 4.5 Kalitlar va kanal sozlamalari sahifasi

Medicalka `token`/`secret`, Uzum `client_id`/`client_secret` — yaratish va almashtirish.
Ochiq matn **faqat bir marta** ko'rsatiladi, bazada sha256 hash saqlanadi.

Har kanal uchun sozlama: yoqilgan/o'chirilgan, `requireManualConfirm`, standart `minStock`,
`storeId` (Uzum bizning do'kon ID'sini shu yerdan oladi).

Umumiy sozlamalar: **default MXIK** (`02106999028000000`), default `packageCode`,
default `vatPercent`, `pendingQty` vaqt chegarasi.

Mahsulot kartasida MXIK maydoni bo'sh bo'lsa placeholder sifatida default ko'rsatiladi
(«default: 02106999028000000») — admin nima qo'llanayotganini ko'rib turadi. «Kanallar»
jadvalida «MXIK qo'lda qo'yilgan» filtri bor.

### 4.6 «Qotib qolish» muammosini tuzatish

Aniqlangan sabab: `backend/controllers/adminController.js` → `listProducts` **pagination'siz**
butun katalogni qaytaradi, qidiruv indekssiz `$regex` bilan.

Tuzatishlar:

- `listProducts` ga `page` / `limit` (default 50), `.lean()`, kerakli maydonlar proyeksiyasi.
- Indekslar: `{ sku: 1 }`, `{ barcode: 1 }`, `{ 'channels.medicalka.enabled': 1 }`,
  `{ 'channels.uzum.enabled': 1 }`.
- Qidiruv — mavjud text indeksdan foydalanadi, `$regex` faqat qisqa so'rovlarda.
- Frontendda: qidiruvga debounce (300 ms), server tomonda sahifalash, narx tahririda
  optimistik yangilanish (to'liq qayta yuklash yo'q), qatorlar `React.memo`.
- Jadval 200 qatordan oshsa — virtualizatsiya.

---

## 5. Xavfsizlik

1. **Sirlar** faqat `.env` da (`chmod 600`), kodda va git'da emas. Chatga tushgan Billz
   tokeni va VPS paroli **almashtiriladi**.
2. `channel-hub` alohida tizim foydalanuvchisi ostida, root emas.
3. Kirish kalitlari bazada **sha256 hash** ko'rinishida; solishtirish `timingSafeEqual` bilan.
4. nginx: faqat TLS, HSTS, `api.fairhaven.uz` uchun rate limit (masalan 10 r/s burst 20),
   body hajmi cheklovi (1 MB).
5. Barcha kiruvchi so'rovlar **sxema bo'yicha validatsiya** (ajv). Uzum uchun berilgan
   `Uzum Tezkor Grocery API.yml` dan sxemalar to'g'ridan-to'g'ri olinadi — javoblarimiz
   ham shu sxema bilan testda tekshiriladi.
6. Log'larda token/secret yo'q; kiruvchi payload audit uchun saqlanadi, lekin kalitlar
   maskalanadi.
7. Audit jurnali: kim, qachon, qaysi mahsulotning qaysi kanal narxini o'zgartirdi.
8. Billz'ga faqat kerakli metodlar — eng kam huquq prinsipi.
9. Kanal API'si admin panelga umuman tegmaydi (alohida process, alohida port, alohida auth).

---

## 6. Testlash

- `node --test` (mavjud shakl: `backend/tests/*.test.js`).
- **Kontrakt testlari**: Medicalka javob shakllari (int/string tiplari!) va Uzum javoblari
  `Uzum Tezkor Grocery API.yml` sxemasi bo'yicha ajv orqali tekshiriladi.
- Idempotentlik testi: bir xil `eatsId` bilan ikki marta `POST /order` → bir xil `orderId`, `200`.
- Mavjudlik mantiqi (`isAvailable`) — birlik testlari: `forceStatus`, `minStock`, `reservedQty`.
- Billz klienti — mock server bilan: `429` backoff, `401` token yangilash, navbat tartibi.
- Sotuv oqimi — Billz'ning **test/demo** kompaniyasida uchdan-uchgacha, prod'da emas.

---

## 7. Blokerlar (mijoz tomonidan hal qilinadi)

| # | Bloker | Kim |
|---|---|---|
| 1 | Billz UI'da integratsiya kalitiga **zakaz/sotuv metodlariga ruxsat** berish (hozir 403) | Mijoz / Billz |
| 2 | Kanal sotuvlari uchun `company_payment_type_id` (masalan «Перечисление») | Mijoz / Billz |
| 3 | ~~MXIK / ИКПУ kodlari~~ — **hal qilindi**: default `02106999028000000`, admin paneldan har mahsulotga alohida qo'yish mumkin | ✅ |
| 4 | Uzum: `measure.unit` enum faqat `MLT`/`GRM` — dona tovar uchun mos emas, menejerdan aniqlash | Uzum menejeri |
| 5 | Uzum: `serviceCodesUz` majburiymi yoki ixtiyoriymi — aniqlash | Uzum menejeri |
| 6 | 5 mahsulotda rasm yo'q, 27 tasida tavsif yo'q | Mijoz / admin panel |
| 7 | `api.fairhaven.uz` subdomeni + TLS sertifikati (Uzum IP qabul qilmaydi) | Biz |
| 8 | Medicalka: bizning base URL va kalit formatini tasdiqlash | Medicalka |
| 9 | Billz tokeni va VPS parolini almashtirish (chatda ochiq ketdi) | Mijoz |

---

## 8. Bosqichlar

| Bosqich | Mazmun | Natija |
|---|---|---|
| P0 | Sirlarni almashtirish, blokerlarni mijozga yuborish | Xavfsiz start |
| P1 | `channel-hub` skeleti, Billz klienti (auth + rate limit), `billzproducts`, 5 daqiqalik sinxron, rasm mirror | Billz mirror ishlaydi |
| P2 | `Product` kengaytirish + mavjud mahsulotlarni Billz'ga bog'lash skripti (dry-run → yozish) | Har karta Billz'ga bog'langan |
| P3 | Admin panel: Billz tanlagichi, «Kanallar» sahifasi, sinxron vidjeti + `listProducts` perf tuzatish | Narxlarni qo'yish mumkin |
| P4 | Bot zakazlari → Billz (tasdiqlashda bron, yetkazilganda sotuv) | Bot qoldiqni kamaytiradi |
| P5 | Medicalka adapteri (faqat o'qish) + kalitlar | Medicalka katalog va qoldiqni ko'radi |
| P6 | Medicalka zakazlari + kanal zakazlari sahifasi + Telegram xabarnomalari | Medicalka to'liq |
| P7 | Uzum adapteri: OAuth2, `composition`, `availability`, zakaz oqimi, statuslar | Uzum to'liq |
| P8 | Yandex — Uzum adapteri asosida | Kelajak |

---

## 9. Qabul qilingan qarorlar

1. **Katalog** — Billz yagona manba. Qoldiq soni mijozga ko'rinmaydi, narxlar qo'lda qo'yiladi,
   admin har kanalda qo'lda «bor / yo'q» qila oladi.
2. **Mahsulot qo'shish** — faqat Billz'dan tanlab. Billz'da yo'q tovarni qo'shib bo'lmaydi.
3. **Bot zakazlari ham Billz'ga yoziladi** — lekin faqat Telegram kanalda tasdiqlangandan
   keyin. Tasdiqlashgacha Billz'da hech narsa bo'lmaydi.
4. **Kanal zakazlari** — avtomatik qabul (odam kutmaydi), bot esa hamma platforma
   zakazlarining statusini Telegram kanalga yuborib turadi.
5. **Sinxron davri** — 5 daqiqa (katalog, narx, qoldiq birgalikda).
6. **Kanal narxi qo'yilmagan mahsulot** kanalga chiqmaydi.
7. **Sotuv yozish** — bron → to'lovdan/yetkazilgandan keyin sotuv.
8. **Joylashuv** — alohida servis, alohida port, bir xil Mongo bazasi.
9. **MXIK** — default `02106999028000000` hamma mahsulotga, admin paneldan har mahsulot
   uchun alohida o'zgartirish mumkin.

---

## 10. Bog'liq hujjatlar

- [Xavfsizlik va bot optimizatsiyasi auditi](2026-07-31-security-and-bot-audit.md) —
  rate limiting, CSP, webhook'ga o'tish, broadcast va admin panel tezligi.
