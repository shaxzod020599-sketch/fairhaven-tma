// Home page defaults the admin panel can override, plus the announcement bar lines.
//
// Site content document, key `home` (the admin editor writes exactly this shape):
//   home: {
//     hero: {
//       ru: { line1, line2, sub, searchHint },   // line1 + line2 = the H1, sub = the lead under it,
//       uz: { line1, line2, sub, searchHint },   // searchHint = text of the search field in the hero
//     },
//     trust: [{ ru, uz }, ...],                 // 4 short facts under the hero, in this order
//     showcase: { productIds: [] },             // orbit products in order (up to 14); empty = automatic pick
//     reviews: [{ ru: { name, city, text }, uz: { name, city, text } }], // real reviews only; empty = no block
//   }
// line1, line2, sub and the trust facts may contain {brands}, {products} and {threshold}; the page fills
// them with live values (brand and product counts from the catalogue, the free delivery threshold as
// «500 000 сум»).

export const ANNOUNCE = {
  ru: [
    'Бесплатная доставка от 500 000 сум по Узбекистану',
    'Официальный дистрибьютор Fairhaven Health (USA)',
    'Консультация специалиста ежедневно с 9:00 до 21:00',
  ],
  uz: [
    'O‘zbekiston bo‘yicha 500 000 so‘mdan bepul yetkazib berish',
    'Fairhaven Health (USA) rasmiy distribyutori',
    'Mutaxassis maslahati har kuni 9:00 dan 21:00 gacha',
  ],
};

export const HOME = {
  hero: {
    ru: {
      line1: '{brands} мировых брендов.',
      line2: 'Один надёжный адрес.',
      sub: 'Оригинальные витамины и добавки. Бесплатная доставка по Узбекистану от {threshold}. Заказ на сайте или в Telegram.',
      searchHint: 'Название, бренд или состав',
    },
    uz: {
      line1: '{brands} ta jahon brendi.',
      line2: 'Bitta ishonchli manzil.',
      sub: 'Original vitaminlar va qo‘shimchalar. O‘zbekiston bo‘ylab {threshold} dan bepul yetkazib berish. Buyurtma saytda yoki Telegramda.',
      searchHint: 'Nomi, brendi yoki tarkibi',
    },
  },
  trust: [
    { ru: 'Только оригинальная продукция', uz: 'Faqat original mahsulotlar' },
    { ru: 'Официальный дистрибьютор Fairhaven Health', uz: 'Fairhaven Health rasmiy distribyutori' },
    { ru: 'Бесплатная доставка от {threshold}', uz: '{threshold} dan bepul yetkazib berish' },
    { ru: 'Оплата при получении: наличными или картой', uz: 'Qabul qilganda to‘lov: naqd yoki karta orqali' },
  ],
  showcase: { productIds: [] },
  reviews: [],
};
