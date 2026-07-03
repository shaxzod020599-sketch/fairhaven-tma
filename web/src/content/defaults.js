import { TESTIMONIALS } from '../components/home/testimonialsData.js';

/**
 * Built-in content bundle — the exact copy the site ships with.
 * The admin panel starts from this when the database is still empty, and
 * the site deep-merges whatever the admin saved over these values, so a
 * half-filled document can never break a page.
 */
export const DEFAULT_CONTENT = {
  announce: {
    ru: [
      'Бесплатная доставка от 500 000 UZS по Узбекистану',
      'Официальный дистрибьютор Fairhaven Health (USA)',
      'Консультация специалиста — ежедневно с 9:00 до 21:00',
    ],
    uz: [
      'O‘zbekiston bo‘yicha 500 000 UZS dan bepul yetkazib berish',
      'Fairhaven Health (USA) rasmiy distribyutori',
      'Mutaxassis maslahati — har kuni 9:00 dan 21:00 gacha',
    ],
  },

  hero: {
    ru: {
      titlePre: 'Репродуктивное',
      titleEm: 'здоровье',
      titlePost: 'семьи',
      desc: 'Оригинальные витамины и добавки для фертильности, беременности и лактации. Научно обоснованные формулы от официального дистрибьютора в Узбекистане.',
      cta: 'Открыть каталог',
    },
    uz: {
      titlePre: 'Oilaviy',
      titleEm: 'reproduktiv',
      titlePost: 'sog‘lik',
      desc: 'Fertillik, homiladorlik va emizish uchun original vitaminlar va qo‘shimchalar. O‘zbekistondagi rasmiy distribyutordan ilmiy asoslangan formulalar.',
      cta: 'Katalogni ochish',
    },
    stats: [
      { value: '22+', ru: 'продукта', uz: 'mahsulot' },
      { value: '100%', ru: 'оригинал', uz: 'original' },
      { value: '2003', ru: 'год основания в США', uz: 'yil — AQShda asos solingan' },
    ],
    chips: ['cGMP', 'NON-GMO', 'MADE IN USA', 'MOM’S CHOICE AWARDS®'],
  },

  testimonials: TESTIMONIALS.map(({ Icon, ...rest }) => rest),

  products3d: [
    { img: '/assets/p3d/fhpro-women.png', hero: true },
    { img: '/assets/p3d/fhpro-men.png' },
    { img: '/assets/p3d/prenatal.png' },
    { img: '/assets/p3d/fertilaid-men.png' },
    { img: '/assets/p3d/lactation.png' },
    { img: '/assets/p3d/fertilaid-women.png' },
  ],

  blog: [
    {
      slug: 'brand-story',
      read: 6,
      ru: {
        tag: 'Бренд',
        title: 'Fairhaven Health: 20 лет заботы о репродуктивном здоровье',
        excerpt: 'История американского бренда — от лаборатории в Сиэтле до официального дистрибьютора в Узбекистане.',
        body: [
          'Fairhaven Health основана в 2003 году в Сиэтле (США) с одной ясной миссией — помогать семьям на пути к родительству натуральными и научно обоснованными средствами.',
          'Сегодня в линейке бренда — более 20 продуктов: комплексы для женской и мужской фертильности (FertilAid, FH PRO, OvaBoost), пренатальные витамины, поддержка лактации (линейка Milkies) и средства для женского здоровья в период менопаузы.',
          'Формулы разрабатываются при участии медицинского директора — профессора акушерства и гинекологии Амоса Грюнебаума, а производство сертифицировано по стандарту cGMP. Часть формул, включая FH PRO, изучалась в опубликованных клинических работах.',
          'Продукция Fairhaven Health отмечена американскими родительскими наградами, среди которых Mom’s Choice Awards® за линейку Milkies.',
          'С 2025 года бренд официально представлен в Узбекистане: fairhaven.uz — официальный дистрибьютор с прямыми поставками из США, оригинальной продукцией и доставкой по всей стране. Консультация специалиста доступна ежедневно с 9:00 до 21:00.',
        ],
      },
      uz: {
        tag: 'Brend',
        title: 'Fairhaven Health: reproduktiv salomatlikka 20 yillik gʻamxoʻrlik',
        excerpt: 'Amerika brendi tarixi — Sietldagi laboratoriyadan Oʻzbekistondagi rasmiy distribyutorgacha.',
        body: [
          'Fairhaven Health 2003-yilda AQShning Sietl shahrida bitta aniq maqsad bilan tashkil etilgan — oilalarga ota-onalik sari yoʻlda tabiiy va ilmiy asoslangan vositalar bilan yordam berish.',
          'Bugun brend qatorida 20 dan ortiq mahsulot bor: ayol va erkak fertilligi uchun komplekslar (FertilAid, FH PRO, OvaBoost), prenatal vitaminlar, laktatsiyani qoʻllab-quvvatlash (Milkies liniyasi) va menopauza davridagi ayollar salomatligi vositalari.',
          'Formulalar tibbiy direktor — akusherlik va ginekologiya professori Amos Grünebaum ishtirokida ishlab chiqiladi, ishlab chiqarish esa cGMP standarti boʻyicha sertifikatlangan. FH PRO kabi ayrim formulalar eʼlon qilingan klinik ishlarda oʻrganilgan.',
          'Fairhaven Health mahsulotlari Amerika ota-onalar mukofotlari bilan taqdirlangan, jumladan Milkies liniyasi uchun Mom’s Choice Awards®.',
          '2025-yildan brend Oʻzbekistonda rasmiy taqdim etilgan: fairhaven.uz — AQShdan toʻgʻridan-toʻgʻri yetkazib beriladigan original mahsulotli rasmiy distribyutor. Mutaxassis maslahati har kuni 9:00 dan 21:00 gacha.',
        ],
      },
    },
    {
      slug: 'family-story',
      read: 8,
      ru: {
        tag: 'Истории семей',
        title: 'История одной семьи: два года ожидания — и наша Мадина',
        excerpt: 'Семья из Ташкента честно рассказывает о своём пути к родительству.',
        body: [
          'Мы поженились в 2022 году и, как многие пары, думали, что всё случится само собой. Через год ожидания появилась тревога, ещё через полгода — усталость от вопросов родственников. Эту историю нам доверила семья из Ташкента; имена изменены по их просьбе.',
          '«Сначала мы просто не понимали, куда идти. Обследовались, серьёзных диагнозов не нашли — врач сказал: работайте над образом жизни и дайте организму ресурс», — вспоминает Азиза.',
          'Врач порекомендовал паре нутриентную подготовку: мужу — антиоксидантный комплекс для качества спермы, жене — мультивитамины для фертильности с мио-инозитолом и фолатом. Так в доме появились FertilAid для мужчин и FH PRO для женщин.',
          '«Мы отнеслись к этому как к общему проекту: три месяца без пропусков, вместе поменяли питание, начали ходить по вечерам пешком. Через четыре месяца я увидела две полоски. Плакали оба», — улыбается Азиза.',
          'Сегодня их дочери Мадине восемь месяцев. «Мы не обещаем никому чуда — у каждой семьи свой путь. Но забота о себе точно того стоит. И спасибо, что оригинальные витамины теперь можно заказать дома, в Узбекистане», — говорит Бахтиёр.',
          'Если вы готовы поделиться своей историей — напишите нам через страницу «Контакты». Ваши слова поддержат тех, кто сейчас в начале пути.',
        ],
      },
      uz: {
        tag: 'Oilalar hikoyasi',
        title: 'Bir oila hikoyasi: ikki yillik intizorlik — va bizning Madinamiz',
        excerpt: 'Toshkentlik oila ota-onalik sari yoʻlini samimiy soʻzlab beradi.',
        body: [
          'Biz 2022-yilda turmush qurdik va koʻp juftliklar kabi hammasi oʻz-oʻzidan boʻladi deb oʻylagandik. Bir yillik kutishdan soʻng xavotir, yana yarim yildan soʻng qarindoshlarning savollaridan charchoq paydo boʻldi. Bu hikoyani bizga toshkentlik oila ishondi; ismlar ularning iltimosiga koʻra oʻzgartirilgan.',
          '«Avvaliga qayerga borishni ham bilmasdik. Tekshiruvdan oʻtdik, jiddiy tashxis topilmadi — shifokor: turmush tarzingiz ustida ishlang va organizmga resurs bering, dedi», — deb eslaydi Aziza.',
          'Shifokor juftlikka nutrient tayyorgarlikni tavsiya qildi: turmush oʻrtogʻiga — urugʻ sifati uchun antioksidant kompleks, ayolga — mio-inozitol va folatli fertillik multivitaminlari. Shunday qilib uyda erkaklar uchun FertilAid va ayollar uchun FH PRO paydo boʻldi.',
          '«Bunga umumiy loyiha sifatida qaradik: uch oy uzilishsiz, birga ovqatlanishni oʻzgartirdik, kechqurunlari piyoda yura boshladik. Toʻrtinchi oyda ikki chiziqni koʻrdim. Ikkalamiz ham yigʻladik», — kuladi Aziza.',
          'Bugun qizlari Madina sakkiz oylik. «Hech kimga moʻjiza vaʼda qilmaymiz — har oilaning oʻz yoʻli bor. Lekin oʻziga gʻamxoʻrlik albatta arziydi. Original vitaminlarni endi Oʻzbekistonda, uydan buyurtma qilish mumkinligi uchun rahmat», — deydi Baxtiyor.',
          'Agar siz ham hikoyangizni boʻlishishga tayyor boʻlsangiz — «Kontaktlar» sahifasi orqali yozing. Sizning soʻzlaringiz yoʻl boshidagilarga dalda boʻladi.',
        ],
      },
    },
    {
      slug: 'doctor-interview',
      read: 9,
      ru: {
        tag: 'Интервью',
        title: 'Интервью с акушером-гинекологом: добавки до и во время беременности',
        excerpt: 'Практикующий врач отвечает на самые частые вопросы о нутриентной поддержке.',
        body: [
          'Мы поговорили с практикующим акушером-гинекологом из Ташкента о том, какие нутриенты действительно важны при планировании и вынашивании беременности. Публикуем главное из беседы.',
          '— С чего начать паре, которая планирует ребёнка? — С обследования у врача и честного разговора об образе жизни. Дальше — фолат для женщины минимум за три месяца до зачатия, и, что часто забывают, подготовка мужчины: сперматогенез занимает около трёх месяцев, антиоксиданты в этот период дают ощутимый эффект.',
          '— Как вы относитесь к комплексам вроде FertilAid и FH PRO? — Положительно, когда они применяются по назначению. Мне важно, чтобы состав был прозрачным, дозировки — разумными, а производство — сертифицированным. У Fairhaven Health эти условия соблюдены, часть формул имеет опубликованные клинические наблюдения.',
          '— Что обязательно во время беременности? — Фолат, железо по показаниям, DHA для развития мозга ребёнка, витамин D и йод. Хороший пренатальный комплекс закрывает базу, но не заменяет наблюдение у врача.',
          '— Самая частая ошибка ваших пациенток? — Две крайности: «не пью ничего, всё из еды» и «пью всё, что советуют в интернете». Истина посередине: подобранный комплекс плюс контроль анализов.',
          '— Ваш главный совет парам? — Не откладывать заботу о себе до «когда получится». Подготовка — это уже забота о будущем ребёнке.',
          'Материал носит информационный характер и не заменяет консультацию врача.',
        ],
      },
      uz: {
        tag: 'Intervyu',
        title: 'Akusher-ginekolog bilan intervyu: homiladorlikdan oldin va davomida qoʻshimchalar',
        excerpt: 'Amaliyotchi shifokor nutrient qoʻllab-quvvatlash haqidagi eng koʻp savollarga javob beradi.',
        body: [
          'Toshkentlik amaliyotchi akusher-ginekolog bilan homiladorlikni rejalashtirish va olib borishda qaysi nutrientlar chindan muhimligi haqida suhbatlashdik. Suhbatning asosiy qismini eʼlon qilamiz.',
          '— Farzand rejalashtirayotgan juftlik nimadan boshlashi kerak? — Shifokor koʻrigidan va turmush tarzi haqidagi halol suhbatdan. Keyin — ayolga homiladorlikdan kamida uch oy oldin folat, va koʻpincha unutiladigani — erkakning tayyorgarligi: spermatogenez taxminan uch oy davom etadi, bu davrda antioksidantlar sezilarli samara beradi.',
          '— FertilAid va FH PRO kabi komplekslarga munosabatingiz? — Ijobiy, agar maqsadli qoʻllanilsa. Men uchun tarkib shaffof, dozalar oqilona, ishlab chiqarish sertifikatlangan boʻlishi muhim. Fairhaven Health’da bu shartlar bajarilgan, ayrim formulalarning eʼlon qilingan klinik kuzatuvlari bor.',
          '— Homiladorlik davrida nima majburiy? — Folat, koʻrsatma boʻyicha temir, bola miyasi rivoji uchun DHA, D vitamini va yod. Yaxshi prenatal kompleks bazani yopadi, lekin shifokor nazoratini almashtirmaydi.',
          '— Bemorlaringizning eng koʻp xatosi? — Ikki chegara: «hech narsa ichmayman, hammasi ovqatdan» va «internetda maslahat berilgan hamma narsani ichaman». Haqiqat oʻrtada: tanlangan kompleks plus tahlillar nazorati.',
          '— Juftliklarga bosh maslahatingiz? — Oʻzingizga gʻamxoʻrlikni «qachon boʻlsa»ga qoldirmang. Tayyorgarlik — bu boʻlajak farzandga gʻamxoʻrlikning oʻzi.',
          'Material axborot xarakteriga ega va shifokor maslahatini almashtirmaydi.',
        ],
      },
    },
  ],
};

/** Deep merge: saved content wins, defaults fill the gaps. Arrays replace. */
export function mergeContent(base, override) {
  if (override == null) return base;
  if (Array.isArray(base) || Array.isArray(override)) return override;
  if (typeof base === 'object' && typeof override === 'object') {
    const out = { ...base };
    for (const k of Object.keys(override)) {
      out[k] = mergeContent(base?.[k], override[k]);
    }
    return out;
  }
  return override;
}
