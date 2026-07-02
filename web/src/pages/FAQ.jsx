import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';

const FAQS_RU = [
  {
    cat: 'faqDelivery',
    items: [
      { q: 'Куда вы доставляете?', a: 'По всему Узбекистану. По Ташкенту — обычно в день заказа или на следующий день, в регионы — 1–3 дня.' },
      { q: 'Сколько стоит доставка?', a: 'Бесплатно от 500 000 UZS. Ниже этой суммы — 25 000 UZS.' },
      { q: 'Какие сроки доставки?', a: 'Ташкент: 2–4 часа после подтверждения. Регионы: 1–3 рабочих дня.' },
    ],
  },
  {
    cat: 'faqPayment',
    items: [
      { q: 'Как можно оплатить?', a: 'Наличными или картой при получении. Оплата после проверки товара.' },
      { q: 'Нужна ли предоплата?', a: 'Нет. Вы оплачиваете заказ только при получении.' },
    ],
  },
  {
    cat: 'faqReturns',
    items: [
      { q: 'Можно ли вернуть товар?', a: 'Вскрытые упаковки возврату не подлежат. При браке или ошибке — замена в течение 14 дней.' },
      { q: 'Что если товар повреждён?', a: 'Проверяйте при получении. При повреждении — отказывайтесь от приёмки или связывайтесь с нами в течение 24 часов.' },
    ],
  },
  {
    cat: 'faqUsage',
    items: [
      { q: 'Это оригинальная продукция?', a: 'Да. Мы — официальный дилер Fairhaven Health (USA). Вся продукция сертифицирована.' },
      { q: 'Нужна ли консультация врача?', a: 'Рекомендуем проконсультироваться со специалистом. Наши консультанты также помогут подобрать продукт и дозировку.' },
      { q: 'Есть ли противопоказания?', a: 'Перед приёмом добавок проконсультируйтесь с врачом, особенно при беременности, лактации или хронических заболеваниях.' },
    ],
  },
];

const FAQS_UZ = [
  {
    cat: 'faqDelivery',
    items: [
      { q: 'Qayerga yetkazib berasiz?', a: "O'zbekiston bo'ylab. Toshkentda — odatda buyurtma kunida yoki ertasi kuni, viloyatlarga — 1–3 kun." },
      { q: "Yetkazib berish narxi qancha?", a: '500 000 UZS dan bepul. Undan past bo‘lsa — 25 000 UZS.' },
      { q: 'Yetkazib berish muddatlari?', a: 'Toshkent: tasdiqlangandan keyin 2–4 soat. Viloyatlar: 1–3 ish kuni.' },
    ],
  },
  {
    cat: 'faqPayment',
    items: [
      { q: 'Qanday to‘lash mumkin?', a: 'Olganda naqd pul yoki karta. Maxsulotni tekshirgandan keyin to‘lov.' },
      { q: 'Oldindan to‘lash kerakmi?', a: "Yo'q. Buyurtmani olganingizdagina to'laysiz." },
    ],
  },
  {
    cat: 'faqReturns',
    items: [
      { q: 'Maxsulotni qaytarish mumkinmi?', a: "Ochiqlangan qadoqlar qaytarilmaydi. Brak yoki xato bo'lsa — 14 kun ichida almashtirish." },
      { q: 'Maxsulot shikastlangan bo‘lsa-chi?', a: "Olganda tekshiring. Shikast bo'lsa — qabul qilmang yoki 24 soat ichida biz bilan bog'laning." },
    ],
  },
  {
    cat: 'faqUsage',
    items: [
      { q: 'Bu original mahsulotmi?', a: "Ha. Biz — Fairhaven Health (USA) rasmiy distribyutori. Barcha mahsulotlar sertifikatlangan." },
      { q: 'Shifokor maslahati kerakmi?', a: "Mutaxassis bilan maslahatlashishni tavsiya qilamiz. Konsultantlarimiz ham mahsulot va dozani tanlashga yordam beradi." },
      { q: 'Qarshi ko‘rsatmalar bormi?', a: "Qo'shimchalar qabul qilishdan oldin shifokor bilan maslahatlashing, ayniqsa homiladorlik, emizish yoki surunkali kasalliklarda." },
    ],
  },
];

export default function FAQ() {
  const { t, lang } = useI18n();
  const { get } = useSettings();
  const faqs = lang === 'uz' ? FAQS_UZ : FAQS_RU;
  const [open, setOpen] = useState('0-0');

  return (
    <div className="faq-page">
      <div className="container container-narrow">
        <Breadcrumbs trail={[{ label: t('goHome'), to: '/' }, { label: t('faqTitle') }]} />

        <header className="faq-hero">
          <h1 className="page-title">{t('faqTitle')}</h1>
        </header>

        {faqs.map((group, gi) => (
          <section className="faq-group" key={gi}>
            <h2 className="faq-group-title">{t(group.cat)}</h2>
            <div className="faq-list">
              {group.items.map((item, ii) => {
                const key = `${gi}-${ii}`;
                const isOpen = open === key;
                return (
                  <div className={`faq-item ${isOpen ? 'open' : ''}`} key={key}>
                    <button
                      className="faq-q"
                      onClick={() => setOpen(isOpen ? '' : key)}
                      type="button"
                      aria-expanded={isOpen}
                    >
                      {item.q}
                      <span className="faq-q-icon" aria-hidden="true">{isOpen ? '−' : '+'}</span>
                    </button>
                    {isOpen && <div className="faq-a">{item.a}</div>}
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        <div className="faq-contact-cta">
          <p>{t('contactDesc')}</p>
          <Link to="/contact" className="btn btn-primary">{t('navContact')} →</Link>
          <a href={`tel:${get('support_phone_tel')}`} className="btn btn-outline">{get('support_phone')}</a>
        </div>
      </div>
    </div>
  );
}
