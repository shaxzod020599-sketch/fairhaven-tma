/**
 * Публичная оферта / Ommaviy oferta
 * FairHaven — витамины и добавки
 * Ташкент, Республика Узбекистан
 *
 * Based on:
 * - Гражданский кодекс РУз (ст. 367, 369, 426)
 * - Закон «О защите прав потребителей» от 26.04.1996 № 221-I
 * - Закон «О персональных данных» от 02.07.2019 № ЗРУ-547
 * - Закон «Об электронной коммерции» от 22.05.2015 № ЗРУ-385
 */

const BRAND = 'FairHaven';
const CITY = 'г. Ташкент';
const SUPPORT_PHONE = '+998 (00) 000-00-00';
const SUPPORT_EMAIL = 'support@fairhaven.uz';
const WEBSITE = 'fairhaven.uz';

function pageShell(title, body) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#F6F1E6" />
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&family=DM+Sans:opsz,wght@9..40,300..600&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #F6F1E6; color: #0E2B1F; font-family: 'DM Sans', -apple-system, sans-serif; font-size: 15px; line-height: 1.55; }
  body { padding: 28px 22px 64px; max-width: 720px; margin: 0 auto; }
  .brand { font-family: 'Fraunces', Georgia, serif; font-size: 24px; letter-spacing: -0.02em; margin-bottom: 6px; font-weight: 500; }
  .eyebrow { font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #6F8A6A; margin-bottom: 18px; }
  h1 { font-family: 'Fraunces', Georgia, serif; font-weight: 400; font-size: 28px; letter-spacing: -0.02em; line-height: 1.1; margin-bottom: 6px; }
  .subtitle { color: #3A4F45; font-size: 13px; margin-bottom: 26px; }
  .lang-tabs { display: flex; gap: 6px; margin-bottom: 22px; padding: 4px; background: #EFE7D5; border-radius: 10px; }
  .lang-tabs a { flex: 1; text-align: center; padding: 8px 12px; border-radius: 6px; font-size: 13px; font-weight: 500; color: #3A4F45; text-decoration: none; }
  .lang-tabs a.active { background: #F6F1E6; color: #0E2B1F; box-shadow: 0 1px 2px rgba(14,43,31,0.08); }
  h2 { font-family: 'Fraunces', Georgia, serif; font-weight: 500; font-size: 18px; letter-spacing: -0.01em; margin: 28px 0 10px; color: #0E2B1F; }
  p { margin-bottom: 10px; color: #1f3129; }
  ol, ul { padding-left: 20px; margin-bottom: 12px; }
  li { margin-bottom: 6px; color: #1f3129; }
  .meta { background: #FAF5EA; border: 1px solid #E4DAC2; border-radius: 12px; padding: 14px 16px; margin: 18px 0; font-size: 13px; }
  .meta strong { display: inline-block; min-width: 140px; color: #0E2B1F; }
  .small { font-size: 12px; color: #6F7d75; }
  .footer { margin-top: 40px; padding-top: 18px; border-top: 1px solid #E4DAC2; font-size: 12px; color: #6F7d75; }
  a { color: #C96F3E; }
</style>
</head>
<body>
  <div class="eyebrow">${BRAND} · APOTHECARY</div>
  ${body}
  <div class="footer">© ${new Date().getFullYear()} ${BRAND}. ${CITY}, ${WEBSITE}</div>
</body>
</html>`;
}

// ============================================================================
// RUSSIAN
// ============================================================================
const ofertaRu = `
  <div class="lang-tabs">
    <a href="/legal/oferta-ru" class="active">Русский</a>
    <a href="/legal/oferta-uz">O‘zbekcha</a>
  </div>

  <h1>Публичная оферта</h1>
  <div class="subtitle">о продаже товаров дистанционным способом через Telegram-приложение ${BRAND}</div>

  <div class="meta">
    <div><strong>Продавец:</strong> ${BRAND}</div>
    <div><strong>Адрес:</strong> ${CITY}, Республика Узбекистан</div>
    <div><strong>Поддержка:</strong> ${SUPPORT_PHONE} · ${SUPPORT_EMAIL}</div>
    <div><strong>Редакция:</strong> от ${new Date().toLocaleDateString('ru-RU')}</div>
  </div>

  <h2>1. Общие положения</h2>
  <p>Настоящий документ является публичной офертой (далее — «Оферта») ${BRAND} (далее — «Продавец») и содержит все существенные условия договора розничной купли-продажи товаров дистанционным способом через Telegram Mini App и сопутствующие каналы.</p>
  <p>Оферта составлена в соответствии с требованиями статей 367, 369 и 426 Гражданского кодекса Республики Узбекистан, Закона РУз «О защите прав потребителей» № 221-I от 26.04.1996, Закона РУз «Об электронной коммерции» № ЗРУ-385 от 22.05.2015, а также Закона РУз «О персональных данных» № ЗРУ-547 от 02.07.2019.</p>
  <p>Акцептом (безусловным принятием) настоящей Оферты Пользователь признаёт любое из следующих действий: регистрация в Telegram-боте ${BRAND}, оформление заказа, проставление согласия на условия Оферты нажатием соответствующей кнопки.</p>

  <h2>2. Термины</h2>
  <ul>
    <li><strong>Пользователь / Клиент</strong> — физическое лицо, достигшее совершеннолетия (18 лет), совершившее акцепт Оферты.</li>
    <li><strong>Товар</strong> — БАД, витамины, парафармацевтика, средства гигиены и косметика, представленные в каталоге Продавца. Товары не являются лекарственными средствами.</li>
    <li><strong>Заказ</strong> — должным образом оформленный запрос Пользователя на приобретение и доставку выбранных товаров.</li>
    <li><strong>Мини-приложение</strong> — программа внутри мессенджера Telegram, используемая для оформления заказов.</li>
  </ul>

  <h2>3. Предмет Оферты</h2>
  <p>Продавец обязуется передать в собственность Пользователя Товар, а Пользователь обязуется принять Товар и оплатить его на условиях, указанных в настоящей Оферте.</p>
  <p>Сведения о Товаре, его цене и наличии приведены в каталоге Мини-приложения. Продавец оставляет за собой право изменять ассортимент, цены и условия доставки в одностороннем порядке с уведомлением через Мини-приложение.</p>

  <h2>4. Порядок оформления и подтверждения заказа</h2>
  <ol>
    <li>Пользователь выбирает товары, указывает адрес доставки, контактный телефон и способ оплаты.</li>
    <li>Заказ считается принятым в работу с момента его подтверждения оператором Продавца (обычно до 2 часов в рабочее время).</li>
    <li>Продавец вправе отказать в подтверждении заказа, уведомив Пользователя, в случае отсутствия Товара, технических сбоев или при обоснованных сомнениях в достоверности предоставленных данных.</li>
    <li>До момента подтверждения Пользователь вправе отменить или изменить заказ, связавшись со службой поддержки.</li>
  </ol>

  <h2>5. Цена и порядок оплаты</h2>
  <p>Цены на Товары указаны в национальной валюте Республики Узбекистан (UZS) и включают все налоги, предусмотренные законодательством. Способы оплаты: (1) наличными курьеру при получении; (2) банковской картой (в том числе Uzcard/Humo) при получении или через интеграционный платёжный сервис.</p>

  <h2>6. Доставка</h2>
  <p>Доставка осуществляется по ${CITY} и пригородам силами Продавца или привлечённой курьерской службы в согласованный с Пользователем интервал времени. Стоимость и сроки доставки указываются в Мини-приложении при оформлении заказа.</p>

  <h2>7. Возврат и обмен товара</h2>
  <p>Согласно Закону РУз «О защите прав потребителей»:</p>
  <ul>
    <li>Товар надлежащего качества может быть возвращён в течение 14 (четырнадцати) дней, за исключением товаров, не подлежащих возврату по Перечню, утверждённому Кабинетом Министров РУз (в том числе ряд БАД, средства гигиены, косметика в индивидуальной упаковке со вскрытой пломбой).</li>
    <li>Товар ненадлежащего качества принимается к возврату или обмену в течение гарантийного срока, при отсутствии следов самостоятельного нарушения упаковки после вскрытия, если дефект не связан с действиями Пользователя.</li>
    <li>Возврат денежных средств производится тем же способом, которым была произведена оплата, в срок до 10 (десяти) рабочих дней.</li>
  </ul>

  <h2>8. Ответственность сторон</h2>
  <p>Стороны несут ответственность в соответствии с действующим законодательством Республики Узбекистан. Продавец не несёт ответственность за последствия применения Товара при нарушении инструкции производителя, рекомендаций врача или при наличии индивидуальных противопоказаний.</p>
  <p>Витамины и БАД не являются лекарственными средствами и не заменяют полноценный рацион. Перед применением рекомендуется консультация специалиста.</p>

  <h2>9. Персональные данные</h2>
  <p>Акцепт Оферты и нажатие кнопки «Согласен с условиями» одновременно означает предоставление Пользователем согласия Продавцу на обработку его персональных данных в объёме, необходимом для исполнения договора, в соответствии со статьёй 21 Закона РУз «О персональных данных» № ЗРУ-547 от 02.07.2019.</p>
  <p>Обработке подлежат: имя, фамилия, год рождения, пол, контактный телефон, Telegram-идентификатор, адрес доставки, история заказов. Цели обработки: оформление и исполнение заказа, информирование о статусе доставки, контроль качества сервиса, выполнение требований законодательства.</p>
  <p>Срок хранения данных — 3 (три) года с момента последнего заказа либо до момента отзыва согласия. Пользователь вправе в любой момент отозвать согласие, направив запрос на ${SUPPORT_EMAIL}; запрос рассматривается в срок до 10 рабочих дней.</p>
  <p>Продавец принимает организационные и технические меры для защиты персональных данных от неправомерного доступа, уничтожения, изменения и распространения.</p>

  <h2>10. Форс-мажор</h2>
  <p>Стороны освобождаются от ответственности за частичное или полное неисполнение обязательств, если оно стало следствием обстоятельств непреодолимой силы (стихийные бедствия, военные действия, акты государственных органов, сбои в работе систем связи и Telegram).</p>

  <h2>11. Разрешение споров</h2>
  <p>Все споры разрешаются путём переговоров. При невозможности урегулирования — в судебном порядке по месту нахождения Продавца в соответствии с законодательством Республики Узбекистан.</p>

  <h2>12. Контакты Продавца</h2>
  <p>Служба поддержки: ${SUPPORT_PHONE}<br/>E-mail: ${SUPPORT_EMAIL}<br/>Адрес: ${CITY}, Республика Узбекистан</p>

  <p class="small">Настоящая редакция Оферты вступает в силу с момента её размещения в Мини-приложении и действует до её изменения или отмены Продавцом.</p>
`;

// ============================================================================
// UZBEK (Latin)
// ============================================================================
const ofertaUz = `
  <div class="lang-tabs">
    <a href="/legal/oferta-ru">Русский</a>
    <a href="/legal/oferta-uz" class="active">O‘zbekcha</a>
  </div>

  <h1>Ommaviy oferta</h1>
  <div class="subtitle">${BRAND} Telegram ilovasi orqali tovarlarni masofadan sotish bo‘yicha</div>

  <div class="meta">
    <div><strong>Sotuvchi:</strong> ${BRAND}</div>
    <div><strong>Manzil:</strong> Toshkent sh., O‘zbekiston Respublikasi</div>
    <div><strong>Aloqa:</strong> ${SUPPORT_PHONE} · ${SUPPORT_EMAIL}</div>
    <div><strong>Tahrir:</strong> ${new Date().toLocaleDateString('uz-UZ')} dan</div>
  </div>

  <h2>1. Umumiy qoidalar</h2>
  <p>Mazkur hujjat ${BRAND} (bundan buyon — «Sotuvchi») tomonidan taqdim etilgan ommaviy oferta (bundan buyon — «Oferta») bo‘lib, tovarlarni Telegram Mini App va u bilan bog‘liq kanallar orqali masofadan chakana sotish shartnomasining barcha muhim shartlarini o‘z ichiga oladi.</p>
  <p>Oferta O‘zbekiston Respublikasi Fuqarolik kodeksining 367-, 369- va 426-moddalari, «Iste’molchilarning huquqlarini himoya qilish to‘g‘risida» 26.04.1996 y. 221-I-son Qonuni, «Elektron tijorat to‘g‘risida» 22.05.2015 y. O‘RQ-385-son Qonuni, hamda «Shaxsga doir ma’lumotlar to‘g‘risida» 02.07.2019 y. O‘RQ-547-son Qonuni talablariga muvofiq tuzilgan.</p>
  <p>Oferta aksepti (shartsiz qabul qilinishi) deb Foydalanuvchi tomonidan quyidagilardan birini bajarilishi tan olinadi: ${BRAND} Telegram botida ro‘yxatdan o‘tish, buyurtma berish, «Shartlarga roziman» tugmasini bosish.</p>

  <h2>2. Atamalar</h2>
  <ul>
    <li><strong>Foydalanuvchi / Mijoz</strong> — Ofertani aksept qilgan, 18 yoshga to‘lgan jismoniy shaxs.</li>
    <li><strong>Tovar</strong> — Sotuvchi katalogida taqdim etilgan BAQ, vitaminlar, parafarmatsevtika, gigiyena vositalari va kosmetika. Tovarlar dori vositalari hisoblanmaydi.</li>
    <li><strong>Buyurtma</strong> — Foydalanuvchining tanlangan tovarlarni sotib olish va yetkazib berish bo‘yicha tartibli rasmiylashtirilgan so‘rovi.</li>
    <li><strong>Mini-ilova</strong> — buyurtmalarni rasmiylashtirish uchun Telegram messenjeri ichidagi dastur.</li>
  </ul>

  <h2>3. Oferta predmeti</h2>
  <p>Sotuvchi Tovarni Foydalanuvchi mulkiga topshirish majburiyatini oladi, Foydalanuvchi esa Tovarni qabul qilish va mazkur Ofertada ko‘rsatilgan shartlar asosida uning qiymatini to‘lash majburiyatini oladi.</p>
  <p>Tovar haqidagi ma’lumotlar, uning narxi va mavjudligi Mini-ilovaning katalogida ko‘rsatiladi. Sotuvchi Mini-ilova orqali xabar berish bilan assortiment, narxlar va yetkazib berish shartlarini bir tomonlama o‘zgartirish huquqini o‘zida saqlab qoladi.</p>

  <h2>4. Buyurtmani rasmiylashtirish va tasdiqlash tartibi</h2>
  <ol>
    <li>Foydalanuvchi tovarlarni tanlaydi, yetkazib berish manzili, aloqa telefon raqami va to‘lov usulini ko‘rsatadi.</li>
    <li>Buyurtma Sotuvchi operatori tomonidan tasdiqlangan paytdan boshlab qabul qilingan hisoblanadi (odatda ish vaqtida 2 soat ichida).</li>
    <li>Tovar mavjud bo‘lmasa, texnik nosozliklar yuz berganda yoki taqdim etilgan ma’lumotlarning haqqoniyligiga jiddiy shubha bo‘lganda Sotuvchi Foydalanuvchini xabardor qilgan holda buyurtmani tasdiqlashdan bosh tortishga haqli.</li>
    <li>Tasdiqlanishigacha Foydalanuvchi qo‘llab-quvvatlash xizmatiga murojaat qilib buyurtmani bekor qilishi yoki o‘zgartirishi mumkin.</li>
  </ol>

  <h2>5. Narx va to‘lov tartibi</h2>
  <p>Tovarlar narxi O‘zbekiston Respublikasi milliy valyutasida (UZS) ko‘rsatiladi va qonun hujjatlarida nazarda tutilgan barcha soliqlarni o‘z ichiga oladi. To‘lov usullari: (1) kuryerga qo‘lda naqd pul; (2) qabul paytida yoki integratsiyalangan to‘lov xizmati orqali bank kartasi (Uzcard/Humo).</p>

  <h2>6. Yetkazib berish</h2>
  <p>Yetkazib berish ${CITY} va uning atroflari bo‘yicha Sotuvchi kuchlari yoki jalb qilingan kuryerlik xizmati tomonidan Foydalanuvchi bilan kelishilgan vaqt oralig‘ida amalga oshiriladi. Yetkazib berish qiymati va muddati buyurtma rasmiylashtirilayotganda Mini-ilovada ko‘rsatiladi.</p>

  <h2>7. Tovarni qaytarish va almashtirish</h2>
  <p>O‘zbekiston Respublikasi «Iste’molchilarning huquqlarini himoya qilish to‘g‘risida»gi Qonuniga muvofiq:</p>
  <ul>
    <li>Sifatli tovar 14 (o‘n to‘rt) kun ichida qaytarilishi mumkin, O‘zR Vazirlar Mahkamasi tasdiqlagan Ro‘yxat bo‘yicha qaytarishga tegishli bo‘lmagan tovarlar bundan mustasno (jumladan, ayrim BAQlar, gigiyena vositalari, individual qadoqdagi plombasi buzilgan kosmetika).</li>
    <li>Nosifat tovar kafolat muddati ichida qabul qilinadi yoki almashtiriladi, agar nuqson Foydalanuvchi harakatlari bilan bog‘liq bo‘lmasa va ochgandan so‘ng qadoqni mustaqil buzish izlari bo‘lmasa.</li>
    <li>Pulni qaytarish to‘lov qanday amalga oshirilgan bo‘lsa, shu usulda 10 (o‘n) ish kuni ichida amalga oshiriladi.</li>
  </ul>

  <h2>8. Tomonlarning javobgarligi</h2>
  <p>Tomonlar O‘zbekiston Respublikasi amaldagi qonun hujjatlariga muvofiq javobgardir. Ishlab chiqaruvchi ko‘rsatmasi, shifokor tavsiyasi buzilganda yoki individual qarshi ko‘rsatmalar mavjud bo‘lganda Tovar qo‘llanilishining oqibatlari uchun Sotuvchi javobgar emas.</p>
  <p>Vitaminlar va BAQlar dori vositasi hisoblanmaydi va to‘laqonli ovqatlanishni almashtirmaydi. Qo‘llashdan oldin mutaxassis bilan maslahatlashish tavsiya etiladi.</p>

  <h2>9. Shaxsga doir ma’lumotlar</h2>
  <p>Ofertani aksept qilish va «Shartlarga roziman» tugmasini bosish bir vaqtning o‘zida Foydalanuvchi tomonidan O‘zbekiston Respublikasi «Shaxsga doir ma’lumotlar to‘g‘risida»gi 02.07.2019 y. O‘RQ-547-son Qonunining 21-moddasiga muvofiq shartnomani bajarish uchun zarur bo‘lgan hajmda shaxsga doir ma’lumotlarini qayta ishlashga Sotuvchiga rozilik berish hisoblanadi.</p>
  <p>Qayta ishlanadigan ma’lumotlar: ism, familiya, tug‘ilgan yili, jinsi, aloqa telefoni, Telegram identifikatori, yetkazib berish manzili, buyurtmalar tarixi. Qayta ishlash maqsadlari: buyurtmani rasmiylashtirish va bajarish, yetkazib berish holati haqida xabardor qilish, xizmat sifatini nazorat qilish, qonun talablarini bajarish.</p>
  <p>Ma’lumotlarni saqlash muddati — oxirgi buyurtmadan keyin 3 (uch) yil yoki rozilik qaytarilgan paytgacha. Foydalanuvchi istalgan paytda ${SUPPORT_EMAIL} manziliga so‘rov yuborib rozilikdan voz kechishi mumkin; so‘rov 10 ish kuni ichida ko‘rib chiqiladi.</p>
  <p>Sotuvchi shaxsga doir ma’lumotlarni ruxsatsiz kirish, yo‘q qilish, o‘zgartirish va tarqatishdan himoya qilish uchun tashkiliy va texnik chora-tadbirlarni amalga oshiradi.</p>

  <h2>10. Fors-major</h2>
  <p>Tomonlar yengib bo‘lmaydigan kuch holatlari (tabiiy ofatlar, harbiy harakatlar, davlat organlari hujjatlari, aloqa tizimlari va Telegram ishidagi uzilishlar) tufayli majburiyatlarning qisman yoki to‘liq bajarilmaganligi uchun javobgarlikdan ozod etiladi.</p>

  <h2>11. Nizolarni hal etish</h2>
  <p>Barcha nizolar muzokaralar yo‘li bilan hal etiladi. Kelishuv imkoni bo‘lmaganda — Sotuvchi joylashgan hudud bo‘yicha sud tartibida, O‘zbekiston Respublikasi qonun hujjatlariga muvofiq.</p>

  <h2>12. Sotuvchi bilan aloqa</h2>
  <p>Qo‘llab-quvvatlash xizmati: ${SUPPORT_PHONE}<br/>E-mail: ${SUPPORT_EMAIL}<br/>Manzil: ${CITY}, O‘zbekiston Respublikasi</p>

  <p class="small">Oferta ushbu tahriri Mini-ilovaga joylashtirilgan paytdan boshlab kuchga kiradi va Sotuvchi tomonidan o‘zgartirilgan yoki bekor qilingan paytgacha amal qiladi.</p>
`;

function render(lang = 'ru') {
  if (lang === 'uz') return pageShell(`Ommaviy oferta — ${BRAND}`, ofertaUz);
  return pageShell(`Публичная оферта — ${BRAND}`, ofertaRu);
}

module.exports = {
  render,
  BRAND,
  SUPPORT_PHONE,
  SUPPORT_EMAIL,
};
