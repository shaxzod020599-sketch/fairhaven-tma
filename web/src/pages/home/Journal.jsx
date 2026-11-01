import React, { useMemo } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { useCatalog } from '../../catalog/index.js';
import { useSiteContent } from '../../context/SiteContentContext.jsx';
import { SectionHeader } from '../../components/ui/index.js';
import PostCard from '../journal/PostCard.jsx';
import { coverShots, journalPosts } from '../journal/posts.js';
import './Journal.css';

/** The first three journal entries in /learn order: one lead story and two compact ones. */
export default function Journal() {
  const { t } = useI18n();
  const content = useSiteContent();
  const { products } = useCatalog();
  const posts = useMemo(() => journalPosts(content?.blog).slice(0, 3), [content]);
  const covers = useMemo(() => coverShots(posts, products), [posts, products]);

  if (!posts.length) return null;
  const [lead, ...rest] = posts;

  return (
    <section className="hm-jr section" aria-labelledby="hm-jr-title">
      <div className="container">
        <SectionHeader id="hm-jr-title" title={t('home.journal.title')} size="h1" linkTo="/learn" linkLabel={t('home.journal.all')} />
        <div className="hm-jr-grid">
          <div className="hm-jr-lead">
            <PostCard post={lead} shots={covers.get(lead.slug)} variant="feature" headingLevel={3} />
          </div>
          {rest.length > 0 && (
            <ul className="hm-jr-side">
              {rest.map((post) => (
                <li key={post.slug}>
                  <PostCard post={post} shots={covers.get(post.slug)} variant="row" headingLevel={3} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
