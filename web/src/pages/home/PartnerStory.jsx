import React, { useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { m, useReducedMotion } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { useCatalog, productTitle } from '../../catalog/index.js';
import { FAIRHAVEN_HEALTH_FACTS } from '../../content/about.js';
import { ArrowRight } from '../../components/Icons.jsx';
import { Reveal, Stagger, Tilt, DURATION, EASE_OUT, REVEAL, SPRING } from '../../motion/index.js';
import { localized } from './useHomeFacts.js';
import './PartnerStory.css';

const SLUG = 'fairhaven-health';
const FACT_KEYS = ['founded', 'medicalDirector'];

// The life stages of the original Fairhaven Health site, each shown by its 3D bottle render. A bottle links to
// its product when the catalogue has it, otherwise to the brand page.
const STAGES = [
  { key: 'her', image: 'fhpro-women', w: 358, h: 645, match: /FH\s*PRO.*ЖЕНЩ/i },
  { key: 'him', image: 'fhpro-men', w: 365, h: 652, match: /FH\s*PRO.*МУЖЧ/i },
  { key: 'pregnancy', image: 'prenatal', w: 522, h: 620, match: /ПРЕНАТАЛ\s+МУЛЬТИВИТАМИН/i },
  { key: 'nursing', image: 'lactation', w: 372, h: 650, match: /ЛАКТАЦ/i },
];

const floor = {
  hidden: { opacity: 0, scaleX: 0.3 },
  shown: { opacity: 1, scaleX: 1, transition: { duration: DURATION.hero, ease: EASE_OUT, delay: 0.1 } },
};
const rise = {
  hidden: { opacity: 0, y: 96 },
  shown: (i) => ({
    opacity: 1,
    y: 0,
    transition: { y: { ...SPRING.soft, delay: 0.18 + i * 0.09 }, opacity: { duration: DURATION.ui, delay: 0.18 + i * 0.09 } },
  }),
};

function Bottle({ stage, product, index }) {
  const { t, lang } = useI18n();
  const linkRef = useRef(null);
  return (
    <m.li className="hm-ps-bottle" variants={rise} custom={index}>
      <Link ref={linkRef} to={product ? `/product/${product._id}` : `/brands/${SLUG}`} className="hm-ps-bottle-link">
        <Tilt className="hm-ps-bottle-tilt" trackRef={linkRef} max={8} glare={false}>
          <img
            className="hm-ps-bottle-img"
            src={`/assets/fh/${stage.image}.webp`}
            width={stage.w}
            height={stage.h}
            alt=""
            loading="lazy"
            decoding="async"
            draggable="false"
          />
        </Tilt>
        <span className="hm-ps-bottle-stage t-mono">{t(`home.partner.stage.${stage.key}`)}</span>
        {product && <span className="hm-ps-bottle-name">{productTitle(product, lang)}</span>}
      </Link>
    </m.li>
  );
}

/**
 * Fairhaven Health, the brand the store officially distributes: the one place on the home page that keeps the
 * brand's own look (its plum, its wordmark and its bottles). A compact sheet on the floor; the bottles rise in
 * one by one and turn toward the cursor.
 */
export default function PartnerStory() {
  const { t, lang } = useI18n();
  const { products } = useCatalog();
  const reduce = useReducedMotion();
  const stages = useMemo(() => {
    const own = products.filter((p) => p.brandSlug === SLUG);
    return STAGES.map((stage) => ({ stage, product: own.find((p) => stage.match.test(p.name || '')) }));
  }, [products]);
  const facts = FAIRHAVEN_HEALTH_FACTS.filter((f) => FACT_KEYS.includes(f.key));
  const enter = reduce ? {} : { initial: 'hidden', whileInView: 'shown', viewport: { once: true, margin: REVEAL.margin } };

  return (
    <section className="hm-ps section" aria-labelledby="hm-ps-title">
      <div className="container">
        <m.div className="hm-ps-sheet" {...enter}>
          <Stagger className="hm-ps-copy">
            {/* The heading names the brand for screen readers; the wordmark shows it. */}
            <Reveal as="img" className="hm-ps-logo" src="/fh-wordmark.svg" alt="" width="412" height="71" />
            <Reveal as="h2" id="hm-ps-title" className="hm-ps-title t-h2">
              <span className="sr-only">Fairhaven Health. </span>
              {t('home.partner.title')}
            </Reveal>
            <Reveal as="ul" className="hm-ps-facts">
              {facts.map((f) => (
                <li key={f.key}>{localized(f, lang)}</li>
              ))}
            </Reveal>
            <Reveal>
              <Link to={`/brands/${SLUG}`} className="hm-ps-cta">
                {t('home.partner.cta')}
                <ArrowRight size={20} />
              </Link>
            </Reveal>
          </Stagger>
          <div className="hm-ps-stage">
            <m.div className="hm-ps-floor" variants={floor} aria-hidden="true" />
            <ul className="hm-ps-line" aria-label={t('home.partner.track')}>
              {stages.map(({ stage, product }, i) => (
                <Bottle key={stage.key} stage={stage} product={product} index={i} />
              ))}
            </ul>
          </div>
        </m.div>
      </div>
    </section>
  );
}
