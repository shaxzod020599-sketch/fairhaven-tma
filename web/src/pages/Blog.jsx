import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, m } from 'motion/react';
import { useI18n } from '../i18n/index.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { useSiteContent } from '../context/SiteContentContext.jsx';
import { useCatalog } from '../catalog/index.js';
import { Chip, ChipGroup, EmptyState, Button } from '../components/ui/index.js';
import { Reveal, DURATION, EASE_OUT } from '../motion/index.js';
import { useSeo } from '../seo/useSeo.js';
import PostCard from './journal/PostCard.jsx';
import { journalPosts, postText, tagKey, coverShots } from './journal/posts.js';
import './journal/Blog.css';

const ALL = 'all';
const cardMotion = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: DURATION.ui, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: DURATION.hover } },
};

export default function Blog() {
  const { t, tf, lang, plural } = useI18n();
  const content = useSiteContent();
  const { products } = useCatalog();
  const [params, setParams] = useSearchParams();
  useSeo();

  const posts = useMemo(() => journalPosts(content.blog), [content.blog]);
  const shots = useMemo(() => coverShots(posts, products), [posts, products]);

  // Rubrics in order of first appearance; the key is the Russian tag, the label follows the language.
  const tags = useMemo(() => {
    const map = new Map();
    for (const post of posts) {
      const key = tagKey(post);
      if (key && !map.has(key)) map.set(key, { key, label: postText(post, lang).tag || key, count: 0 });
      if (key) map.get(key).count += 1;
    }
    return [...map.values()];
  }, [posts, lang]);

  const requested = params.get('tag') || ALL;
  const active = requested === ALL || tags.some((x) => x.key === requested) ? requested : ALL;
  const shown = active === ALL ? posts : posts.filter((p) => tagKey(p) === active);
  const [featured, ...rest] = shown;

  const setTag = (value) => {
    const next = new URLSearchParams(params);
    if (!value || value === ALL) next.delete('tag');
    else next.set('tag', value);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  return (
    <div className="jr-page">
      <div className="container">
        <Breadcrumbs trail={[{ label: t('home'), to: '/' }, { label: t('journal.title') }]} />

        <header className="jr-head">
          <h1 className="t-h1 jr-head-title">{t('journal.title')}</h1>
          <div className="jr-head-side">
            <p className="jr-head-lead t-muted">{t('journal.lead')}</p>
            <p className="jr-head-count t-mono" aria-live="polite">
              {tf('journal.count', { n: shown.length, unit: plural(shown.length, t('journal.unitPosts')) })}
            </p>
          </div>
        </header>

        {tags.length > 1 && (
          <ChipGroup
            label={t('journal.filterLabel')}
            value={active}
            onChange={(v) => setTag(v || ALL)}
            scroll
            className="jr-tags"
          >
            <Chip value={ALL} count={posts.length}>{t('journal.all')}</Chip>
            {tags.map((tag) => (
              <Chip key={tag.key} value={tag.key} count={tag.count}>{tag.label}</Chip>
            ))}
          </ChipGroup>
        )}

        {featured ? (
          <>
            <Reveal key={`f-${featured.slug}`} className="jr-featured">
              <PostCard post={featured} shots={shots.get(featured.slug)} variant="feature" priority />
            </Reveal>
            {rest.length > 0 && (
              <m.ul className="jr-grid" layout="position">
                <AnimatePresence mode="popLayout" initial={false}>
                  {rest.map((post) => (
                    <m.li key={post.slug} layout="position" {...cardMotion}>
                      <PostCard post={post} shots={shots.get(post.slug)} />
                    </m.li>
                  ))}
                </AnimatePresence>
              </m.ul>
            )}
          </>
        ) : (
          <EmptyState
            title={t('journal.empty')}
            action={<Button variant="secondary" onClick={() => setTag(ALL)}>{t('journal.showAll')}</Button>}
          />
        )}
      </div>
    </div>
  );
}
