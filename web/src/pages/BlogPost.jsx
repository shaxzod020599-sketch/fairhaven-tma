import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { Flower, Baby, Bottle, Sprout, Leaf, User } from '../components/Icons.jsx';
import { useSiteContent } from '../context/SiteContentContext.jsx';

const POSTS_RU = {
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

const CONTENT_ICONS = { 'brand-story': Leaf, 'family-story': Baby, 'doctor-interview': User };

export default function BlogPost() {
  const { slug } = useParams();
  const { t, lang } = useI18n();
  const content = useSiteContent();

  // Admin-managed posts win; the built-in health guides remain as fallback.
  const managed = content.blog.find((p) => p.slug === slug);
  const managedLoc = managed ? (lang === 'uz' ? managed.uz : managed.ru) : null;
  const source = lang === 'uz' ? POSTS_UZ : POSTS_RU;
  const post = managedLoc
    ? {
        title: managedLoc.title,
        tag: managedLoc.tag,
        read: managed.read,
        body: managedLoc.body || [],
        Icon: CONTENT_ICONS[slug] || Leaf,
      }
    : source[slug];

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
