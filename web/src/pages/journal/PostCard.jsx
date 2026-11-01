import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n/index.jsx';
import { ArrowRight, Play } from '../../components/Icons.jsx';
import { postText } from './posts.js';
import './PostCard.css';

/**
 * Journal cover. Posts carry no photos, so the cover is the store's own picture: the rising sun over a horizon
 * with real packshots of the post's topic standing on it. `tone` 'stage' is the dark variant.
 */
export function PostCover({ shots = [], tone = 'floor', priority = false, video = false, className = '' }) {
  const { t } = useI18n();
  return (
    <div className={`jr-cover jr-cover--${tone} ${className}`} aria-hidden="true">
      <div className="jr-cover-art">
        <span className="jr-cover-sun" />
        <span className="jr-cover-ground" />
        {shots.length > 0 && (
          <span className={`jr-cover-shots jr-cover-shots--${shots.length}`}>
            {shots.map((p, i) => (
              <span className="jr-shot" key={p._id || i}>
                <img
                  src={p.image}
                  alt=""
                  loading={priority ? 'eager' : 'lazy'}
                  decoding="async"
                  draggable="false"
                />
              </span>
            ))}
          </span>
        )}
      </div>
      {video && (
        <span className="jr-cover-video t-mono">
          <Play size={14} />
          {t('journal.hasVideo')}
        </span>
      )}
    </div>
  );
}

/**
 * One post: `feature` (large, cover beside the text on wide screens), `card` (cover on top) or `row` (compact,
 * for «Читайте также»). The title link covers the whole card.
 */
export default function PostCard({ post, shots, variant = 'card', headingLevel = 2, priority = false }) {
  const { lang, tf, t } = useI18n();
  const text = postText(post, lang);
  const Heading = `h${headingLevel}`;
  return (
    <article className={`jr-card jr-card--${variant}`}>
      <PostCover
        shots={shots}
        tone={variant === 'feature' ? 'stage' : 'floor'}
        priority={priority}
        video={Boolean(post.video)}
      />
      <div className="jr-card-body">
        {text.tag && <p className="jr-card-tag t-mono">{text.tag}</p>}
        <Heading className="jr-card-title">
          <Link to={`/learn/${post.slug}`} className="jr-card-link">
            {text.title}
          </Link>
        </Heading>
        {text.excerpt && variant !== 'row' && <p className="jr-card-excerpt">{text.excerpt}</p>}
        <p className="jr-card-meta t-small">
          {post.read ? <span>{tf('journal.read', { n: post.read })}</span> : null}
          {variant === 'feature' && (
            <span className="jr-card-more" aria-hidden="true">
              {t('journal.readPost')}
              <ArrowRight size={18} />
            </span>
          )}
        </p>
      </div>
    </article>
  );
}
