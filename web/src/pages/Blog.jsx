import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { Flower, Baby, Bottle, Sprout, Leaf, User } from '../components/Icons.jsx';
import { useSiteContent } from '../context/SiteContentContext.jsx';
import { GUIDES } from '../content/guides.js';
import { useSeo } from '../seo/useSeo.js';

const POST_ICONS = {
  'brand-story': Leaf,
  'family-story': Baby,
  'doctor-interview': User,
  'fertility-guide': Flower,
  'prenatal-vitamins': Baby,
  'lactation-support': Bottle,
  'mens-fertility': Sprout,
};

export default function Blog() {
  const { t, lang } = useI18n();
  const content = useSiteContent();
  useSeo();
  const posts = [...content.blog, ...GUIDES].map((post) => {
    const loc = lang === 'uz' ? post.uz : post.ru;
    return {
      slug: post.slug,
      read: post.read,
      tag: loc.tag,
      title: loc.title,
      excerpt: loc.excerpt,
      Icon: POST_ICONS[post.slug] || Leaf,
    };
  });

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
