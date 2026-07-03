import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { Baby, Leaf, User } from './Icons.jsx';
import { useSiteContent } from '../context/SiteContentContext.jsx';

const CONTENT_ICONS = { 'brand-story': Leaf, 'family-story': Baby, 'doctor-interview': User };

export default function BlogTeaser() {
  const { t, lang } = useI18n();
  const content = useSiteContent();
  const posts = content.blog.slice(0, 3).map((post) => {
    const loc = lang === 'uz' ? post.uz : post.ru;
    return {
      slug: post.slug,
      read: post.read,
      tag: loc.tag,
      title: loc.title,
      Icon: CONTENT_ICONS[post.slug] || Leaf,
    };
  });

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
