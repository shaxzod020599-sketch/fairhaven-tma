import { BLOG_POSTS } from '../../content/blog.js';
import { GUIDES } from '../../content/guides.js';
import { isNeed } from '../../catalog/index.js';

// Saved site content replaces the built-in blog array as a whole, so a saved copy of a built-in post may lack
// `topic`; the built-in value is found again by slug.
const BUILT_IN_TOPIC = new Map([...BLOG_POSTS, ...GUIDES].map((post) => [post.slug, post.topic]));

/** Every journal entry in display order: site-content posts (admin) first, then the built-in guides. */
export function journalPosts(blog) {
  const seen = new Set();
  return [...(Array.isArray(blog) ? blog : []), ...GUIDES].filter((post) => {
    if (!post?.slug || seen.has(post.slug)) return false;
    seen.add(post.slug);
    return true;
  });
}

/** The post's text in the reader's language; an Uzbek copy without a title falls back to Russian. */
export function postText(post, lang) {
  const loc = lang === 'uz' && post?.uz?.title ? post.uz : post?.ru || {};
  return {
    tag: loc.tag || '',
    title: loc.title || '',
    excerpt: loc.excerpt || '',
    body: Array.isArray(loc.body) ? loc.body : [],
  };
}

/** Filter key of a post's rubric: the Russian tag, so a shared ?tag= link survives a language switch. */
export const tagKey = (post) => String(post?.ru?.tag || '').trim();

/** `{ type: 'need', key }`, `{ type: 'brand', slug }` or null. */
export function postTopic(post) {
  const raw = String(post?.topic || BUILT_IN_TOPIC.get(post?.slug) || '');
  if (raw.startsWith('brand:')) return { type: 'brand', slug: raw.slice(6) };
  return isNeed(raw) ? { type: 'need', key: raw } : null;
}

const inTopic = (product, topic) =>
  topic.type === 'brand' ? product.brandSlug === topic.slug : product.needs?.includes(topic.key);

/**
 * Packshots for each post's cover: products of the post's topic that have a photo, taken brand by brand so a
 * cover shows variety, and shifted for each further post on the same topic so two covers never repeat.
 * Returns Map(slug -> product[]); posts without a topic get an empty list.
 */
export function coverShots(posts, products, perCover = 3) {
  const used = new Map();
  const out = new Map();
  for (const post of posts) {
    const topic = postTopic(post);
    if (!topic) {
      out.set(post.slug, []);
      continue;
    }
    const id = topic.type === 'brand' ? `b:${topic.slug}` : topic.key;
    const pool = interleaveBrands(products.filter((p) => p.image && inTopic(p, topic)));
    const turn = used.get(id) || 0;
    used.set(id, turn + 1);
    const start = pool.length ? (turn * perCover) % pool.length : 0;
    const shots = [];
    for (let i = 0; i < Math.min(perCover, pool.length); i += 1) shots.push(pool[(start + i) % pool.length]);
    out.set(post.slug, shots);
  }
  return out;
}

function interleaveBrands(list) {
  const groups = new Map();
  for (const p of list) {
    const key = p.brandSlug || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const queues = [...groups.values()];
  const out = [];
  for (let round = 0; out.length < list.length; round += 1) {
    for (const q of queues) if (q[round]) out.push(q[round]);
  }
  return out;
}
