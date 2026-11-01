import React, { useMemo, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { m, useReducedMotion, useScroll, useSpring } from 'motion/react';
import { useI18n } from '../i18n/index.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { ArrowLeft } from '../components/Icons.jsx';
import { useSiteContent } from '../context/SiteContentContext.jsx';
import { useCatalog, useProducts, brandBySlug } from '../catalog/index.js';
import { ProductCard, Rail, SectionHeader } from '../components/ui/index.js';
import { Reveal, Stagger, SPRING } from '../motion/index.js';
import { useSeo } from '../seo/useSeo.js';
import NotFound from './NotFound.jsx';
import PostCard, { PostCover } from './journal/PostCard.jsx';
import { journalPosts, postText, postTopic, tagKey, coverShots } from './journal/posts.js';
import './journal/BlogPost.css';

const NO_MATCH = { brand: ['-'] };

/** Thin sun line under the header that fills as the article is read. */
function ReadingProgress({ target }) {
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target, offset: ['start start', 'end end'] });
  const smooth = useSpring(scrollYProgress, SPRING.snappy);
  return <m.div className="jp-progress" style={{ scaleX: reduce ? scrollYProgress : smooth }} aria-hidden="true" />;
}

export default function BlogPost() {
  const { slug } = useParams();
  const { t, tf, lang } = useI18n();
  const content = useSiteContent();
  const { products } = useCatalog();
  const articleRef = useRef(null);

  const posts = useMemo(() => journalPosts(content.blog), [content.blog]);
  const entry = posts.find((p) => p.slug === slug) || null;
  useSeo(entry ? { post: entry } : { notFound: true });

  const topic = entry ? postTopic(entry) : null;
  const filter = !topic ? NO_MATCH : topic.type === 'brand' ? { brand: [topic.slug] } : { need: topic.key };
  const shelf = useProducts(filter, { size: 12 });

  // Same topic first, then the rest in journal order.
  const related = useMemo(() => {
    if (!entry) return [];
    const others = posts.filter((p) => p.slug !== entry.slug);
    const key = JSON.stringify(topic);
    const score = (p) => (JSON.stringify(postTopic(p)) === key ? 0 : tagKey(p) === tagKey(entry) ? 1 : 2);
    return others.map((p, i) => [p, score(p), i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).slice(0, 3).map((x) => x[0]);
  }, [posts, entry, topic]);
  // Over the whole journal, so every cover matches the one on /learn.
  const shots = useMemo(() => coverShots(posts, products), [posts, products]);

  if (!entry) return <NotFound />;

  const text = postText(entry, lang);
  const tag = tagKey(entry);
  let pick = null;
  if (topic && shelf.total > 0) {
    pick =
      topic.type === 'brand'
        ? {
            title: tf('journal.pickBrand', { brand: brandBySlug(topic.slug)?.name || shelf.items[0]?.brandName || '' }),
            to: `/brands/${topic.slug}`,
            linkLabel: t('journal.brandLink'),
          }
        : {
            title: tf('journal.pickNeed', { label: t(`need.${topic.key}`) }),
            to: `/shop/${topic.key}`,
            linkLabel: tf('journal.pickLink', { n: shelf.total }),
          };
  }

  return (
    <div className="jp-page">
      <ReadingProgress target={articleRef} />
      <article ref={articleRef} className="jp-article">
        <div className="container container-narrow">
          <Breadcrumbs
            trail={[{ label: t('home'), to: '/' }, { label: t('journal.title'), to: '/learn' }, { label: text.title }]}
          />
          <header className="jp-head">
            <p className="jp-meta t-mono">
              {text.tag && tag && (
                <Link to={`/learn?tag=${encodeURIComponent(tag)}`} className="jp-tag">{text.tag}</Link>
              )}
              {entry.read ? <span>{tf('journal.read', { n: entry.read })}</span> : null}
            </p>
            <h1 className="jp-title">{text.title}</h1>
            {text.excerpt && <p className="jp-excerpt">{text.excerpt}</p>}
          </header>
        </div>

        <div className="container jp-media-wrap">
          {entry.video ? (
            <div className="jp-video">
              <video
                src={entry.video}
                controls
                playsInline
                preload="metadata"
                controlsList="nodownload"
                aria-label={t('journal.video')}
              />
            </div>
          ) : (
            <PostCover shots={shots.get(entry.slug)} tone="stage" priority className="jp-cover" />
          )}
        </div>

        <div className="container container-narrow">
          <div className="jp-body">
            {text.body.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
          <Link to="/learn" className="jp-back">
            <ArrowLeft size={18} />
            {t('journal.back')}
          </Link>
        </div>
      </article>

      {pick && (
        <section className="section jp-pick" aria-labelledby="jp-pick-title">
          <div className="container">
            <SectionHeader
              id="jp-pick-title"
              eyebrow={t('journal.pickTitle')}
              title={pick.title}
              linkTo={pick.to}
              linkLabel={pick.linkLabel}
            />
            <Rail label={pick.title} itemWidth="clamp(168px, 44vw, 248px)">
              {shelf.items.map((p) => (
                <ProductCard key={p._id} product={p} />
              ))}
            </Rail>
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section className="section jp-related" aria-labelledby="jp-related-title">
          <div className="container jp-related-grid">
            <SectionHeader id="jp-related-title" title={t('journal.related')} />
            <Stagger as="ul" className="jp-related-list">
              {related.map((post) => (
                <Reveal as="li" key={post.slug}>
                  <PostCard post={post} shots={shots.get(post.slug)} variant="row" headingLevel={3} />
                </Reveal>
              ))}
            </Stagger>
          </div>
        </section>
      )}
    </div>
  );
}
