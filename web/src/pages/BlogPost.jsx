import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { Flower, Baby, Bottle, Sprout, Leaf, User } from '../components/Icons.jsx';

const POSTS_RU = {
  'brand-story': {
    title: 'Fairhaven Health: 20 лет заботы о репродуктивном здоровье',
    tag: 'Бренд',
    Icon: Leaf,
    read: 6,
    body: [
      'Fairhaven Health основана в 2003 году в Сиэтле (США) с одной ясной миссией — помогать семьям на пути к родительству натуральными и научно обоснованными средствами.',
      'Сегодня в линейке бренда — более 20 продуктов: комплексы для женской и мужской фертильности (FertilAid, FH PRO, OvaBoost), пренатальные витамины, поддержка лактации (линейка Milkies) и средства для женского здоровья в период менопаузы.',
      'Формулы разрабатываются при участии медицинского директора — профессора акушерства и гинекологии Амоса Грюнебаума, а производство сертифицировано по стандарту cGMP. Часть формул, включая FH PRO, изучалась в опубликованных клинических работах.',
      'Продукция Fairhaven Health отмечена американскими родительскими наградами, среди которых Mom’s Choice Awards® за линейку Milkies.',
      'С 2025 года бренд официально представлен в Узбекистане: fairhaven.uz — официальный дистрибьютор с прямыми поставками из США, оригинальной продукцией и доставкой по всей стране. Консультация специалиста доступна ежедневно с 9:00 до 21:00.',
    ],
  },
  'family-story': {
    title: 'История одной семьи: два года ожидания — и наша Мадина',
    tag: 'Истории семей',
    Icon: Baby,
    read: 8,
    body: [
      'Мы поженились в 2022 году и, как многие пары, думали, что всё случится само собой. Через год ожидания появилась тревога, ещё через полгода — усталость от вопросов родственников. Эту историю нам доверила семья из Ташкента; имена изменены по их просьбе.',
      '«Сначала мы просто не понимали, куда идти. Обследовались, серьёзных диагнозов не нашли — врач сказал: работайте над образом жизни и дайте организму ресурс», — вспоминает Азиза.',
      'Врач порекомендовал паре нутриентную подготовку: мужу — антиоксидантный комплекс для качества спермы, жене — мультивитамины для фертильности с мио-инозитолом и фолатом. Так в доме появились FertilAid для мужчин и FH PRO для женщин.',
      '«Мы отнеслись к этому как к общему проекту: три месяца без пропусков, вместе поменяли питание, начали ходить по вечерам пешком. Через четыре месяца я увидела две полоски. Плакали оба», — улыбается Азиза.',
      'Сегодня их дочери Мадине восемь месяцев. «Мы не обещаем никому чуда — у каждой семьи свой путь. Но забота о себе точно того стоит. И спасибо, что оригинальные витамины теперь можно заказать дома, в Узбекистане», — говорит Бахтиёр.',
      'Если вы готовы поделиться своей историей — напишите нам через страницу «Контакты». Ваши слова поддержат тех, кто сейчас в начале пути.',
    ],
  },
  'doctor-interview': {
    title: 'Интервью с акушером-гинекологом: добавки до и во время беременности',
    tag: 'Интервью',
    Icon: User,
    read: 9,
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
  'fertility-guide': {
    title: 'Как подготовиться к зачатию: гайд по фертильности',
    tag: 'Фертильность',
    Icon: Flower,
    read: 7,
    body: [
      'Подготовка к зачатию начинается за 3–6 месяцев до планируемой беременности. В этот период важно уделить внимание питанию, образу жизни и приёму ключевых нутриентов.',
      'Фолиевая кислота (витамин B9) — обязательный элемент подготовки. Она снижает риск дефектов нервной трубки и поддерживает деление клеток. Рекомендуемая доза — 400–800 мкг в день.',
      'Мужчинам не менее важна подготовка. Качество спермы обновляется примерно за 72–90 дней, поэтому приём антиоксидантов (CoQ10, витамины C и E, селен, цинк) за 3 месяца до зачатия ощутимо повышает показатели.',
      'Образ жизни тоже играет роль: качественный сон (7–9 часов), умеренная физическая активность, отказ от курения и алкоголя. Хронический стресс нарушает гормональный баланс, поэтому важно находить время для отдыха.',
      'Fairhaven Health предлагает линейки FertilAid для мужчин и женщин, OvaBoost для поддержки качества яйцеклеток, а также FH PRO — премиальные формулы с клинически изученными ингредиентами.',
    ],
  },
  'prenatal-vitamins': {
    title: 'Какие витамины нужны при беременности',
    tag: 'Беременность',
    Icon: Baby,
    read: 5,
    body: [
      'Во время беременности потребность в нутриентах возрастает. Однако это не значит «есть за двоих» — важнее качество и сбалансированность.',
      'Фолиевая кислота остаётся приоритетом в первом триместре. Железо необходимо для профилактики анемии — его дефицит часто встречается во второй половине беременности.',
      'DHA (омега-3) критически важна для развития мозга и зрения ребёнка. Качественные пренатальные комплексы включают DHA из рыбьего жира или водорослей.',
      'Кальций, витамин D и йод поддерживают формирование костей и щитовидной железы. Не превышайте дозировки без консультации врача.',
      'Линейка PeaPod от Fairhaven Health разработана специально для беременных и содержит сбалансированный состав витаминов и минералов.',
    ],
  },
  'lactation-support': {
    title: '5 способов увеличить лактацию',
    tag: 'Лактация',
    Icon: Bottle,
    read: 6,
    body: [
      'Грудное молоко — лучшее питание для малыша в первый год жизни. Если молока мало, попробуйте эти проверенные способы.',
      '1. Частое прикладывание. Чем чаще ребёнок сосёт, тем больше вырабатывается молока. Кормите по требованию, особенно ночью.',
      '2. Питьевой режим. Кормящей маме нужно 2–3 литра жидкости в день. Тёплый чай, компоты, вода — отлично подходят.',
      '3. Лактогонные продукты и травы. Фенхель, пажитник (fenugreek), крапива традиционно используются для поддержки лактации.',
      '4. Полноценный отдых и питание. Недосып и недостаток калорий снижают выработку молока.',
      '5. Специальные добавки. Nursing Blend и Nursing Tea от Fairhaven Health содержат пажитник, фенхель и другие травы, поддерживающие лактацию.',
    ],
  },
  'mens-fertility': {
    title: 'Мужская фертильность: на что обратить внимание',
    tag: 'Фертильность',
    Icon: Sprout,
    read: 6,
    body: [
      'Около 40–50% случаев бесплодия в паре связаны с мужским фактором. Хорошая новость: качество спермы поддаётся коррекции.',
      'Ключевые показатели — количество, подвижность и морфология сперматозоидов. Они зависят от питания, стресса, температуры яичек и приёма нутриентов.',
      'Антиоксиданты защищают сперматозоиды от окислительного повреждения. CoQ10, L-карнитин, витамины C и E, селен, цинк — наиболее изученные.',
      'Избегайте перегрева: горячие ванны, тесное бельё, ноутбук на коленях. Откажитесь от курения — оно напрямую снижает показатели.',
      'FertilAid для мужчин, CountBoost и MotilityBoost — комплексные добавки, разработанные специально для поддержки мужской репродукции.',
    ],
  },
};

const POSTS_UZ = {
  'brand-story': {
    title: 'Fairhaven Health: reproduktiv salomatlikka 20 yillik gʻamxoʻrlik',
    tag: 'Brend',
    Icon: Leaf,
    read: 6,
    body: [
      'Fairhaven Health 2003-yilda AQShning Sietl shahrida bitta aniq maqsad bilan tashkil etilgan — oilalarga ota-onalik sari yoʻlda tabiiy va ilmiy asoslangan vositalar bilan yordam berish.',
      'Bugun brend qatorida 20 dan ortiq mahsulot bor: ayol va erkak fertilligi uchun komplekslar (FertilAid, FH PRO, OvaBoost), prenatal vitaminlar, laktatsiyani qoʻllab-quvvatlash (Milkies liniyasi) va menopauza davridagi ayollar salomatligi vositalari.',
      'Formulalar tibbiy direktor — akusherlik va ginekologiya professori Amos Grünebaum ishtirokida ishlab chiqiladi, ishlab chiqarish esa cGMP standarti boʻyicha sertifikatlangan. FH PRO kabi ayrim formulalar eʼlon qilingan klinik ishlarda oʻrganilgan.',
      'Fairhaven Health mahsulotlari Amerika ota-onalar mukofotlari bilan taqdirlangan, jumladan Milkies liniyasi uchun Mom’s Choice Awards®.',
      '2025-yildan brend Oʻzbekistonda rasmiy taqdim etilgan: fairhaven.uz — AQShdan toʻgʻridan-toʻgʻri yetkazib beriladigan original mahsulotli rasmiy distribyutor. Mutaxassis maslahati har kuni 9:00 dan 21:00 gacha.',
    ],
  },
  'family-story': {
    title: 'Bir oila hikoyasi: ikki yillik intizorlik — va bizning Madinamiz',
    tag: 'Oilalar hikoyasi',
    Icon: Baby,
    read: 8,
    body: [
      'Biz 2022-yilda turmush qurdik va koʻp juftliklar kabi hammasi oʻz-oʻzidan boʻladi deb oʻylagandik. Bir yillik kutishdan soʻng xavotir, yana yarim yildan soʻng qarindoshlarning savollaridan charchoq paydo boʻldi. Bu hikoyani bizga toshkentlik oila ishondi; ismlar ularning iltimosiga koʻra oʻzgartirilgan.',
      '«Avvaliga qayerga borishni ham bilmasdik. Tekshiruvdan oʻtdik, jiddiy tashxis topilmadi — shifokor: turmush tarzingiz ustida ishlang va organizmga resurs bering, dedi», — deb eslaydi Aziza.',
      'Shifokor juftlikka nutrient tayyorgarlikni tavsiya qildi: turmush oʻrtogʻiga — urugʻ sifati uchun antioksidant kompleks, ayolga — mio-inozitol va folatli fertillik multivitaminlari. Shunday qilib uyda erkaklar uchun FertilAid va ayollar uchun FH PRO paydo boʻldi.',
      '«Bunga umumiy loyiha sifatida qaradik: uch oy uzilishsiz, birga ovqatlanishni oʻzgartirdik, kechqurunlari piyoda yura boshladik. Toʻrtinchi oyda ikki chiziqni koʻrdim. Ikkalamiz ham yigʻladik», — kuladi Aziza.',
      'Bugun qizlari Madina sakkiz oylik. «Hech kimga moʻjiza vaʼda qilmaymiz — har oilaning oʻz yoʻli bor. Lekin oʻziga gʻamxoʻrlik albatta arziydi. Original vitaminlarni endi Oʻzbekistonda, uydan buyurtma qilish mumkinligi uchun rahmat», — deydi Baxtiyor.',
      'Agar siz ham hikoyangizni boʻlishishga tayyor boʻlsangiz — «Kontaktlar» sahifasi orqali yozing. Sizning soʻzlaringiz yoʻl boshidagilarga dalda boʻladi.',
    ],
  },
  'doctor-interview': {
    title: 'Akusher-ginekolog bilan intervyu: homiladorlikdan oldin va davomida qoʻshimchalar',
    tag: 'Intervyu',
    Icon: User,
    read: 9,
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
  'fertility-guide': {
    title: 'Homilador bo‘lishga tayyorgarlik: fertillik bo‘yicha qo‘llanma',
    tag: 'Fertillik',
    Icon: Flower,
    read: 7,
    body: [
      "Homilador bo'lishga tayyorgarlik rejalashtirilgan homiladorlikdan 3–6 oy oldin boshlanadi. Bu davrda ovqatlanish, turmush tarzi va asosiy ozuqaviy moddalarga e'tibor berish muhim.",
      "Folat kislota (B9 vitamini) — tayyorgarlikning majburiy elementi. U nerv naychasi nuqsonlari xavfini kamaytiradi va hujayra bo'linishini qo'llab-quvvatlaydi. Tavsiya etilgan doza — kuniga 400–800 mkg.",
      "Erkaklar uchun ham tayyorgarlik muhim. Urug' sifati taxminan 72–90 kunda yangilanadi, shuning uchun homiladorlikdan 3 oy oldin antioksidantlar (CoQ10, C va E vitaminlari, selen, rux) qabul qilish ko'rsatkichlarni sezilarli oshiradi.",
      "Turmush tarzi ham muhim rol o'ynaydi: sifatli uyqu (7–9 soat), o'rtacha jismoniy faollik, chekish va spirtli ichimliklardan voz kechish. Surunkali stress gormonal balansni buzadi.",
      "Fairhaven Health erkaklar va ayollar uchun FertilAid, tuxum sifatini qo'llab-quvvatlash uchun OvaBoost va klinik jihatdan o'rganilgan ingredientlarga ega premium FH PRO formulalarini taklif qiladi.",
    ],
  },
  'prenatal-vitamins': {
    title: 'Homiladorlikda qaysi vitaminlar kerak',
    tag: 'Homiladorlik',
    Icon: Baby,
    read: 5,
    body: [
      "Homiladorlik davrida ozuqaviy moddalarga bo'lgan ehtiyoj ortadi. Biroq bu 'ikki kishi uchun eyish' degani emas — sifat va muvozanat muhimroq.",
      "Folat kislota birinchi trimestrda ustuvor bo'lib qoladi. Temir kamqonlikning oldini olish uchun zarur — uning yetishmasligi homiladorlikning ikkinchi yarmida tez uchraydi.",
      "DHA (omega-3) bola miyasi va ko'rish rivojlanishi uchun juda muhim. Sifatli prenatal komplekslar baliq yog'i yoki suv o'tlaridan DHA ni o'z ichiga oladi.",
      "Kalsiy, D vitamini va yod suyaklar va qalqonsimon bez shakllanishini qo'llab-quvvatlaydi. Shifokor maslahatisiz dozalarni oshirmang.",
      "PeaPod Fairhaven Health'dan homilador ayollar uchun maxsus ishlab chiqilgan va vitaminlar hamda minerallarning muvozanatli tarkibini o'z ichiga oladi.",
    ],
  },
  'lactation-support': {
    title: 'Emizishni oshirishning 5 usuli',
    tag: 'Emizish',
    Icon: Bottle,
    read: 6,
    body: [
      "Ona suyi — birinchi yilda chaqaloq uchun eng yaxshi ovqat. Agar suy kam bo'lsa, quyidagi sinab ko'rilgan usullarni qo'llang.",
      "1. Tez-tez emizish. Chaqaloq qancha tez-tez emsa, suy shuncha ko'p ishlab chiqariladi. Talab bo'yicha emizing, ayniqsa tunda.",
      "2. Suv taqchilligi. Emizikli onaga kuniga 2-3 litr suyuqlik kerak. Issiq choy, kompotlar, suv — ajoyib mos keladi.",
      "3. Sut ishlab chiqaruvchi mahsulotlar va o'tlar. Zira, uruq (fenugreek), qichitqi o't an'anaviy ravishda emizishni qo'llab-quvvatlash uchun ishlatiladi.",
      "4. To'liq dam olish va ovqatlanish. Uyqu va kaloriya yetishmasligi suy ishlab chiqarishni kamaytiradi.",
      "5. Maxsus qo'shimchalar. Fairhaven Health Nursing Blend va Nursing Tea emizishni qo'llab-quvvatlaydigan uruq, zira va boshqa o'tlarni o'z ichiga oladi.",
    ],
  },
  'mens-fertility': {
    title: "Erkak fertilligi: nimalarga e'tibor berish kerak",
    tag: 'Fertillik',
    Icon: Sprout,
    read: 6,
    body: [
      "Juftlikdagi bepushtlik holatlarining 40–50% i erkak omili bilan bog'liq. Yaxshiyamki, urug' sifatini tuzatish mumkin.",
      "Asosiy ko'rsatkichlar — miqdori, harakatchanligi va spermatozoidlar morfologiyasi. Ularning ovqatlanish, stress, tuxumlar harorati va ozuqaviy moddalarni qabul qilishiga bog'liq.",
      "Antioksidantlar spermatozoidlarni oksidlovchi shikastdan himoya qiladi. CoQ10, L-karnitin, C va E vitaminlari, selen, rux eng ko'p o'rganilgan.",
      "Issiqdan qoching: issiq hammom, tor ichki kiyim, tizzada noutbuk. Chekishdan voz keching — u to'g'ridan-to'g'ri ko'rsatkichlarni kamaytiradi.",
      "FertilAid erkaklar uchun, CountBoost va MotilityBoost — erkak ko'payishini qo'llab-quvvatlash uchun maxsus ishlab chiqilgan kompleks qo'shimchalar.",
    ],
  },
};

export default function BlogPost() {
  const { slug } = useParams();
  const { t, lang } = useI18n();
  const source = lang === 'uz' ? POSTS_UZ : POSTS_RU;
  const post = source[slug];

  if (!post) {
    return (
      <div className="container">
        <h1 className="page-title">{t('notFoundTitle')}</h1>
        <Link to="/learn" className="btn btn-primary">{t('navLearn')}</Link>
      </div>
    );
  }

  return (
    <div className="blog-post-page">
      <div className="container container-narrow">
        <Breadcrumbs
          trail={[
            { label: t('goHome'), to: '/' },
            { label: t('navLearn'), to: '/learn' },
            { label: post.title },
          ]}
        />

        <article className="blog-post">
          <header className="blog-post-head">
            <span className="blog-card-tag">{post.tag}</span>
            <h1 className="blog-post-title">{post.title}</h1>
            <span className="blog-post-meta">{post.read} {t('minRead')}</span>
            <div className="blog-post-art" aria-hidden="true">
              {post.Icon ? <post.Icon width={80} height={80} /> : post.art}
            </div>
          </header>

          <div className="blog-post-body">
            {post.body.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </article>

        <div className="blog-post-back">
          <Link to="/learn" className="btn btn-outline">← {t('navLearn')}</Link>
        </div>
      </div>
    </div>
  );
}
