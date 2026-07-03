import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { Baby, Leaf, User } from './Icons.jsx';

const POSTS_RU = [
  { slug: 'brand-story', title: 'Fairhaven Health: 20 лет заботы о репродуктивном здоровье', read: 6, tag: 'Бренд', Icon: Leaf },
  { slug: 'family-story', title: 'История одной семьи: два года ожидания — и наша Мадина', read: 8, tag: 'Истории семей', Icon: Baby },
  { slug: 'doctor-interview', title: 'Интервью с акушером-гинекологом: добавки до и во время беременности', read: 9, tag: 'Интервью', Icon: User },
];

const POSTS_UZ = [
  { slug: 'brand-story', title: 'Fairhaven Health: reproduktiv salomatlikka 20 yillik gʻamxoʻrlik', read: 6, tag: 'Brend', Icon: Leaf },
  { slug: 'family-story', title: 'Bir oila hikoyasi: ikki yillik intizorlik — va bizning Madinamiz', read: 8, tag: 'Oilalar hikoyasi', Icon: Baby },
  { slug: 'doctor-interview', title: 'Akusher-ginekolog bilan intervyu: qoʻshimchalar haqida', read: 9, tag: 'Intervyu', Icon: User },
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
