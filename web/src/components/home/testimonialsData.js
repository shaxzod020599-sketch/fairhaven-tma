/**
 * Voices of trust — the homepage cascade.
 * Expert endorsements, published research, awards and family stories about
 * Fairhaven Health products. Content is data-driven: edit here, both
 * languages side by side. `kind` switches the card layout:
 *   quote | research | award | family
 */
export const TESTIMONIALS = [
  {
    kind: 'quote',
    accent: 'pink',
    ru: {
      text: 'Каждая формула Fairhaven Health создаётся на основе клинических данных — так, как я требовал бы для собственных пациентов.',
      name: 'Доктор Амос Грюнебаум, MD',
      role: 'Профессор акушерства и гинекологии · медицинский директор Fairhaven Health',
    },
    uz: {
      text: 'Fairhaven Health har bir formulasi klinik maʼlumotlar asosida yaratiladi — men buni oʻz bemorlarim uchun ham xuddi shunday talab qilgan boʻlardim.',
      name: 'Doktor Amos Grünebaum, MD',
      role: 'Akusherlik va ginekologiya professori · Fairhaven Health tibbiy direktori',
    },
  },
  {
    kind: 'research',
    accent: 'mint',
    stat: '3',
    ru: {
      statLabel: 'месяца приёма в опубликованном пилотном исследовании FH PRO',
      text: 'Опубликованные клинические наблюдения показали улучшение ключевых показателей фертильности после трёх месяцев приёма антиоксидантного комплекса FH PRO.',
      name: 'Клинические данные',
      role: 'Рецензируемая публикация · FH PRO',
    },
    uz: {
      statLabel: 'oy — FH PRO boʻyicha eʼlon qilingan pilot tadqiqot davomiyligi',
      text: 'Eʼlon qilingan klinik kuzatuvlar FH PRO antioksidant kompleksini uch oy qabul qilgandan soʻng fertillikning asosiy koʻrsatkichlari yaxshilanganini koʻrsatdi.',
      name: 'Klinik maʼlumotlar',
      role: 'Taqrizlangan nashr · FH PRO',
    },
  },
  {
    kind: 'quote',
    accent: 'blue',
    ru: {
      text: 'Своим парам при планировании я советую только препараты с прозрачным составом. FertilAid — из тех, что не стыдно рекомендовать.',
      name: 'Врач акушер-гинеколог',
      role: 'Практикующий специалист · Ташкент',
    },
    uz: {
      text: 'Rejalashtirayotgan juftliklarga faqat tarkibi shaffof preparatlarni maslahat beraman. FertilAid — bemalol tavsiya qilsa boʻladiganlardan.',
      name: 'Akusher-ginekolog shifokor',
      role: 'Amaliyotchi mutaxassis · Toshkent',
    },
  },
  {
    kind: 'award',
    accent: 'lavender',
    ru: {
      text: 'Линейка Milkies для кормящих мам отмечена американскими родительскими наградами — выбор мам, проверенный временем.',
      name: 'Mom’s Choice Awards®',
      role: 'США · линейка Milkies',
    },
    uz: {
      text: 'Emizikli onalar uchun Milkies liniyasi AQSh ota-onalar mukofotlari bilan taqdirlangan — vaqt sinovidan oʻtgan onalar tanlovi.',
      name: 'Mom’s Choice Awards®',
      role: 'AQSh · Milkies liniyasi',
    },
  },
  {
    kind: 'family',
    accent: 'pink',
    ru: {
      text: 'Принимали FertilAid с мужем три месяца — результат превзошёл ожидания. Спасибо за оригинал и честную доставку!',
      name: 'Анна',
      role: 'Ташкент · семья Fairhaven',
    },
    uz: {
      text: 'Erim bilan FertilAid’ni uch oy qabul qildik — natija kutganimizdan ham yaxshi boʻldi. Original mahsulot va halol yetkazib berish uchun rahmat!',
      name: 'Anna',
      role: 'Toshkent · Fairhaven oilasi',
    },
  },
  {
    kind: 'family',
    accent: 'mint',
    ru: {
      text: 'PeaPod пью всю беременность. Врач одобрил состав, а доставка на дом — просто спасение.',
      name: 'Дилфуза',
      role: 'Самарканд · будущая мама',
    },
    uz: {
      text: 'PeaPod’ni butun homiladorlik davomida ichyapman. Shifokor tarkibini maʼqulladi, uyga yetkazib berish esa — chinakam najot.',
      name: 'Dilfuza',
      role: 'Samarqand · boʻlajak ona',
    },
  },
];
