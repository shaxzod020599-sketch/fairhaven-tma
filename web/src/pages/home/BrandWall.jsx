import React, { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, m, useSpring } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { useCatalog, BRANDS } from '../../catalog/index.js';
import { pickShots } from '../../components/shell/shots.js';
import { Button } from '../../components/ui/index.js';
import { ArrowRight } from '../../components/Icons.jsx';
import { Counter, Marquee, useFinePointer, SPRING, SPRINGS, tween, DURATION } from '../../motion/index.js';
import { useHomeFacts } from './useHomeFacts.js';
import './BrandWall.css';

// The trio of packshots that trails the cursor: a small hand of cards.
const TRIO = [
  { x: -52, y: 12, rotate: -10 },
  { x: 0, y: 0, rotate: 0 },
  { x: 52, y: 12, rotate: 10 },
];
// The trio spans about 36 to 236px right of the cursor (see .hm-bw-trio); within FLIP_ZONE of the right edge
// it is shifted to the mirror position on the left.
const FLIP_ZONE = 260;
const FLIP_SHIFT = 272;

// Marquee repeats are inert, so the pointer passes through them. A point over a repeat is mapped back to
// the same name in the first copy, which keeps every visible name hoverable and clickable.
function brandAt(nav, x, y) {
  for (const track of nav.querySelectorAll('.fx-marquee-track')) {
    const first = track.firstElementChild;
    const box = first.getBoundingClientRect();
    if (y < box.top || y > box.bottom || !first.offsetWidth) continue;
    const local = x - Math.floor((x - box.left) / first.offsetWidth) * first.offsetWidth;
    for (const link of first.querySelectorAll('a')) {
      const r = link.getBoundingClientRect();
      if (local >= r.left && local <= r.right && y >= r.top && y <= r.bottom) return link;
    }
  }
  return null;
}

function BrandRow({ brands, direction, speed, hovered }) {
  return (
    <Marquee direction={direction} speed={speed} gap="clamp(28px, 4vw, 72px)" className="hm-bw-row">
      {brands.map((b, i) => (
        <Link
          key={b.slug}
          to={`/brands/${b.slug}`}
          data-slug={b.slug}
          className={`hm-bw-name${i % 2 ? ' hm-bw-name--line' : ''}${b.slug === hovered ? ' is-on' : ''}`}
        >
          {b.name}
        </Link>
      ))}
    </Marquee>
  );
}

/** Brand wall on the stage: every brand name in huge type on two counter-running rows. */
export default function BrandWall() {
  const { t, plural } = useI18n();
  const { products, status } = useCatalog();
  const facts = useHomeFacts();
  const fine = useFinePointer();
  const navigate = useNavigate();
  const sectionRef = useRef(null);
  const navRef = useRef(null);
  const [hovered, setHovered] = useState(null);
  const px = useSpring(0, SPRINGS.soft);
  const py = useSpring(0, SPRINGS.soft);

  // Brands by size of range, from the products themselves so every name has a page behind it.
  const rows = useMemo(() => {
    const byBrand = new Map();
    for (const p of products) {
      if (!p.brandSlug) continue;
      const entry = byBrand.get(p.brandSlug) || { slug: p.brandSlug, name: p.brandName, count: 0 };
      entry.count += 1;
      byBrand.set(p.brandSlug, entry);
    }
    const list = byBrand.size ? [...byBrand.values()].sort((a, b) => b.count - a.count) : BRANDS.slice(0, facts.brands);
    return [list.filter((_, i) => i % 2 === 0), list.filter((_, i) => i % 2 === 1)];
  }, [products, facts.brands]);

  const shots = useMemo(
    () => (hovered && fine ? pickShots(products, 3, (p) => p.brandSlug === hovered) : []),
    [hovered, fine, products]
  );

  const onMove = (e) => {
    const link = brandAt(navRef.current, e.clientX, e.clientY);
    const slug = link ? link.dataset.slug : null;
    setHovered(slug);
    if (!fine) return;
    const box = sectionRef.current.getBoundingClientRect();
    // The trio appears beside the cursor, then trails it. It sits on the row being read, never over the
    // heading, and moves to the cursor's left side near the right edge so the section never clips it.
    const move = hovered ? 'set' : 'jump';
    px[move](e.clientX - box.left - (box.right - e.clientX < FLIP_ZONE ? FLIP_SHIFT : 0));
    py[move](e.clientY - box.top);
  };

  const onClick = (e) => {
    if (e.target.closest('a')) return;
    const link = brandAt(navRef.current, e.clientX, e.clientY);
    if (link) navigate(link.getAttribute('href'));
  };

  if (status === 'error' && !products.length) return null;

  return (
    <section ref={sectionRef} className="hm-bw stage section" aria-labelledby="hm-bw-title">
      <div className="container hm-bw-head">
        <h2 id="hm-bw-title" className="hm-bw-title t-h1">
          <span className="hm-bw-stat">
            <Counter value={facts.brands} from={0} className="hm-bw-num" /> {plural(facts.brands, t('home.brands.unit'))}
          </span>
          {facts.products > 0 && (
            <>
              <span className="hm-bw-sep" aria-hidden="true">
                ·
              </span>
              <span className="sr-only">, </span>
              <span className="hm-bw-stat">
                <Counter value={facts.products} from={0} className="hm-bw-num" />{' '}
                {plural(facts.products, t('unitProducts'))}
              </span>
            </>
          )}
        </h2>
        <Button variant="secondary" size="lg" to="/brands" iconEnd={<ArrowRight size={20} />}>
          {t('allBrands')}
        </Button>
      </div>

      <nav
        ref={navRef}
        className={`hm-bw-rows${hovered ? ' is-pointing' : ''}`}
        aria-label={t('home.brands.label')}
        onPointerMove={onMove}
        onPointerLeave={() => setHovered(null)}
        onClick={onClick}
      >
        <BrandRow brands={rows[0]} direction="left" speed={44} hovered={hovered} />
        {rows[1].length > 0 && <BrandRow brands={rows[1]} direction="right" speed={36} hovered={hovered} />}
      </nav>

      {fine && (
        <m.div className="hm-bw-follow" style={{ x: px, y: py }} aria-hidden="true">
          <AnimatePresence>
            {shots.length > 0 && (
              <m.div
                key={hovered}
                className="hm-bw-trio"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85, transition: tween(DURATION.hover) }}
                transition={SPRING.soft}
              >
                {shots.map((p, i) => (
                  <m.span
                    key={p._id}
                    className="hm-bw-shot"
                    initial={{ x: 0, y: 16, rotate: 0 }}
                    animate={TRIO[i]}
                    transition={{ ...SPRING.soft, delay: i * 0.03 }}
                  >
                    <img src={p.image} alt="" decoding="async" draggable="false" />
                  </m.span>
                ))}
              </m.div>
            )}
          </AnimatePresence>
        </m.div>
      )}
    </section>
  );
}
