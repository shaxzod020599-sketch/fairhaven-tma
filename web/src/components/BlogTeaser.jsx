import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { Flower, Baby, Bottle } from './Icons.jsx';

const POSTS_RU = [
  { slug: 'fertility-guide', title: 'Как подготовиться к зачатию: гайд по фертильности', read: 7, tag: 'Фертильность', Icon: Flower },
  { slug: 'prenatal-vitamins', title: 'Какие витамины нужны при беременности', read: 5, tag: 'Беременность', Icon: Baby },
  { slug: 'lactation-support', title: '5 способов увеличить лактацию', read: 6, tag: 'Лактация', Icon: Bottle },
];

const POSTS_UZ = [
  { slug: 'fertility-guide', title: 'Homilador bo‘lishga tayyorgarlik: fertillik bo‘yicha qo‘llanma', read: 7, tag: 'Fertillik', Icon: Flower },
  { slug: 'prenatal-vitamins', title: 'Homiladorlikda qaysi vitaminlar kerak', read: 5, tag: 'Homiladorlik', Icon: Baby },
  { slug: 'lactation-support', title: 'Emizishni oshirishning 5 usuli', read: 6, tag: 'Emizish', Icon: Bottle },
];

export default function BlogTeaser() {
  const { t, lang } = useI18n();
  const posts = lang === 'uz' ? POSTS_UZ : POSTS_RU;

  return (
    <div className="blog-teaser-grid">
      {posts.map((p) => (
        <Link to={`/learn/${p.slug}`} className="blog-teaser-card" key={p.slug}>
          <div className="blog-teaser-art" aria-hidden="true"><p.Icon width={56} height={56} /></div>
          <div className="blog-teaser-body">
            <span className="blog-teaser-tag">{p.tag}</span>
            <h3 className="blog-teaser-title">{p.title}</h3>
            <span className="blog-teaser-meta">{p.read} {t('minRead')}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
