import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n/index.jsx';
import { brandCountry, formatSum, productSpec } from '../../catalog/index.js';
import { Reveal } from '../../motion/index.js';
import { Tabs, TabPanel } from '../../components/ui/index.js';
import { ArrowRight, Info } from '../../components/Icons.jsx';
import { useContacts } from '../../components/shell/contacts.js';
import { useFreeThreshold } from './DeliveryCard.jsx';
import './Details.css';

// Same fee the cart and checkout charge below the free-delivery threshold.
const DELIVERY_FEE = 25000;

/** Description in the reader's language: Uzbek Latin, then Uzbek Cyrillic, then Russian. */
export function descriptionOf(product, lang) {
  const text = lang === 'uz' ? product.descriptionUzLat || product.descriptionUz || product.description : product.description;
  return String(text || '').trim();
}

function Facts({ product }) {
  const { t, lang } = useI18n();
  const country = brandCountry(product.brandSlug);
  const rows = [
    product.brandName && [t('product.factBrand'), product.brandSlug ? <Link to={`/brands/${product.brandSlug}`}>{product.brandName}</Link> : product.brandName],
    country && [t('brandCountry'), t(`country.${country}`)],
    product.kind && [t('product.factKind'), <Link to={`/shop?kind=${product.kind}`}>{t(`kind.${product.kind}`)}</Link>],
    product.needs.length > 0 && [
      t('product.factNeeds'),
      product.needs.map((need, i) => (
        <React.Fragment key={need}>
          {i > 0 && ', '}
          <Link to={`/shop/${need}`}>{t(`need.${need}`)}</Link>
        </React.Fragment>
      )),
    ],
    product.spec && [t('product.factSpec'), productSpec(product, lang)],
    [t('product.factStock'), product.isAvailable ? t('inStock') : t('out')],
    product.sku && [t('product.factSku'), <span className="t-num">{product.sku}</span>],
  ].filter(Boolean);

  return (
    <dl className="pdp-facts">
      {rows.map(([term, value]) => (
        <div key={term} className="pdp-fact">
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Consult() {
  const { t } = useI18n();
  return (
    <p className="pdp-consult t-small">
      <Info size={18} aria-hidden="true" />
      {t('product.consult')}
    </p>
  );
}

function Delivery() {
  const { t, tf, lang } = useI18n();
  const threshold = useFreeThreshold();
  const { tgUrl } = useContacts();
  return (
    <div className="pdp-delivery">
      <ul className="pdp-delivery-list">
        {threshold > 0 && <li>{tf('product.dlCost', { sum: formatSum(threshold, lang), fee: formatSum(DELIVERY_FEE, lang) })}</li>}
        <li>{t('product.deliveryTimes')}.</li>
        <li>{t('product.payment')}.</li>
        <li>{t('product.dlGuest')}</li>
        {tgUrl && (
          <li>
            <a href={tgUrl} target="_blank" rel="noopener noreferrer">{t('product.dlTelegram')}</a>
          </li>
        )}
      </ul>
      <Link to="/faq#delivery" className="pdp-more">
        {t('product.dlMore')}
        <ArrowRight size={18} aria-hidden="true" />
      </Link>
    </div>
  );
}

/**
 * «О товаре»: tabs with the description (when there is one), the structured facts we know, and delivery.
 * Without a description the facts come first, so the block never looks empty.
 */
export default function Details({ product }) {
  const { t, lang } = useI18n();
  const description = descriptionOf(product, lang);
  const tabs = [
    description && { value: 'description', label: t('product.tabDescription') },
    { value: 'facts', label: description ? t('product.tabFacts') : t('product.tabAbout') },
    { value: 'delivery', label: t('product.tabDelivery') },
  ].filter(Boolean);
  const [tab, setTab] = useState(tabs[0].value);
  const active = tabs.some((x) => x.value === tab) ? tab : tabs[0].value;

  return (
    <Reveal as="section" className="pdp-details" aria-labelledby="pdp-details-title">
      <h2 id="pdp-details-title" className="pdp-details-title t-h3">{t('product.aboutLabel')}</h2>
      <Tabs label={t('product.aboutLabel')} idPrefix="pdp" value={active} onChange={setTab} tabs={tabs} className="pdp-tabs" />
      {description && (
        <TabPanel idPrefix="pdp" value="description" active={active} className="pdp-panel">
          <div className="pdp-desc">
            {description.split(/\n\s*\n|\r?\n/).filter((s) => s.trim()).map((para, i) => (
              <p key={i}>{para.trim()}</p>
            ))}
          </div>
          <Consult />
        </TabPanel>
      )}
      <TabPanel idPrefix="pdp" value="facts" active={active} className="pdp-panel">
        <Facts product={product} />
        <Consult />
      </TabPanel>
      <TabPanel idPrefix="pdp" value="delivery" active={active} className="pdp-panel">
        <Delivery />
      </TabPanel>
    </Reveal>
  );
}
