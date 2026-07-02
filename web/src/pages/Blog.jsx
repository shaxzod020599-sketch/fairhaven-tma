import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { Flower, Baby, Bottle, Sprout } from '../components/Icons.jsx';

const POSTS_RU = [
  { slug: 'fertility-guide', title: 'Как подготовиться к зачатию: гайд по фертильности', read: 7, tag: 'Фертильность', Icon: Flower, excerpt: 'Питание, витамины и образ жизни, которые повышают шансы на зачатие.' },
  { slug: 'prenatal-vitamins', title: 'Какие витамины нужны при беременности', read: 5, tag: 'Беременность', Icon: Baby, excerpt: 'Фолиевая кислота, железо, DHA — что действительно важно в каждом триместре.' },
  { slug: 'lactation-support', title: '5 способов увеличить лактацию', read: 6, tag: 'Лактация', Icon: Bottle, excerpt: 'Питание, питьевой режим и добавки, которые помогают кормящим мамам.' },
  { slug: 'mens-fertility', title: 'Мужская фертильность: на что обратить внимание', read: 6, tag: 'Фертильность', Icon: Sprout, excerpt: 'Как образ жизни и добавки влияют на качество спермы.' },
];

const POSTS_UZ = [
  { slug: 'fertility-guide', title: 'Homilador bo‘lishga tayyorgarlik: fertillik bo‘yicha qo‘llanma', read: 7, tag: 'Fertillik', Icon: Flower, excerpt: 'Homilador bo‘lish imkoniyatini oshiradigan ovqatlanish, vitaminlar va turmush tarzi.' },
  { slug: 'prenatal-vitamins', title: 'Homiladorlikda qaysi vitaminlar kerak', read: 5, tag: 'Homiladorlik', Icon: Baby, excerpt: 'Folat kislota, temir, DHA — har trimestrda nima muhim.' },
  { slug: 'lactation-support', title: 'Emizishni oshirishning 5 usuli', read: 6, tag: 'Emizish', Icon: Bottle, excerpt: "Emizikli onalarga yordam beradigan ovqatlanish, suv taqchilligi va qo'shimchalar." },
  { slug: 'mens-fertility', title: "Erkak fertilligi: nimalarga e'tibor berish kerak", read: 6, tag: 'Fertillik', Icon: Sprout, excerpt: "Turmush tarzi va qo'shimchalar urug' sifatiga qanday ta'sir qiladi." },
];

export default function Blog() {
  const { t, lang } = useI18n();
  const posts = lang === 'uz' ? POSTS_UZ : POSTS_RU;

  return (
    <div className="blog-page">
      <div className="container">
        <Breadcrumbs trail={[{ label: t('goHome'), to: '/' }, { label: t('navLearn') }]} />

        <header className="blog-hero">
          <h1 className="page-title">{t('blogTitle')}</h1>
          <p className="blog-desc">{t('blogDesc')}</p>
        </header>

        <div className="blog-grid">
          {posts.map((p) => (
            <Link to={`/learn/${p.slug}`} className="blog-card" key={p.slug}>
              <div className="blog-card-art" aria-hidden="true"><p.Icon width={56} height={56} /></div>
              <div className="blog-card-body">
                <span className="blog-card-tag">{p.tag}</span>
                <h2 className="blog-card-title">{p.title}</h2>
                <p className="blog-card-excerpt">{p.excerpt}</p>
                <span className="blog-card-meta">{p.read} {t('minRead')} · {t('readMore')} →</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
