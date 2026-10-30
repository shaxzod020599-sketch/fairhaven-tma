import React from 'react';
import { useParams, Link } from 'react-router-dom';
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

export default function BlogPost() {
  const { slug } = useParams();
  const { t, lang } = useI18n();
  const content = useSiteContent();

  // Admin-managed posts win; the built-in health guides remain as fallback.
  const entry = content.blog.find((p) => p.slug === slug) || GUIDES.find((p) => p.slug === slug);
  const loc = entry ? (lang === 'uz' ? entry.uz : entry.ru) : null;
  const post = loc
    ? {
        title: loc.title,
        tag: loc.tag,
        read: entry.read,
        body: loc.body || [],
        video: entry.video || '',
        Icon: POST_ICONS[slug] || Leaf,
      }
    : null;
  useSeo(entry ? { post: entry } : { notFound: true });

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

          {post.video && (
            <div className="blog-post-video">
              <video
                src={post.video}
                controls
                playsInline
                preload="metadata"
                controlsList="nodownload"
              />
            </div>
          )}

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
