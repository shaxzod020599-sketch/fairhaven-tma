# Fairhaven — Billz va sotuv kanallari arxitekturasi

Yakuniy holat. 01.08.2026

---

## 1. Nima uchun ikkita servis

```
                    ┌──────────────┐
   Telegram bot ────│   backend    │  :3000   orders, users, products, settings
   Mini app     ────│   (bot)      │
   Sayt         ────└──────┬───────┘
                           │  loopback, X-Internal-Token
                           │  «bu zakaz bron bo'lishi kerak»
                    ┌──────▼───────┐
   Medicalka    ────│ channel-hub  │  :3100   billzproducts, channelorders, channelkeys
   Uzum Tezkor  ────│              │───────── Billz API (1.5 req/s, bitta navbat)
                    └──────────────┘
```

Bitta jarayonda bo'lmasligining uchta sababi bor va uchalasi ham amaliy:

1. **Billz sekin bo'lsa, bot sekinlashmaydi.** Billz 2 req/s beradi va burstni
   evristik bloklaydi. O'sha navbat bot bilan bir jarayonda tursa, katalog
   sinxroni paytida mijoz zakaz berolmay qolishi mumkin.
2. **Billz kaliti bitta jarayonda qoladi.** Backend uni umuman ko'rmaydi.
3. **Marketpleys trafigi bot bilan bir rate limit'ni bo'lishmaydi.**

### Chegara majburlangan, kelishuv emas

`channel/src/db.js` da ikkita ro'yxat bor:

| | Kolleksiyalar |
|---|---|
| Yoziladi | `billzproducts` `billztokens` `synclogs` `channelkeys` `channelcounters` `channelorders` |
| Faqat o'qiladi | `products` `settings` |

`defineModel` boshqa kolleksiyaga model yaratishdan **bosh tortadi** — kelajakdagi
xato ishga tushishdagi crash bo'ladi, jimgina ma'lumot yo'qotish emas.
`defineReadModel` esa faqat o'qish metodlari bor muzlatilgan fasad qaytaradi:
`update`, `delete`, `save` u yerda umuman yo'q.

---

## 2. Ostatok: bitta manba, uchta hisoblagich

Billz — ostatokning yagona manbai. Lekin **mijozga ostatok raqami hech qachon
ko'rsatilmaydi** — faqat «bor / yo'q».

`billzproducts` dagi bitta yozuvda:

| Maydon | Kim yozadi | Ma'nosi |
|---|---|---|
| `stock` | Billz sinxroni | Billz'dagi qoldiq |
| `reservedQty` | biz | Billz'da bron qilingan donalar |
| `pendingQty` | biz | tasdiqlanmagan bot zakazi ushlab turgan donalar |

```
sotish mumkin = stock − reservedQty − pendingQty − minStock
```

**Sinxron `reservedQty` va `pendingQty` ni hech qachon qayta yozmaydi.** Shuning
uchun ular ikki marta hisoblanib qolsa, mirror Billz'dan **doimiy** uzoqlashadi —
keyingi sinxron buni tuzatmaydi. Aynan shu sababdan har bir zakazda
`reservationApplied` va `pendingApplied` bayroqlari bor: qayta urinish o'sha
donalarni ikkinchi marta ushlab qolmaydi, bo'shatish ikkinchi marta qaytarmaydi.

### `reservedQty` ni ayirish — majburiy, ehtiyot chorasi emas

Jonli kompaniyada o'lchandi: API orqali **3 dona bron qilindi**, sinxron
`stock` deb o'qiydigan `active_measurement_value` esa **o'n soniya davomida
o'zgarmadi** (1080 → 1080 → 1080).

Ya'ni Billz otложканни yozib qo'yadi, lekin uni o'z mahsulot ro'yxatidagi
qoldiqdan **ayirmaydi**.

Demak «Billz o'zi biladi, shunchaki uning ostatogini o'qiymiz» degan
soddalashtirish **oversell qiladi**: har bir marketpleys allaqachon band
donalarni sotishda davom etardi va farq faqat kuryer yo'q tovarga kelganda
bilinardi.

### Ko'rinish qoidalari (ustuvorlik tartibida)

1. Rasm yo'q → yashirin. Har doim.
2. Admin tasdiqlamagan → yashirin.
3. Admin qo'lda «bor/yo'q» qo'ygan → **Billz'dan ustun**.
4. Billz'ga bog'lanmagan → tegilmaydi (qo'lda boshqariladi).
5. Billz'dan yo'qolgan → yashiriladi, **o'chirilmaydi**.
6. Qolgan hollarda → Billz ostatogi.

Rasm qoidasi qo'lda qarordan **yuqorida** turadi ataylab: nimani sotish —
operatorning qarori, lekin ishlaydigan kartochka bo'lishi — qaror emas, shart.

---

## 3. Zakaz hayot sikli

Barcha kanallar uchun bitta yozuv turi: `channelorders`.

> **Medicalka istisnosi:** quyidagi umumiy diagramdagi `reserved` holatida
> kutmaydi; uning autentifikatsiyalangan `POST` so'rovi bitta Billz sotuvini
> sinxron tugatib, keyin `200 accepted` qaytaradi.

```
received ──► reserved ──► sold
    │           │
    └───────────┴──────► cancelled
    │
    └──► failed  (qayta urinish mumkin)
```

| Kanal | `received` dan keyingi ishlov qachon |
|---|---|
| Medicalka | `POST` ichida: `reserved` holatida kutmasdan Billz sotuv tugagachgina `200 accepted` qaytadi |
| Uzum | zakaz kelgan zahoti, javobdan keyin |
| Bot | **Telegram kanalida tasdiqlangandan keyin** |

### Ikkita o'zgarmas qoida

**Takroriy zakaz ikkinchi sotuvga aylanmaydi.** `(channel, externalId)` — unikal
indeks. Ikki nusxa bir vaqtda kelsa, indeks hal qiladi; yutqazgan g'olibni o'qib
qaytaradi, xato bermaydi — aks holda marketpleys yana yuborardi.

**Medicalka uchun muvaffaqiyat Billz'dan keyin beriladi.** Medicalka kabineti
zakazni oldindan tasdiqlaydi yoki rad etadi; autentifikatsiyalangan `POST` —
tayyor sotuv niyati. Channel-hub bitta Billz sotuvini sinxron tugatib, keyin
`200 accepted` qaytaradi. `POST` kelmasa Fairhaven hech narsa qilmaydi.
Takror so'rovlar o'sha barqaror butun `wc_order_id` ni qaytaradi va ikkinchi
draft, to'lov yoki sotuv yaratmaydi. Keyingi `paid` yoki
`payment_confirmed` faqat idempotent moslik tasdig'i; sotuvdan keyingi bekor
qilish rad etiladi, qaytarish/kompensatsiya esa alohida kelajak jarayoni.

Bu qoida Uzum uchun javobni Billz'dan oldin beradigan oqimga tatbiq etilmaydi:
Uzum 15 daqiqada tasdiq ko'rmasa zakazni bekor qiladi.

---

## 4. Bot zakazlari Billz'ga qanday o'tadi

Bu arxitekturaning eng nozik joyi, chunki ikkita jarayon bir-birining
kolleksiyasiga yozolmaydi.

**Hodisa emas, maqsad uzatiladi.** Backend «operator tasdiq bosdi» demaydi. U
«bu zakaz `reserved` holatida bo'lishi kerak» deydi, channel-hub esa qolgan
masofani o'zi bosib o'tadi.

Uchta natija, uchalasi ham hodisalar navbatida yo'q:

- **Yo'qolgan xabar o'zi tuzaladi.** Backend maqsadni tasdiq olmaguncha qayta
  yuboradi, allaqachon bajarilgan maqsad esa hech narsa qilmaydi. Ikki marta
  yetkazilgan *hodisa* ikkita sotuv yozardi; ikki marta yetkazilgan *maqsad* —
  bittasini.
- **Sakrab o'tilgan bosqich holatni buzmaydi.** `pending` dan to'g'ri
  `delivered` ga o'tgan zakaz baribir avval bron qilinadi.
- **E'tibordan qolgan chaqiruv nuqtasi bo'lishi mumkin emas** — chaqiruv nuqtalari
  yo'q. Skaner har bir yangi zakazni maqsadi bilan solishtiradi.

```
order.status        maqsad
─────────────────────────────
pending          →  hold      lokal bron, Billz'ga hech narsa yozilmaydi
confirmed        →  reserve   Billz'da bron
preparing        →  reserve
delivering       →  reserve
delivered        →  sell      sotuv, bron qaytariladi
cancelled        →  cancel    bo'shatish
```

`orders.billzSync.dispatched` — oxirgi tasdiqlangan maqsad. `nextAttemptAt` bir
vaqtning o'zida ham backoff, ham **lease**: PM2 cluster rejimida ikkinchi nusxa
shu shartda yutqazadi va o'tib ketadi, o'lgan worker esa lease tugagach zakazni
qo'yib yuboradi.

**`BILLZ_BRIDGE_SINCE` — qattiq chegara.** Undan oldingi zakazlarga umuman
qaralmaydi. Bu bo'lmasa, ko'prikni yoqish butun zakaz tarixini Billz'ga yangi
bron qilib yuborardi.

### Lokal bron nima uchun kerak

Zakaz berilgan payt bilan tasdiqlangan payt orasida — daqiqalar yoki soatlar.
Bu vaqtda o'sha donalar barcha marketpleyslarda sotuvda turaveradi va birinchi
tasdiq ostatokni topmay qoladi. `pendingQty` ularni lokal ushlab turadi;
`BOT_HOLD_TTL_MS` (2 soat) o'tgach bo'shaydi — zakaz ochiq qoladi, faqat himoya
tugaydi, aks holda unutilgan bitta zakaz tovarni cheksiz muzlatib qo'yardi.

---

## 5. Kanal adapterlari

```
channel/src/adapters/
  medicalka/  auth.js  routes.js  serializers.js
  uzum/       oauth.js routes.js  serializers.js  statuses.js
```

Har bir kanal alohida prefiks va alohida kalitlarda — birini bekor qilish
ikkinchisiga tegmaydi.

### Medicalka

Query string'da kalit: `?token=` o'qish uchun, `?secret=` zakaz uchun. `id` va
`total` — butun son, `price` va `quantity` — **satr** ko'rinishidagi o'nlik.
Ostatoksiz tovar `404` qaytaradi — bu ularning kontraktida shunday, mijozi buni
`None` ga aylantiradi.

Mavjud o'qish tokeni va zakaz siri o'zgarishsiz amalda qoladi: bu ish ularni
bermaydi, aylantirmaydi, bekor qilmaydi, qayta xeshlamaydi va format yoki query
parametr nomlarini o'zgartirmaydi. Oldin bekor qilingan test kalitlari bekor
qoladi. Mavjud `Sales → Medicalka` ko'rinishi natijalarni ko'rsatadi; Fairhaven
tasdiqlash/rad etish interfeysini qo'shmaydi.

### Uzum Tezkor

Yandex Eats oilasidan, ya'ni kelajakdagi Yandex shu shablondan chiqadi.

| Qoida | Nima uchun muhim |
|---|---|
| `/` va `/v1/` — ikkalasi ham | Bitta router ikki marta mount qilinadi |
| Versiyali `Content-Type` | To'g'ri body noto'g'ri content-type bilan rad etiladi |
| Xato — massiv | Mijozi indeks bo'yicha o'qiydi |
| `eatsId` — idempotentlik kaliti | Takror `200` va o'sha `orderId` |
| 15 daqiqa | Tasdiqlanmagan zakaz bekor qilinadi |

**OAuth token'da server tomonida sessiya yo'q.** Token — imzolangan da'vo
(kanal, kalit ID, muddat), tekshirish esa imzo + kalitni bitta indeksli o'qish.
Natijada kalitni bekor qilish **darhol** kuchga kiradi, chunki har so'rovda kalit
qaytadan o'qiladi. Token ombori bo'lganida, tozalanmagan har bir token o'z
muddatigacha ishlayverardi.

Imzolash kaliti **majburiy, default'siz** — umumiy default bo'lsa, istalgan
deploymentda chiqarilgan token bu yerda ham qabul qilinardi.

### Rasmlar

Billz o'z CDN'idan media tarqatishni **taqiqlaydi**, Uzum esa har rasmga hash
so'raydi. Ikkalasi ham operatorlar yuklaydigan rasmlar bilan hal bo'ladi: ular
bizning diskda, ular do'kon ko'rsatadigan rasmlar, va SHA-1 ni bir marta hisoblab
keshlash arzon. Billz'dan hech narsa ko'chirilmaydi — rasmsiz tovar shunchaki
rasm talab qiladigan kanalga chiqmaydi.

Hash hisoblab bo'lmasa, rasm **tushirib qoldiriladi**, o'ylab topilmaydi:
baytlarni tasvirlamaydigan hash — hashsizlikdan yomonroq, chunki qabul qiluvchi
o'shanga keshlaydi va boshqa hech qachon qayta olmaydi.

---

## 6. Telegram xabarnomalari

Medicalka zakazini yaratish endpointi Telegram xabari yubormaydi. Medicalka
uchun tasdiqlash Telegram orqali emas: ularning kabinetida, `POST` Fairhaven'ga
yetib kelishidan oldin bajariladi.

Bot zakazlari uchun kartochkani backend yuboradi (tasdiqlash tugmalari bilan).
Channel-hub ular haqida faqat **Billz xatosi** bo'lganda gapiradi — backend
kartochkasi ko'rsatolmaydigan yagona narsa shu.

Qat'iy chiquvchi: bu servisda Telegram webhook ham, callback ham yo'q. Kanalda
yozish huquqini qo'lga kiritgan odam ostatokni harakatlantirolmaydi.

---

## 7. Xavfsizlik yig'indisi

| Sirt | Himoya |
|---|---|
| `/medicalka/*` | Kalit → SHA-256 bo'yicha qidiruv; o'qish va zakaz kalitlari alohida |
| `/uzum/*` | OAuth2 bearer, imzo + kalitni qayta o'qish; bekor qilish darhol |
| `/internal/*` | Loopback + doimiy vaqtli token; nginx proksilamaydi |
| Admin panel | Imzolangan Telegram `initData`, boshqa yo'l yo'q |
| Billz kaliti | Faqat channel-hub jarayonida |
| Kalitlar | Faqat SHA-256 saqlanadi; plaintext bir marta ko'rsatiladi |
| Yozish bayroqlari | Hammasi o'chirilgan holatda keladi |

Narx **har doim bizning katalogimizdan** olinadi, so'rov tanasidan emas. Aks
holda marketpleys bizga qancha to'lanishini o'zi hal qilardi.

---

## 8. Ochiq masalalar

| # | Masala | Kim hal qiladi |
|---|---|---|
| 1 | **Billz kalitini almashtirish** — chatda ochiq yozilgan | Mijoz, zudlik bilan |
| 2 | **VPS parolini almashtirish** — chatda ochiq yozilgan | Mijoz, zudlik bilan |
| 5 | Uzum `measure.unit` enum — dona tovar uchun aniqlash | Uzum menejeri |
| 6 | Uzum `serviceCodesUz` majburiymi | Uzum menejeri |
| 7 | `api.fairhaven.uz` + TLS (Uzum IP qabul qilmaydi) | Biz |

### Billz metodlari — 01.08.2026 holati

Jonli kompaniyada tekshirilgan (`medicalka api` foydalanuvchisi):

| Metod | Holat |
|---|---|
| `POST /v2/order` — qoralama | ✅ |
| `POST /v2/order-product/:id` — qator | ✅ |
| `POST /v2/order/create_postpone` — **bron** | ✅ |
| `POST /v2/order/return-postpone` — **bronni bo'shatish** | ✅ |
| `DELETE /v2/order/:id` — qoralamani o'chirish | ✅ |
| `GET /v2/order/:id` | ✅ |
| `GET /v1/company-payment-type` | ✅ |
| `POST /v2/product-import/create-with-products` — prixod | ✅ |
| `POST /v2/order-payment/:id` — **sotuv** | ✅ |

To'liq zanjir jonli kompaniyada ishlatildi: qoralama → qator → bron →
bo'shatish → o'chirish. **Hech narsa qolmadi**, ostatok boshlang'ich qiymatiga
qaytdi.

### Sotuv nol farq bilan tekshirildi

Test kompaniya yo'q edi va API'da qaytarish metodi ham yo'q, shuning uchun
sotuv **prixod bilan qoplandi**:

```
prixod 1 dona   →  1080 → 1081     import 1000094
sotuv  1 dona   →  1081 → 1080     draft 000800011246
```

Javob: `{"order_type":"SALE","should_print_cheque":true}`. Ostatok boshlang'ich
joyida, narx tegilmagan (280 000). Ikkita hujjat qoldi — kirim va sotuv —
ikkalasi ham ko'rinadi va tushuntiriladi. Hech narsa yo'qolmadi.

**Muhim:** prixodda `retail_price` joriy narxdan farq qilsa, Billz **do'kon
narxini almashtiradi**. Shuning uchun narxlar avval o'qilib, aynan o'sha
qiymatlar qaytarib yuborildi.

### Billz ostatogi ~1 daqiqa kechikadi

O'lchandi: sotuv bajarilgach `/v2/products` **65 soniya** davomida eski raqamni
qaytarib turdi. Prixodda ham xuddi shunday.

Bu bizning sinxronga qo'shiladi: 5 daqiqalik davr + ~1 daqiqa kechikish =
do'kon zalida sotilgan tovar bizga **6 daqiqagacha** kech yetadi. O'z
zakazlarimiz bunga tobe emas — `reservedQty` darhol ishlaydi — lekin kassadagi
sotuv shuncha vaqt ko'rinmaydi.

Aynan shu sababdan `minStock` yostig'i bor: oxirgi donalarni marketpleysga
chiqarmaslik shu oynani yopadi.

### To'lov turi

Barcha kanal sotuvlari — Medicalka, Uzum, bot — bitta turga yoziladi:

```
42bb647e-9533-4104-a018-8fd79e8387b3   Баланс поставщика
```

Har kanalga alohida tur qo'shish o'rniga mavjudi tanlandi. Oqibati bilinib
tursin: **Billz'da to'lov turi bo'yicha guruhlangan hisobot hamma kanalni bitta
raqamda ko'rsatadi.** Ularni ajratadigan narsa — sotuv izohi, u kanal nomini va
ularning zakaz ID'sini olib yuradi:

```
medicalka MK-2026-1
uzum UZ-1001
fairhaven-bot 68a1…
```

Ya'ni **bitta sotuvni** har doim zakazigacha kuzatib borish mumkin. «Uzum shu
oyda qancha keltirdi» degan savol esa Billz hisobotiniki emas, bizning
panelimizniki bo'ladi.

### Endpoint nomini taxmin qilish qimmatga tushdi

`cancel_postpone` degan endpoint **umuman yo'q**. Bu nom taxmin qilingan edi va
ikkita turli shaklda ham noto'g'ri chiqdi — ikkalasini ham Billz'ning o'z status
kodlari ishonarli qilib ko'rsatdi: bir yo'lda `404`, boshqasida `403`, ya'ni
«route bor, ruxsat yetishmayapti» degan xulosa. Aslida ikkala route ham yo'q edi.

To'g'risi — `POST /v2/order/return-postpone`, tanada `{order_id}`. Rasmiy
metodlar ro'yxatidan tasdiqlandi, keyin jonli kompaniyada ishlatildi.

Yana ikkita narsa shu yerdan chiqdi:

- **Bo'shatish o'chirmaydi.** Billz bronni qoralamaga qaytaradi, xolos. Ikkinchi
  qadam qo'shilmaganida har bir bekor qilingan zakaz operatorning sotuvlar
  ro'yxatida bo'sh qoralama qoldirardi — abadiy.
- **Qatorni o'chirish hujjatga zid.** Hujjat `measurement_value: 0` deydi, API
  validatori esa `min_allowed: 0.01` deb rad etadi. Bizga bu metod kerak emas:
  butun qoralamani o'chirish ishlaydi.

---

## 9. Testlar

| Paket | Testlar |
|---|---|
| backend | 122 |
| channel-hub | 145 |

Nima aynan tekshiriladi: idempotentlik va hisoblagichlar — **haqiqiy MongoDB**
da, chunki ularni unikal indeks va `$inc` majburlaydi, mock esa ikkalasi haqida
hech narsa isbotlamaydi. Kontrakt shakllari — **haqiqiy HTTP** orqali, chunki
content-type va xato konverti handler unit-testida ko'rinmaydi.
