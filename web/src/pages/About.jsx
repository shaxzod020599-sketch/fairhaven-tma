import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { ArrowRight, ArrowUpRight, Filter, ShieldCheck, Telegram, Truck } from '../components/Icons.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useContacts } from '../components/shell/contacts.js';
import { useHeaderTone } from '../components/shell/HeaderTone.jsx';
import { Button, SectionHeader, SunMark } from '../components/ui/index.js';
import { Counter, Reveal, Stagger } from '../motion/index.js';
import { useTaxonomy, BRANDS, formatSum } from '../catalog/index.js';
import { useSeo } from '../seo/useSeo.js';
import { withHours } from './info/hours.js';
import './info/About.css';

const FH_SLUG = 'fairhaven-health';
const PRINCIPLES = [
  { id: 'p1', Icon: ShieldCheck },
  { id: 'p2', Icon: Filter },
  { id: 'p3', Icon: Truck },
  { id: 'p4', Icon: Telegram },
];

export default function About() {
  useSeo();
  useHeaderTone('stage');
  const { t, tf, plural, lang } = useI18n();
  const { get } = useSettings();
  const { hours } = useContacts();
  const { taxonomy } = useTaxonomy();

  // Until the catalogue answers, the brand registry stands in: both list the same brands.
  const brands = taxonomy?.brands?.length ? taxonomy.brands : BRANDS.map((b) => ({ slug: b.slug, name: b.name, count: null }));
  const brandCount = brands.length;
  const productCount = taxonomy?.total || 0;
  const threshold = formatSum(Number(get('free_delivery_threshold')) || 500000, lang);
  const wall = [...brands].sort((a, b) => (a.slug === FH_SLUG ? -1 : b.slug === FH_SLUG ? 1 : a.name.localeCompare(b.name, 'en')));

  const steps = [
    { id: 'step1', value: 1, unit: 'pages.unitBrands', text: t('pages.about.step1Text') },
    { id: 'step2', value: brandCount, unit: 'pages.unitBrands', text: t('pages.about.step2Text') },
    { id: 'step3', value: productCount, unit: 'pages.unitProducts', text: tf('pages.about.step3Text', { threshold }) },
  ];

  return (
    <div className="ab-page">
      <section className="stage ab-hero" aria-labelledby="ab-title">
        <div className="ab-hero-sky" aria-hidden="true">
          <span className="ab-hero-sun" />
          <span className="ab-hero-horizon" />
        </div>
        <div className="container">
          <Breadcrumbs trail={[{ label: t('home'), to: '/' }, { label: t('pages.about.crumb') }]} />
          <div className="ab-hero-body">
            <SunMark size={56} className="ab-hero-mark" />
            <h1 id="ab-title" className="ab-title">
              <span>{t('pages.about.title1')}</span>{' '}
              <span className="ab-title-now">{tf('pages.about.title2', { brands: brandCount })}</span>
            </h1>
            <p className="ab-lead">{t('pages.about.lead')}</p>
            <div className="ab-hero-actions">
              <Button variant="stage" size="lg" to="/brands" iconEnd={<ArrowRight size={20} />}>
                {t('allBrands')}
              </Button>
              <Button variant="ghost" size="lg" to="/shop">
                {t('goToShop')}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="section ab-story" aria-labelledby="ab-story-title">
        <div className="container">
          <SectionHeader id="ab-story-title" title={t('pages.about.storyTitle')} />
          <Stagger as="ol" className="ab-steps">
            {steps.map((step) => (
              <Reveal as="li" key={step.id} className="ab-step">
                <p className="ab-step-label t-mono">{t(`pages.about.${step.id}`)}</p>
                <p className="ab-step-figure">
                  {step.value > 0 ? (
                    <>
                      <Counter value={step.value} from={step.value > 1 ? 0 : undefined} className="ab-step-num" />{' '}
                      <span className="ab-step-unit">{plural(step.value, t(step.unit))}</span>
                    </>
                  ) : (
                    <span className="ab-step-num" aria-hidden="true">&nbsp;</span>
                  )}
                </p>
                <p className="ab-step-text">{step.text}</p>
              </Reveal>
            ))}
          </Stagger>
        </div>
      </section>

      <section className="section section-2 ab-principles" aria-labelledby="ab-principles-title">
        <div className="container">
          <SectionHeader id="ab-principles-title" title={t('pages.about.principlesTitle')} />
          <Stagger as="ul" className="ab-principle-list">
            {PRINCIPLES.map(({ id, Icon }) => (
              <Reveal as="li" key={id} className="ab-principle">
                <span className="ab-principle-icon" aria-hidden="true">
                  <Icon size={24} />
                </span>
                <h3 className="ab-principle-title">{t(`pages.about.${id}`)}</h3>
                <p className="ab-principle-text t-muted">
                  {id === 'p4' ? withHours(tf, 'pages.about.p4Text', hours) : t(`pages.about.${id}Text`)}
                </p>
              </Reveal>
            ))}
          </Stagger>
        </div>
      </section>

      <section className="section stage ab-wall" aria-labelledby="ab-wall-title">
        <div className="container">
          <SectionHeader
            id="ab-wall-title"
            title={tf('pages.about.brandsTitle', { brands: brandCount, unit: plural(brandCount, t('pages.unitBrands')) })}
            desc={t('pages.about.brandsDesc')}
            linkTo="/brands"
            linkLabel={t('allBrands')}
          />
          <ul className="ab-wall-list">
            {wall.map((brand) => (
              <li key={brand.slug}>
                <Link to={`/brands/${brand.slug}`} className={`ab-brand${brand.slug === FH_SLUG ? ' ab-brand--fh' : ''}`}>
                  <span className="ab-brand-name">{brand.name}</span>
                  {brand.slug === FH_SLUG && <span className="ab-brand-flag t-mono">{t('pages.about.official')}</span>}
                  {brand.count > 0 && (
                    <span className="ab-brand-count t-mono">
                      {brand.count} {plural(brand.count, t('pages.unitProducts'))}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section ab-cards" aria-label={t('pages.about.fhTitle')}>
        <div className="container ab-cards-grid">
          <Reveal className="ab-card ab-card--fh">
            <SunMark size={40} rise={false} />
            <h2 className="ab-card-title">{t('pages.about.fhTitle')}</h2>
            <p className="ab-card-text">{t('pages.about.fhText')}</p>
            <div className="ab-card-actions">
              <Button to={`/brands/${FH_SLUG}`} iconEnd={<ArrowRight size={18} />}>{t('pages.about.fhBrand')}</Button>
              <Button variant="secondary" to="/learn/brand-story">{t('pages.about.fhStory')}</Button>
            </div>
          </Reveal>
          <Reveal className="ab-card">
            <h2 className="ab-card-title">{t('pages.about.askTitle')}</h2>
            <p className="ab-card-text">{t('pages.about.askText')}</p>
            <div className="ab-card-actions">
              <Button variant="secondary" to="/contact" iconEnd={<ArrowUpRight size={18} />}>
                {t('pages.about.askContacts')}
              </Button>
              <Button variant="ghost" to="/shop">{t('goToShop')}</Button>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
