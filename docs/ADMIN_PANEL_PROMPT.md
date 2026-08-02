# PROMPT — FairHaven Admin Panelni 0 dan qurish

Quyidagi promptni istalgan kuchli coding-agentga bering. U barcha yig'ilgan talablarni o'z ichiga oladi.

---

Sen tajribali full-stack muhandis va product-dizaynersan. Menga **FairHaven Health** vitamin do'koni uchun admin panelni **NOLDAN** qurib ber. Loyihada tayyor backend bor (Express + MongoDB, Telegraf bot, `/api/admin/*` endpointlar, Billz channel-hub) — undan foydalanasan, lekin panelning o'zini (UI/UX, struktura, oqimlar) toza varaqdan yaratasan. Eski paneldan dizayn ko'chirma — **dizaynda to'liq ijodiy erkinlik seniki**, quyidagi brend ramkasi ichida.

## 1. Platforma va kirish

- **Bitta universal ilova**: Telegram Mini App ichida (telefon + Telegram Desktop) HAM oddiy brauzerda HAM to'liq ishlaydi. Alohida `admin/` ilova, `/admin` yo'lida joylashadi, mijozlar do'koni bundle'iga aralashmaydi.
- **Parol yo'q**: TMA ichida Telegram initData bilan avtomatik kirish; brauzerda — bot orqali tasdiqlash (bir martalik havola → botda tasdiq → cookie sessiya). Admin roli bazadagi `role: admin` dan. Barcha admin endpointlar ikkala auth yo'lini qabul qiluvchi yagona middleware ortida.
- Botda `/admin` komandasi (faqat adminlarga) panelni ochadi; bot bildirishnomalari buyurtmaga to'g'ridan-to'g'ri deep-link qiladi.
- TMA'da fullscreen + safe-area, Mini App origin validation.

## 2. Dizayn (ijodiy erkinlik + qat'iy ramka)

- Brend: **oq fon + burgundy aksent** (#973961, to'q holati #7d2f50), qora ink matn, FairHaven'ning klassik shriftlari (Arial/Helvetica; raqamlar/narxlar uchun monospace). Pill tugmalar.
- **Taqiqlangan**: qora/to'q bloklar (chap panel ham OQ va o'qiladigan bo'lsin), yashil tema izlari, sahifadan-sahifaga farq qiluvchi aralash dizayn. Bitta yaxlit dizayn tizimi — token, komponent, holatlar (hover/focus/error/empty/loading) hammasi bir uslubda.
- Panel FairHaven do'konining davomidek his qilinsin — botdan kirganda "boshqa dunyo" bo'lib qolmasin.
- **Texnik bilimi yo'q odam tushunadigan bo'lsin**: har murakkab amal oddiy tilda izohlanadi, jargon yo'q, har xavfli amal oldidan tasdiq, har muvaffaqiyat/xato aniq ko'rinadi. UI tili — ruscha (mavjud panel kabi).

## 3. Tovarlar — YAGONA sahifa (eng muhim talab)

Tovar va kanallar boshqaruvi **bitta kartada** birlashadi. Billz nomenklaturasi markazda:

- Karta: rasm, brend, nom, kategoriya, SKU, narx; tahrirlash/o'chirish; opisaniyalar (ru/uz/uz-lat) va ko'p rasm eskicha to'liq qoladi.
- **Billz bloki ko'zga tashlanadigan joyda**: ulangan bo'lsa — `Цена в Billz: … сум · Остаток: N шт · Резерв: n` katta, chiroyli raqamlarda; ulanmagan bo'lsa — ogohlantirish + **"связать" tugmasi: bosilganda Billz nomenklatura SPISKASI ochiladi** (yozmasdan ham ro'yxat ko'rinadi, yozsa filtrlanadi), tanlanadi — ulanadi. Yangi tovar yaratishda ham shu spiskadan tanlab nom/SKU/narx avto-to'ladi.
- **Servislar matritsasi** har kartada, har servis o'z qatorida:
  - **FH bot (mini-app)**: По Billz (авто) / Есть / Нет;
  - **Medicalka** va **Uzum Tezkor**: yoqish/o'chirish, o'z narxi, Авто/Есть/Нет, va **limit** — "omborda N donadan kam qolsa bu servisga berilmasin" (rezerv himoyasi);
  - arxitekturani kelajakda **Yandex** kabi yangi kanal oson qo'shiladigan qilib qur.
- **ИКПУ**: har tovarda bitta maydon; bo'sh qolsa umumiy "по умолчанию" kod ishlaydi (servis-boshiga alohida IKPU QILMA — IKPU tovar xossasi).

## 4. Подключения sahifasi (texnik narsalar alohida)

- **Medicalka ulanish ustasi**: token (katalog) + sekret (buyurtmalar) **BIRGA** yaratiladi; oqim: oddiy tilda tushuntirish → tasdiq (eski kalitlar haqida ogohlantirish + ixtiyoriy "eskisini bekor qil") → ikkala kalit BITTA ekranda katta "nusxalash" tugmalari bilan → qizil banner "yopilgach sekret qayta ko'rsatilmaydi" → yopish faqat "✅ nusxaladim" belgilangach → "endi nima qilish" ko'rsatmasi. Bir bosishda darrov kalit yasab yuborish TAQIQ.
- Uzum — teskari oqim: ularning menejeri bergan client_id/client_secret kiritiladi (import formasi, izoh bilan).
- Billz sinxron holati + qo'lda yangilash; umumiy IKPU "по умолчанию" sozlamasi.

## 5. Buyurtmalar

- To'liq status zinasi: pending → Принять → Собран → Передан курьеру → Доставлен, + Отклонить (sabab bilan, tasdiq oynasi) va Вернуть. Faqat qonuniy keyingi qadam tugmalari ko'rinadi.
- Yangi buyurtma tez ko'rinadi (polling + ovoz/badge), botdan buyurtmaga deep-link. Qidiruv (ism/telefon/ID, debounce), paginatsiya, xato holati bo'sh holatdan farqlanadi, chek chop etish (print-CSS).

## 6. Qolgan bo'limlar — funksiya yo'qotilmaydi (parity)

Dashboard (davr bo'yicha statistika, poll'da eski data saqlanadi, "yangilandi N sek oldin"), Promokodlar (sana validatsiyasi, qidiruv), Podborkalar (paginatsiyali tanlash, tartiblash), Mijozlar (ro'yxat/detal, telefon), Adminlar (mijoz qidiruvidan tanlash, oxirgi adminni o'chirishdan himoya), Sozlamalar (guruhlangan, o'chirish, validatsiya), Galereya (ko'p fayl yuklash, rasmga majburiy kvadrat fon QO'YILMAYDI, havola nusxalash).

## 7. Excel

- **Export**: butun katalog .xlsx (narx, наличие, Billz qoldiq bilan).
- **Import**: majburiy dry-run — avval hisobot (nechta yangi / nechta o'zgarish / xatolar, eski→yangi diff), faqat tasdiqdan keyin qo'llanadi; hech qachon hech narsa o'chirmaydi.

## 8. Qulaylik qatlami (ko'proq funksional, ko'proq qulaylik)

Global qidiruv (Cmd+K: buyurtma/telefon/tovar/promo), 5 soniyalik undo-toast, klaviatura bilan ishlash, URL'da saqlanadigan filtrlar, forma avtosaqlash (TMA uzilishlariga chidamli), tovar dublikat qilish, kam-qoldiq va Billz-konflikt ogohlantirishlari, buyurtmada ichki eslatmalar + status tarixi (kim-qachon), pul-sezgir amallarga audit log, mijoz block bayrog'i, analitika (tushum trendi, top tovarlar), broadcast (3 oddiy segment, avval adminga test-yuborish, rate-limit).

## 9. Xavfsizlik va jarayon

- Ma'lumot YO'QOLMAYDI: DB o'zgarishlari faqat additive, hech qanday buzuvchi migratsiya; mongodump backup cron. Bot va do'kon ishlashiga zarar yetkazma.
- Avval **localhost'da to'liq qur** (in-memory Mongo + demo seed bilan, prod bot tokeniga TEGMA), men sinab ko'raman, faqat mening "OK"imdan keyin commit+push. Har bosqichni jonli tekshir (brauzer/screenshot), "ishlaydi deb o'ylayman" emas — isbotla.
- Parallel subagentlardan foydalan, lekin yakuniy tekshiruv o'zingda.

Dizaynda tvorchestvoni to'liq ishga sol: layout, ierarxiya, mikro-animatsiyalar, empty-state illyustratsiyalar — hammasi senda, faqat yuqoridagi brend ramkasi va tushunarlilik shartlari buzilmasin. Natija: 1-3 operator kuni bilan ishlaydigan, chiroyli, tez va tushunarli panel.

---
