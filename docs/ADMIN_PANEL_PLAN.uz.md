# FairHaven Ideal Admin Panel — Reja (v2)

Sana: 2026-08-02. v1 grill qarorlari + v2 multi-agent tekshiruv (codex GPT-5.6-Sol, glm GLM-5.2, agy Gemini-Flash, 2 ichki linza) asosida. Dispatcher yakuniy qarorlari — Claude.

## 1. Qulflangan qarorlar (o'zgarmagan)

| # | Qaror | Tanlov |
|---|-------|--------|
| Q1 | Shakl | Bitta universal app: TMA ichida HAM, brauzerda HAM |
| Q2 | Auth | TMA'da initData, brauzerda bot-login. Yangi parol YO'Q |
| Q4 | Yangi bloklar | Analitika, Live buyurtmalar, Bulk+Excel, CRM+Broadcast — bosqichli |
| Q5 | Dizayn | FairHaven oq + burgundy (#973961/#7d2f50), mavjud shriftlar, pill tugmalar |
| Q6 | Joylashuv | Alohida `admin/` Vite app, `/admin` path |

## 2. Buzilmas shartlar (o'zgarmagan)

1. Mini appdan kirish avvalgidek saqlanadi.
2. 100% funksional parity — eski adminning barcha funksiyalari o'tadi.
3. Ma'lumot yo'qolmaydi — faqat additive o'zgarishlar; eski admin parity'gacha qoladi; o'chirish faqat foydalanuvchi tasdig'i bilan.

## 3. v2 KRITIK topilmalar (tekshiruvda tasdiqlangan)

| # | Topilma | Dalil | Yechim |
|---|---------|-------|--------|
| K1 | **Brauzer auth ishlamaydi**: `/api/admin/*` faqat Telegram initData qabul qiladi (adminAuth). webAdminAuth faqat 3 sayt-route'da | server.js:86, adminRoutes.js:13 | P0: unified middleware — initData YOKI web-sessiya cookie, ikkalasi ham admin rolni tekshiradi. Additive |
| K2 | **Mijoz telefonini almashtirish endpointi yo'q** — admin panelda raqam read-only; raqam faqat bot registratsiyasidan keladi. (Settings'dagi support-telefon tahriri bor — u parity'da) | routes'da PATCH /users yo'q | P2: yangi `PATCH /admin/users/:telegramId` (phone, ism) + buyurtma ichida telefon tahriri |
| K3 | **Backup yo'q** — "ma'lumot yo'qolmaydi" sharti migratsiyalar haqida edi, DB backup umuman yo'q | VPS'da mongodump cron topilmadi | P0: mongodump cron + offsite nusxa (git-bundle oqimiga qo'shish). Panel tugmasi EMAS — real cron |
| K4 | **Buyurtma statusi o'lik nuqta**: UI faqat pending→confirmed/cancelled; preparing/delivering/delivered tugmalari yo'q; bekor qilish confirm'siz 1 klik | Orders.jsx:158-168 | P1: to'liq status zinasi + o'tish qoidalari (delivered→preparing taqiqlanadi) + bekor qilishga confirm |
| K5 | **Status tarixi yo'q** — kim qachon o'zgartirgani yozilmaydi; revert izni o'chiradi | adminController.js:124-154 | P2: Order.statusHistory[] (from,to,kim,qachon) + timeline UI |
| K6 | **Billz conflict ko'rinmas**: billzSync.conflict/lastError bor, lekin hech qayerda ko'rsatilmaydi — tiqilib qolgan buyurtmani operator hech qachon bilmaydi | Order.js:97-101 | P4: "Muammoli buyurtmalar" filtri + dashboard badge |

## 4. Arxitektura (v2 aniqlashtirilgan)

v1'dagi struktura qoladi, 3 aniqlik:

1. **Port, rewrite emas.** Mavjud 10 sahifa (3.5k qator, ishlab turgan pattern'lar) yangi `admin/` app'ga KO'CHIRILADI (api-adapter + tokenlar moslanadi), noldan yozilmaydi. Ikki panelni parallel saqlash davri minimal bo'ladi. (codex ogohlantirishi qabul qilindi; alohida app qarori qoladi — mijoz TMA bundle'i yengillashadi.)
2. **Ikki shell, bitta kodbaza:**
   - `/admin` — to'liq rejim: navbat + yon-panel detail, mahsulot tahriri, hisobotlar, print/export.
   - `/admin/quick` — telefon TMA rejimi: shoshilinch buyurtmalar, claim, keyingi-status, qo'ng'iroq/xarita, availability toggle.
   - Standart shell kirish nuqtasidan aniqlanadi (bot tugmasi → quick, brauzer → full), faqat ekran kengligidan EMAS. Har doim "To'liq rejim" tugmasi ko'rinadi — telefonda ham to'liq rejimga o'tish mumkin (funksiya berkitilmaydi).
3. **Bot notifikatsiyasi deep-link**: yangi buyurtma xabari → `/admin/quick/orders/:id` to'g'ridan ochadi.

Auth adapter v1'dagidek, faqat K1 unified middleware bilan.

## 5. Dizayn — o'zgarmagan (FairHaven Clinical, oq+burgundy, §v1)

## 6. Funksional qamrov v2

### 6.1 Parity+ (P1) — port + glm audit tuzatishlari

10 sahifa porti + audit topgan teshiklar (bular parity'ning o'zini ham yaxshilaydi):

- Paginatsiya hamma ro'yxatda (hozir faqat Channels'da bor), search debounce 300ms (Orders/Products'da har harf API uradi)
- Xato ≠ bo'sh: xatoda oldingi data saqlanadi + retry tugmasi
- K4 status zinasi + bekor-confirm
- Settings: `DELETE /settings/:key` UI'da yo'q edi — qo'shiladi; guruhlash (Hero/Kontakt/Dostavka); "hammasini saqlash"
- Channels: `GET/PUT /channels/settings` UI'da yo'q edi — qo'shiladi; bulk'ga dry-run preview
- Gallery: multi-upload (hozir bitta fayl!), lossy 800×800 krem-fon transform o'chiriladi (aspect saqlanadi, WebP), copy-URL, "ishlatilyapti" ogohlantirishi
- Admins: oxirgi-admin guard (hozir panelni adminsiz qoldirish mumkin), raw-ID o'rniga mijoz qidiruvi
- Collections: butun katalogni yuklash o'rniga paginated qidiruv; drag-to-reorder
- Promo: sana validatsiyasi (expiresAt > startsAt), kod qidiruvi

### 6.1.1 Billz'dan tovar tanlash (foydalanuvchi topshirig'i, 2026-08-02)

**Topilgan bug (tasdiqlangan):** tovar qo'shish oynasida BillzPicker BOR (Products.jsx:216), lekin frontend `?q=` yuboradi, backend `req.query.search` o'qiydi (channelController.js:501) — qidiruv hech qachon filtrlamaydi, natijada "ishlamaydi/yo'q" bo'lib ko'rinadi. Channels sahifasi `search` yuboradi — shuning uchun u yerda ishlaydi.

Yechim (P1):
1. Bug: `q` → `search` (bir so'z).
2. **Ro'yxat (spiska) rejimi**: maydonga fokus tushishi bilan darhol birinchi 20 tovar ko'rinadi (backend bo'sh search'ni qo'llaydi — tayyor), scroll bilan davomi, yozsang filtrlash.
3. Tanlanganda nom/SKU/barcode/narx avto-to'ladi (mavjud mantiq), qoldiq va narx ko'rinadi, "allaqachon bog'langan" tovarlar kulrang.
4. Oddiy til: "Billz'dagi tovarni tanlang — nom va narx o'zi to'ladi. Tanlamasangiz ham bo'ladi."

### 6.1.2 Kalit ustaxonasi — token/sekret oqimi (foydalanuvchi topshirig'i)

**Hozirgi muammo (tasdiqlangan):** ChannelKeys'da "Токен чтения" va "Секрет заказов" alohida tugmalar; bir bosish = darhol yangi kalit, confirm yo'q, tushuntirish yo'q; sekret bir marta ko'rsatiladi va qaytarilmaydi. Tasodifiy bosish oson ("juda tez yasab qo'yadi").

**Foydalanuvchi taklifi to'g'ri**: Medicalka uchun token (katalog o'qish) + sekret (buyurtmalar) — bitta ulanishning ikki yarmi, alohida chiqarishning ma'nosi yo'q, ikkalasini birga yaratish kerak. Qabul qilindi, bitta qo'shimcha bilan: eski kalitni almashtirish (rotatsiya) uchun bittalab qayta chiqarish "qo'shimcha" bo'limida qoladi.

Yangi oqim — **"Ulanish ustasi" (wizard), texnik bilimsiz odam uchun** (P1, Channels porti bilan birga):

1-qadam. Tushuntirish, oddiy tilda: "Medicalka bilan ulanish uchun 2 ta kalit kerak: biri katalogni o'qiydi, biri buyurtmalarni qabul qiladi. Ikkalasini hozir birga yaratamiz."
2-qadam. Tasdiq: "Yaratilsinmi?" + agar eski faol kalit bo'lsa ogohlantirish: "Eskisi ishlashda davom etadi — xohlasangiz keyin bekor qilasiz" (+ "eskisini darhol bekor qil" belgilash katagi).
3-qadam. Natija bitta ekranda: TOKEN va SEKRET yonma-yon, har birida katta "Nusxa olish" tugmasi + "Hammasini nusxa olish". Qizil banner: "Bu oyna yopilgach SEKRET qayta ko'rsatilmaydi".
4-qadam. Yopish faqat "✅ Nusxa oldim va saqladim" belgilangandan keyin faollashadi.
5-qadam. Keyingi qadam ko'rsatmasi: "Bu ikkalasini Medicalka menejeriga yuboring. Ular ulagach, shu sahifada 'oxirgi ishlatilgan' vaqti paydo bo'ladi."

Uzum o'zgarmaydi (teskari yo'nalish — ULAR beradi, biz kiritamiz), lekin import formasi ham shu wizard uslubida tushuntiriladi.

Texnik: backend o'zgarishi minimal — `POST /channels/keys/pair` (ikkala kind'ni bitta tranzaksiyada chiqaradi) yoki frontend ketma-ket 2 ta issueKey chaqiradi; log'da juftlik belgilanadi.

### 6.2 Operator yadrosi (P2) — kunlik ish 2-3x tezlashadi

- **"Diqqat talab" inbox**: yangi + eskirgan (30 daq javobsiz) + to'lov muammo + Billz conflict + sinxron xato — bitta navbat, eng eskisi tepada, badge sonlar ("Yangi (4)")
- **Live yangilanish**: polling-diff (10s) + ovoz + badge; TMA'da HapticFeedback. SSE EMAS — hajm oshsa keyin (bot allaqachon push beradi)
- **Buyurtma workbench**: telefon/manzil/izoh/pozitsiya tahriri (K2 endpoint), tap-to-call, telefon/manzil copy, Telegram chat ochish, xarita
- **Claim**: "Men oldim" — kim ishlayotgani ko'rinadi, to'qnashuv ogohlantirishi (2-3 operator uchun ham shart)
- **Status tarixi** (K5) + **ichki eslatmalar** (mijoz izohidan alohida: "2 marta qo'ng'iroq, 18:00 dan keyin")
- **Chek chop etish**: mavjud formatOrderReceipt (adminController.js:604) print-CSS ko'rinishga ulanadi — A5/termal, buyum+summa+manzil+telefon. PDF-dvijok EMAS
- **Mijoz yon-vidjeti** buyurtma ichida: oldingi buyurtmalar soni, LTV, "olib ketmagan" bayrog'i
- **Mijoz block bayrog'i**: COD prank-buyurtmalarga qarshi (User.botBlocked teskarisi yo'q edi)
- **"Returned" status**: yetkazilgandan keyin bekor — Billz'ga yubormaydigan terminal status + qisqa runbook (Order.js conflict kommentidagi holat)

### 6.3 Tezlik qatlami (P3)

- **Global qidiruv / Cmd+K palette**: buyurtma ID, telefon (qisman ham), ism, SKU, mahsulot, promo — istalgan joydan
- **Klaviatura**: `/` qidiruv, J/K navbat, Enter ochish, raqamlar status, Esc yopish
- **Undo-toast (5s)** status/availability/narx o'zgarishlarida — modal o'rniga
- **Audit log**: bitta AuditLog kolleksiyasi + mutatsiya middleware (kim narxni o'zgartirdi?) + dashboard activity feed
- **Saqlangan filtrlar + URL holat**: "Bugungi yangi", "Naqd yetkazish", "Uzum muammolari" — havola ulashiladi
- **Inline tahrir**: jadval katagida narx/availability (Excel-uslub)
- **Mahsulot dublikat qilish**: klon + SKU/ident tozalash — katalog kiritish tezlashadi
- **Autosave**: forma qoralamasi localStorage — TMA suspend/reload'da yo'qolmaydi
- **Tayyor javoblar**: to'lov havolasi (Click/Payme), kuryer holati, qabul qilish tartibi — 1 klik Telegram xabar

### 6.4 Analitika lite (P4)

- Kartalar: bugun/7k/30k tushum, buyurtma, o'rtacha chek (davr almashtirgich)
- 2 grafik (Recharts): tushum trendi, top-10 mahsulot
- Promo: PromoCodes sahifasida inline "N marta ishlatilgan" + buyurtmalarga havola (alohida hisobot EMAS)
- Kanal kesimi: mavjud `GET /channels/summary` ko'rsatiladi (qayta agregatsiya EMAS)
- **Stok vidjeti**: BillzProductView'dan read-only qoldiq Products jadvalida + dashboard "tugayapti" ro'yxati (K6 conflict navbati bilan)

### 6.5 Excel + bulk (P5)

- Export: mahsulotlar + buyurtmalar (davr) + mijozlar — server exceljs, brauzerdan
- Bulk: narx %, availability — Channels'dagi tayyor pattern + dry-run preview ("25 tovar: edi X → bo'ladi Y")
- Import: dry-run diff + dublikat-ogohlantirish bilan — KEYINGI bosqichga qoldirildi (bulk+inline tahrir ehtiyojni yopadi; katalog 200+ SKU bo'lsa yoki so'ralsa quriladi)

### 6.6 Broadcast (P6)

- 3 ta tayyor auditoriya: hammasi / oxirgi 30 kun xarid / 90+ kun jim (segment-dvijok EMAS — keyin kerak bo'lsa)
- Majburiy test-yuborish adminga → tasdiq → ommaviy; rate-limit 25 msg/sek; blok bayroqlilar chiqariladi
- Tarix: sana, matn, yuborildi/xato soni — broadcast ekrani pastida ro'yxat (alohida sahifa EMAS)

### 6.7 Telegram imkoniyatlari — v2 qisqartirilgan ro'yxat

| Qoladi | Sabab |
|--------|-------|
| requestFullscreen + safe area (8.0) | TMA'da real UX ehtiyoj |
| Mini App origin validation (10.2) | Xavfsizlik |
| Bot deep-link → buyurtma | Operator oqimining yadrosi |
| HapticFeedback | Quick rejimda arzon signal |

| Kesildi | Sabab |
|---------|-------|
| SecureStorage sessiya tokeni | TMA'da har so'rov initData bilan — saqlaydigan token yo'q (o'z auth sxemamizga zid) |
| DeviceStorage offline kesh | Filtr holati URL'da; buyurtma paneli offline ma'nosiz |
| addToHomeScreen | Kirish — bot tugmasi; 3 admin uchun ortiqcha |
| hideKeyboard, SecondaryButton | Har formani 2 xil qurish kerak bo'lardi; spekulyativ |
| Rich-jadval xabarlar (10.1) | Baribir oddiy-matn fallback shart edi — ikki marta qurish; formatlangan matn + deep-link yetadi |
| Bot checklists (9.1) | 1-5 pozitsiyali buyurtmada panel ichidagi ro'yxat yetadi; ikkinchi yuza sinxron muammosi |
| Kanban drag-drop | Navbat + 1-klik keyingi-status tezroq va xatosizroq; 20+ parallel buyurtmada qaytib ko'riladi |
| SSE | Polling-diff + bot push yetarli; hajm o'ssa qo'shiladi |

## 7. Bosqichlar v2

| Faza | Ish | Tekshiruv |
|---|---|---|
| P0 | Skeleton, K1 unified auth, nginx `/admin`, bot tugma + deep-link, K3 mongodump cron | Ikkala yo'l login; cron dump fayli paydo bo'ldi; Playwright smoke |
| P1 | Parity port (10 sahifa) + §6.1 tuzatishlar + §6.1.1 Billz picker (bug + spiska) + §6.1.2 kalit ustasi | Parity checklist 100% + har tuzatish testi; Billz qidiruv filtrlashi testi; wizard oqimi texnik bilimsiz odam bilan sinov; eski panel yonma-yon QA |
| P2 | Operator yadrosi §6.2 | Test buyurtma oqimi boshdan-oxir: inbox→claim→workbench→status→chek; K2 endpoint testi |
| P3 | Tezlik qatlami §6.3 | Cmd+K har entity topadi; undo qaytaradi; audit log yozadi; URL filtr ulashish ishlaydi |
| P4 | Analitika lite §6.4 | Panel raqamlari === Mongo aggregation (script diff); conflict navbati test-conflict ko'rsatadi |
| P5 | Excel export + bulk §6.5 | Export ochiladi, sonlar mos; bulk dry-run diff to'g'ri |
| P6 | Broadcast §6.6 | Test-send adminga; rate-limit; blok chiqarilgan |
| P7 | TMA polish (fullscreen, quick shell, swipe) + eski adminni o'chirish | O'chirish FAQAT foydalanuvchi tasdig'i bilan, alohida commit |

Har faza: kod → test → commit → push. Vizual: Playwright screenshot 375/768/1440.

## 8. Xavfsizlik (v1 + qo'shimcha)

- K1 unified middleware ikkala auth yo'lida ham rol tekshiradi
- Broadcast/bulk/import — ikki bosqichli tasdiq
- Audit log — pul-sezgir amallar izi
- Backup cron — panelning tashqarisida, real himoya

## 9. Texnik tanlovlar

v1'dagidek (Vite+React 18, react-router, Recharts, exceljs, UI-kit yo'q) + qo'shimcha: kutubxonasiz polling-diff util; print-CSS (kutubxonasiz); AuditLog — oddiy Mongoose model.

---

## Ilova: v2 tekshiruv attributsiyasi

- **codex (GPT-5.6-Sol)**: K1 auth topilmasi, ikki-shell modeli, attention inbox, claim, workbench, print, klaviatura, undo, saved filters, kanban/SSE/gadjet kesish argumentlari
- **glm (GLM-5.2)**: 10 sahifa endpoint-ma-endpoint audit — §6.1 to'liq; DELETE /settings va channels/settings ochilmagan endpointlar; Gallery lossy transform; oxirgi-admin guard
- **agy (Gemini Flash)**: undo-toast, inline tahrir, tayyor javoblar, navbat badge'lar, autosave, mijoz yon-vidjet, swipe
- **Ichki linzalar (Fable)**: bloat-kesish ro'yxati; audit log, status tarixi, Billz conflict navbati, block bayroq, ichki eslatmalar, stok vidjet, returned status, backup — kod dalillari bilan
- **Dispatcher tekshiruvi**: K1, K2, K3 kodda qo'lda tasdiqlandi; codex'ning "alohida app'ni bekor qil" taklifi RAD etildi (port-strategiya bilan xavf yopildi)
