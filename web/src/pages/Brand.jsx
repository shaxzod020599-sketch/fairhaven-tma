import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { m, useReducedMotion } from 'motion/react';
import { useI18n } from '../i18n/index.jsx';
import { brandBySlug, isKind, isNeed, useProducts } from '../catalog/index.js';
import { useSeo } from '../seo/useSeo.js';
import { useHeaderTone } from '../components/shell/HeaderTone.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { ChevronDown, KindIcon, NeedIcon, ShieldCheck } from '../components/Icons.jsx';
import { Button, Chip, ChipGroup, EmptyState, ProductGrid, Rail, SectionHeader, Skeleton } from '../components/ui/index.js';
import { DURATION, EASE_OUT, Reveal, RouteFallback, SPRING, Stagger, useRouteBusy } from '../motion/index.js';
import { FAIRHAVEN_HEALTH_FACTS } from '../content/about.js';
import NotFound from './NotFound.jsx';
import { FH_SLUG, useBrandDirectory } from './brands/useBrandDirectory.js';
import BrandTile, { useCountryLine } from './brands/BrandTile.jsx';
import PackFan from './brands/PackFan.jsx';
import KineticTitle from './brands/KineticTitle.jsx';
import './brands/Brand.css';

/**
 * /brands/:slug. The brand is known from the registry before the catalogue loads, so the hero paints at
 * once; a slug that is neither in the registry nor in the loaded catalogue (or a brand with no products)
 * is a 404.
 */
export default function Brand() {
  const { slug } = useParams();
  const { brands, status, reload } = useBrandDirectory();
  useRouteBusy(status === 'loading');
  const listed = brands.find((b) => b.slug === slug);
  const known = brandBySlug(slug);

  if (listed) return <BrandView key={slug} brand={listed} brands={brands} status={status} reload={reload} />;
  if (known && status !== 'ready') {
    const pending = { slug, name: known.name, count: null, country: known.country, shots: [] };
    return <BrandView key={slug} brand={pending} brands={brands} status={status} reload={reload} />;
  }
  if (status === 'loading') return <RouteFallback />;
  return <NotFound />;
}

function BrandArt({ shots }) {
  const reduce = useReducedMotion();
  // The fan opens a beat after the first paint, so the eye sees it spread.
  const [open, setOpen] = useState(Boolean(reduce));
  useEffect(() => {
    if (open || !shots.length) return undefined;
    const id = setTimeout(() => setOpen(true), 240);
    return () => clearTimeout(id);
  }, [open, shots.length]);
  return (
    <div className="bd-art" aria-hidden="true">
      <m.span
        className="bd-sun"
        initial={reduce ? false : { y: '45%' }}
        animate={{ y: '0%' }}
        transition={{ duration: DURATION.hero, ease: EASE_OUT }}
      />
      <span className="bd-horizon" />
      <PackFan shots={shots} size="lg" open={open} className="bd-fan" />
    </div>
  );
}

function FairhavenFacts() {
  const { t, lang } = useI18n();
  return (
    <section className="stage bd-facts" aria-labelledby="bd-facts-title">
      <div className="container bd-facts-grid">
        <Reveal className="bd-facts-head">
          <h2 id="bd-facts-title" className="t-h2">{t('brands.page.about')}</h2>
          <p className="bd-facts-lead">{t('brands.officialFull')}</p>
        </Reveal>
        <Stagger as="ol" className="bd-facts-list">
          {FAIRHAVEN_HEALTH_FACTS.map((fact, i) => (
            <Reveal as="li" key={fact.key} className="bd-fact">
              <span className="bd-fact-num t-mono" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              <span className="bd-fact-text">{fact[lang] || fact.ru}</span>
            </Reveal>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

function BrandView({ brand, brands, status, reload }) {
  useHeaderTone('stage');
  useSeo(brand.count ? { brand: { slug: brand.slug, name: brand.name, count: brand.count } } : null);
  const { t, tf, plural } = useI18n();
  const reduce = useReducedMotion();
  const countryLine = useCountryLine()(brand.country);
  const official = brand.slug === FH_SLUG;

  // Goal and kind chips live in the URL, so a filtered brand page can be shared.
  const [params, setParams] = useSearchParams();
  const rawNeed = params.get('need');
  const rawKind = params.get('kind');
  const need = isNeed(rawNeed) ? rawNeed : null;
  const kind = isKind(rawKind) ? rawKind : null;
  const setParam = (name, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  const filterKey = `${need}|${kind}`;
  const [pager, setPager] = useState({ key: filterKey, page: 1 });
  const page = pager.key === filterKey ? pager.page : 1;

  const { facets: brandFacets } = useProducts({ brand: brand.slug });
  const { items, total, hasMore, facets } = useProducts(
    { brand: brand.slug, need: need || [], kind: kind || [] },
    { page }
  );
  const needChips = brandFacets.needs.filter((n) => n.count > 0);
  const kindChips = brandFacets.kinds.filter((k) => k.count > 0);
  const countOf = (list, key) => list.find((x) => x.key === key)?.count ?? 0;
  const others = brands.filter((b) => b.slug !== brand.slug);

  const toProducts = (e) => {
    e.preventDefault();
    document.getElementById('bd-products')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };
  const reset = () => setParams(new URLSearchParams(), { replace: true, preventScrollReset: true });

  return (
    <>
      <section className={`stage bd-hero${official ? ' is-official' : ''}`}>
        <div className="container bd-hero-inner">
          <Breadcrumbs
            trail={[{ label: t('home'), to: '/' }, { label: t('brands.title'), to: '/brands' }, { label: brand.name }]}
          />
          <div className="bd-hero-grid">
            <div className="bd-hero-copy">
              {official && (
                <m.p
                  className="bd-badge"
                  initial={reduce ? false : { scale: 0.6, opacity: 0.001 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ ...SPRING.pop, delay: 0.3 }}
                >
                  <ShieldCheck size={18} />
                  {t('brands.official')}
                </m.p>
              )}
              <KineticTitle text={brand.name} className="bd-title" />
              <p className="bd-meta t-mono">
                {countryLine && <span>{countryLine}</span>}
                {brand.count ? (
                  <span className="t-num">
                    {brand.count} {plural(brand.count, t('unitProducts'))}
                  </span>
                ) : (
                  status === 'loading' && <Skeleton w={96} h={14} />
                )}
              </p>
              <p className="bd-lead">{tf('brands.page.lead', { brand: brand.name })}</p>
              <div className="bd-hero-cta">
                <Button variant="stage" size="lg" href="#bd-products" onClick={toProducts} magnetic iconEnd={<ChevronDown size={20} />}>
                  {t('brands.page.cta')}
                </Button>
              </div>
            </div>
            <BrandArt shots={brand.shots} />
          </div>
        </div>
      </section>

      {official && <FairhavenFacts />}

      <section id="bd-products" className="section bd-products" aria-labelledby="bd-products-title">
        <div className="container">
          <SectionHeader
            id="bd-products-title"
            title={tf('brands.page.products', { brand: brand.name })}
            desc={brand.count ? `${total} ${plural(total, t('unitProducts'))}` : undefined}
          />
          {(needChips.length > 1 || kindChips.length > 1) && (
            <div className="bd-chips" role="group" aria-label={t('brands.page.chips')}>
              {needChips.length > 1 && (
                <ChipGroup label={t('groupNeeds')} value={need} onChange={(v) => setParam('need', v)} scroll>
                  {needChips.map(({ key }) => (
                    <Chip key={key} value={key} count={countOf(facets.needs, key)} icon={<NeedIcon need={key} size={18} />}>
                      {t(`need.${key}`)}
                    </Chip>
                  ))}
                </ChipGroup>
              )}
              {kindChips.length > 1 && (
                <ChipGroup label={t('groupKinds')} value={kind} onChange={(v) => setParam('kind', v)} scroll>
                  {kindChips.map(({ key }) => (
                    <Chip key={key} value={key} count={countOf(facets.kinds, key)} icon={<KindIcon kind={key} size={18} />}>
                      {t(`kind.${key}`)}
                    </Chip>
                  ))}
                </ChipGroup>
              )}
            </div>
          )}
          <ProductGrid
            items={items}
            total={total}
            status={status}
            hasMore={hasMore}
            onLoadMore={() => setPager({ key: filterKey, page: page + 1 })}
            onRetry={reload}
            priorityCount={0}
            empty={
              <EmptyState
                title={t('nothingFound')}
                action={<Button variant="secondary" onClick={reset}>{t('brands.page.reset')}</Button>}
              />
            }
          />
        </div>
      </section>

      {others.length > 0 && (
        <section className="section section-2 bd-others" aria-labelledby="bd-others-title">
          <div className="container">
            <SectionHeader id="bd-others-title" title={t('brands.page.others')} linkTo="/brands" linkLabel={t('allBrands')} />
            <Rail label={t('brands.page.others')} itemWidth="clamp(248px, 72vw, 300px)">
              {others.map((b) => (
                <BrandTile key={b.slug} brand={b} variant="compact" />
              ))}
            </Rail>
          </div>
        </section>
      )}
    </>
  );
}
