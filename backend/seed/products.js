/**
 * FairHaven Health — Uzbekistan distributor catalogue.
 * Brand focus: fertility, pregnancy, nursing, women's & men's wellness.
 *
 * Prices: shown in UZS, approximate local retail.
 * Images: Unsplash stable CDN photos. The frontend falls back to a themed
 * emoji tile when an image fails to load.
 */

// Shared image helper — always returns an Unsplash CDN URL.
function img(photoId) {
  return `https://images.unsplash.com/photo-${photoId}?auto=format&fit=crop&w=800&q=80`;
}

const FAIRHAVEN_PRODUCTS = [
  // ─── Female Fertility ─────────────────────────────────────────────────────
  {
    name: 'FertilAid for Women',
    nameUz: 'FertilAid ayollar uchun',
    price: 545000,
    category: 'supplements',
    brand: 'FairHaven Health',
    sku: 'FH-FAW-90',
    isAvailable: true,
    imageUrl: img('1584308878768-57d3e1e9f5f3'),
    description:
      'Комплексная поддержка женской репродуктивной системы. Пренатальные витамины + растительный комплекс с витексом. 90 капсул на 1 месяц.',
    descriptionUz:
      'Ayollar reproduktiv tizimini qo‘llab-quvvatlash uchun kompleks. Prenatal vitaminlar va vitex o‘simlik aralashmasi. 90 kapsula, 1 oylik.',
    tags: ['fertility', 'women', 'prenatal'],
  },
  {
    name: 'OvaBoost',
    nameUz: 'OvaBoost — ovulyatsiya yordami',
    price: 485000,
    category: 'supplements',
    brand: 'FairHaven Health',
    sku: 'FH-OVA-120',
    isAvailable: true,
    imageUrl: img('1550572017-edd951b55104'),
    description:
      'Мио-инозитол, CoQ10, мелатонин и фолат для поддержки качества яйцеклеток и регулярного цикла. 120 капсул.',
    descriptionUz:
      'Tuxum hujayralari sifati va tsikl muntazamligini qo‘llab-quvvatlash uchun Myo-Inozitol, CoQ10, melatonin va folat. 120 kapsula.',
    tags: ['fertility', 'women', 'ovulation'],
  },
  {
    name: 'FertileCM',
    nameUz: 'FertileCM',
    price: 395000,
    category: 'supplements',
    brand: 'FairHaven Health',
    sku: 'FH-FCM-90',
    isAvailable: true,
    imageUrl: img('1556909114-f6e7ad7d3136'),
    description:
      'Поддержка здоровой цервикальной слизи. L-аргинин, витамин C, N-ацетилцистеин и селен. 90 капсул.',
    descriptionUz:
      'Sog‘lom serviks shilliq qavatini qo‘llab-quvvatlovchi. L-arginin, C vitamini, N-asetilsistein va selen. 90 kapsula.',
    tags: ['fertility', 'women'],
  },
  {
    name: 'FertiliTea',
    nameUz: 'FertiliTea — fertillik choyi',
    price: 265000,
    category: 'drinks',
    brand: 'FairHaven Health',
    sku: 'FH-TEA-16',
    isAvailable: true,
    imageUrl: img('1471864190281-a93a3070b6de'),
    description:
      'Травяной чай для женской фертильности: витекс, красный клевер, красная малина, крапива и зелёный чай. 16 пакетиков.',
    descriptionUz:
      'Ayollar fertilligi uchun o‘simlik choyi: vitex, qizil sebarga, qizil malina, chakanda va ko‘k choy. 16 paket.',
    tags: ['fertility', 'tea', 'herbal'],
  },
  {
    name: 'FH Pro for Women',
    nameUz: 'FH Pro ayollar uchun',
    price: 885000,
    category: 'supplements',
    brand: 'FairHaven Health',
    sku: 'FH-PRO-W-180',
    isAvailable: true,
    imageUrl: img('1577460551100-d3f84b6e4f85'),
    description:
      'Клинически разработанный комплекс для женщин с проблемами зачатия. CoQ10, мио-инозитол, мелатонин, витамин D, фолат. 180 капсул.',
    descriptionUz:
      'Homiladorlik muammolari bo‘lgan ayollar uchun klinik ishlab chiqilgan kompleks. CoQ10, Myo-Inozitol, melatonin, D vitamini, folat. 180 kapsula.',
    tags: ['fertility', 'women', 'premium'],
  },
  {
    name: 'Myo-Inositol Powder',
    nameUz: 'Myo-Inozitol kukuni',
    price: 345000,
    category: 'supplements',
    brand: 'FairHaven Health',
    sku: 'FH-MYO-30',
    isAvailable: true,
    imageUrl: img('1596564829076-2cc1b8b4e07d'),
    description:
      'Чистый мио-инозитол в порошке. Поддержка инсулиновой чувствительности и регулярности цикла. 30 порций.',
    descriptionUz:
      'Sof Myo-Inozitol kukuni. Insulin sezgirligi va tsikl muntazamligini qo‘llab-quvvatlaydi. 30 porsiya.',
    tags: ['supplement', 'women', 'pcos'],
  },
  {
    name: 'CountDown Prenatal',
    nameUz: 'CountDown prenatal',
    price: 425000,
    category: 'vitamins',
    brand: 'FairHaven Health',
    sku: 'FH-CNT-90',
    isAvailable: true,
    imageUrl: img('1607619056574-7b8d3ee536b2'),
    description:
      'Пренатальный витаминный комплекс для планирующих беременность. Метилфолат, B-комплекс, железо, йод, DHA. 90 таблеток.',
    descriptionUz:
      'Homiladorlikni rejalashtirayotgan ayollar uchun prenatal vitamin kompleksi. Metilfolat, B-kompleks, temir, yod, DHA. 90 tabletka.',
    tags: ['prenatal', 'women', 'planning'],
  },

  // ─── Male Fertility ───────────────────────────────────────────────────────
  {
    name: 'FertilAid for Men',
    nameUz: 'FertilAid erkaklar uchun',
    price: 545000,
    category: 'supplements',
    brand: 'FairHaven Health',
    sku: 'FH-FAM-90',
    isAvailable: true,
    imageUrl: img('1628771065518-0d82f1938462'),
    description:
      'Поддержка мужской фертильности. Мака, L-карнитин, цинк, селен, CoQ10, витамины E и C. 90 капсул.',
    descriptionUz:
      'Erkaklar fertilligini qo‘llab-quvvatlash. Maka, L-karnitin, rux, selen, CoQ10, E va C vitaminlar. 90 kapsula.',
    tags: ['fertility', 'men'],
  },
  {
    name: 'Motility Boost for Men',
    nameUz: 'Motility Boost erkaklar uchun',
    price: 395000,
    category: 'supplements',
    brand: 'FairHaven Health',
    sku: 'FH-MOT-60',
    isAvailable: true,
    imageUrl: img('1559757148-5c350d0d3c56'),
    description:
      'Повышение подвижности сперматозоидов. L-карнитин, L-аргинин, коэнзим Q10. 60 капсул.',
    descriptionUz:
      'Spermatozoidlar harakatchanligini oshirish. L-karnitin, L-arginin, CoQ10. 60 kapsula.',
    tags: ['fertility', 'men'],
  },
  {
    name: 'Count Boost for Men',
    nameUz: 'Count Boost erkaklar uchun',
    price: 395000,
    category: 'supplements',
    brand: 'FairHaven Health',
    sku: 'FH-CNT-M-60',
    isAvailable: true,
    imageUrl: img('1587854692152-cbe660dbde88'),
    description:
      'Поддержка количества сперматозоидов. Мака, ашваганда, селен, цинк, виноградные косточки. 60 капсул.',
    descriptionUz:
      'Spermatozoidlar miqdorini qo‘llab-quvvatlash. Maka, ashvaganda, selen, rux, uzum urug‘i. 60 kapsula.',
    tags: ['fertility', 'men'],
  },
  {
    name: 'FH Pro for Men',
    nameUz: 'FH Pro erkaklar uchun',
    price: 885000,
    category: 'supplements',
    brand: 'FairHaven Health',
    sku: 'FH-PRO-M-180',
    isAvailable: true,
    imageUrl: img('1584308878768-57d3e1e9f5f3'),
    description:
      'Клинический премиум-комплекс для мужской фертильности. 19 активных ингредиентов, 3-месячный курс. 180 капсул.',
    descriptionUz:
      'Erkaklar fertilligi uchun premium klinik kompleks. 19 ta faol ingredient, 3 oylik kurs. 180 kapsula.',
    tags: ['fertility', 'men', 'premium'],
  },

  // ─── Pregnancy & Nursing ──────────────────────────────────────────────────
  {
    name: 'PeaPod Prenatal Vitamin',
    nameUz: 'PeaPod prenatal vitamin',
    price: 365000,
    category: 'vitamins',
    brand: 'FairHaven Health',
    sku: 'FH-PEA-60',
    isAvailable: true,
    imageUrl: img('1604147706283-d7119b5b822c'),
    description:
      'Мягкий пренатальный витамин для беременных и кормящих. Метилфолат 800 мкг, железо, DHA. 60 капсул.',
    descriptionUz:
      'Homilador va emizikli onalar uchun yumshoq prenatal vitamin. Metilfolat 800 mkg, temir, DHA. 60 kapsula.',
    tags: ['prenatal', 'pregnancy'],
  },
  {
    name: 'Nursing Time Tea',
    nameUz: 'Nursing Time — emizish choyi',
    price: 215000,
    category: 'drinks',
    brand: 'FairHaven Health',
    sku: 'FH-NTE-16',
    isAvailable: true,
    imageUrl: img('1597481499750-3e6b22637e12'),
    description:
      'Травяной чай для поддержки лактации. Пажитник, фенхель, анис, крапива, лимонник. 16 пакетиков.',
    descriptionUz:
      'Laktatsiyani qo‘llab-quvvatlovchi o‘simlik choy. Hulba, arpabadiyon, anis, chakanda, limongrass. 16 paket.',
    tags: ['nursing', 'tea', 'herbal'],
  },
  {
    name: 'Nursing Blend',
    nameUz: 'Nursing Blend — emizish kompleksi',
    price: 345000,
    category: 'supplements',
    brand: 'FairHaven Health',
    sku: 'FH-NBL-60',
    isAvailable: true,
    imageUrl: img('1559757175-5c5aa3d2a9a3'),
    description:
      'Капсулированная поддержка лактации. Пажитник, благословенный чертополох, фенхель. 60 капсул.',
    descriptionUz:
      'Laktatsiyani kapsula ko‘rinishida qo‘llab-quvvatlash. Hulba, muborak to‘sin, arpabadiyon. 60 kapsula.',
    tags: ['nursing'],
  },
  {
    name: 'Organic Fenugreek',
    nameUz: 'Organik hulba (Fenugreek)',
    price: 185000,
    category: 'supplements',
    brand: 'FairHaven Health',
    sku: 'FH-FEN-100',
    isAvailable: true,
    imageUrl: img('1596564829076-2cc1b8b4e07d'),
    description:
      'Органический пажитник. Традиционное растение для поддержки лактации. 610 мг, 100 капсул.',
    descriptionUz:
      'Organik hulba (fenugreek). Laktatsiyani qo‘llab-quvvatlovchi an’anaviy o‘simlik. 610 mg, 100 kapsula.',
    tags: ['nursing', 'herbal'],
  },

  // ─── Tracking / Parapharmaceuticals ───────────────────────────────────────
  {
    name: 'Ovulation Test Strips (20 шт.)',
    nameUz: 'Ovulyatsiya testlari (20 dona)',
    price: 125000,
    category: 'parapharmaceuticals',
    brand: 'FairHaven Health',
    sku: 'FH-OVT-20',
    isAvailable: true,
    imageUrl: img('1587854692152-cbe660dbde88'),
    description:
      'Тест-полоски для определения овуляции. Чувствительность 25 мМЕ/мл. 20 штук в упаковке.',
    descriptionUz:
      'Ovulyatsiyani aniqlash test chizig‘i. Sezgirligi 25 mIU/ml. 20 dona.',
    tags: ['tests', 'tracking'],
  },
  {
    name: 'Pregnancy Test Strips (20 шт.)',
    nameUz: 'Homiladorlik testlari (20 dona)',
    price: 105000,
    category: 'parapharmaceuticals',
    brand: 'FairHaven Health',
    sku: 'FH-PRT-20',
    isAvailable: true,
    imageUrl: img('1604147706283-d7119b5b822c'),
    description:
      'Тест-полоски для раннего определения беременности. Чувствительность 20 мМЕ/мл. 20 штук.',
    descriptionUz:
      'Homiladorlikni erta aniqlash uchun test chizig‘i. Sezgirligi 20 mIU/ml. 20 dona.',
    tags: ['tests', 'tracking'],
  },
  {
    name: 'Fertile-Focus Saliva Microscope',
    nameUz: 'Fertile-Focus so‘lak mikroskopi',
    price: 485000,
    category: 'parapharmaceuticals',
    brand: 'FairHaven Health',
    sku: 'FH-FFS-1',
    isAvailable: true,
    imageUrl: img('1581093458791-9d42e37e9b76'),
    description:
      'Персональный микроскоп для определения овуляции по слюне. Точность 98%, компактный размер помады.',
    descriptionUz:
      'So‘lak orqali ovulyatsiyani aniqlash uchun shaxsiy mikroskop. Aniqligi 98%, labli bo‘yoq hajmida.',
    tags: ['tracking', 'device'],
  },

  // ─── Intimate / Lubricant ─────────────────────────────────────────────────
  {
    name: 'BabyDance Fertility Lubricant',
    nameUz: 'BabyDance fertillik loybrikatori',
    price: 285000,
    category: 'hygiene',
    brand: 'FairHaven Health',
    sku: 'FH-BAB-6',
    isAvailable: true,
    imageUrl: img('1620916566398-39f1143ab7be'),
    description:
      'Лубрикант, совместимый со сперматозоидами и безопасный для фертильности. 6 одноразовых аппликаторов.',
    descriptionUz:
      'Spermatozoidlar va fertillik uchun xavfsiz lyubrikator. 6 ta bir martalik applikator.',
    tags: ['intimate', 'fertility'],
  },

  // ─── Milk Collection / Lifestyle ─────────────────────────────────────────
  {
    name: 'Milkies Milk-Saver',
    nameUz: 'Milkies Milk-Saver — sut yig‘g‘ich',
    price: 325000,
    category: 'parapharmaceuticals',
    brand: 'FairHaven Health · Milkies',
    sku: 'FH-MIL-1',
    isAvailable: true,
    imageUrl: img('1599940824399-b87987ceb72a'),
    description:
      'Коллектор грудного молока. Собирает «вытекающее» молоко с одной груди при кормлении с другой.',
    descriptionUz:
      'Ko‘krak suti kollektori. Bir ko‘krak bilan emizgandayoq ikkinchisidan oqayotgan sutni yig‘adi.',
    tags: ['nursing', 'device'],
  },
  {
    name: 'Milkies Nursing Pads (10 пар)',
    nameUz: 'Milkies emizish prokladkalari (10 juft)',
    price: 135000,
    category: 'hygiene',
    brand: 'FairHaven Health · Milkies',
    sku: 'FH-MPD-10',
    isAvailable: true,
    imageUrl: img('1602103893234-5ebe0c1b4571'),
    description:
      'Многоразовые бамбуковые прокладки для груди. Ультрамягкие, дышащие, 10 пар в комплекте.',
    descriptionUz:
      'Qayta ishlatiladigan bambuk ko‘krak prokladkalari. Juda yumshoq, nafas oluvchan. 10 juft.',
    tags: ['nursing', 'hygiene'],
  },

  // ─── Out of stock example (still visible, greyed out) ─────────────────────
  {
    name: 'FH Pro Couples Bundle',
    nameUz: 'FH Pro juftliklar to‘plami',
    price: 1650000,
    category: 'supplements',
    brand: 'FairHaven Health',
    sku: 'FH-PRO-BUN',
    isAvailable: false,
    imageUrl: img('1584308878768-57d3e1e9f5f3'),
    description:
      'Набор FH Pro for Women + FH Pro for Men. Полный 3-месячный клинический курс для пары.',
    descriptionUz:
      'FH Pro ayollar + FH Pro erkaklar to‘plami. Juftlik uchun to‘liq 3 oylik klinik kurs.',
    tags: ['fertility', 'bundle', 'premium'],
  },
];

module.exports = { FAIRHAVEN_PRODUCTS };
