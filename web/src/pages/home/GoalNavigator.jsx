import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, m } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { useCatalog, NEED_KEYS } from '../../catalog/index.js';
import { countsBy, pickShots } from '../../components/shell/shots.js';
import { Button, Rail } from '../../components/ui/index.js';
import { ArrowRight, NeedIcon } from '../../components/Icons.jsx';
import { useMediaQuery, SPRING, tween, DURATION } from '../../motion/index.js';
import './GoalNavigator.css';

// Where the four packshots of the active goal land: a hand of cards around the middle.
const FAN = [
  { x: '-84%', y: '10%', rotate: -13 },
  { x: '-28%', y: '0%', rotate: -4 },
  { x: '28%', y: '0%', rotate: 4 },
  { x: '84%', y: '10%', rotate: 13 },
];

function useGoals() {
  const { products, taxonomy } = useCatalog();
  return useMemo(() => {
    const counts = countsBy(taxonomy?.needs);
    return NEED_KEYS.map((key) => ({
      key,
      count: counts.get(key) || 0,
      shots: pickShots(products, 4, (p) => p.needs?.includes(key)),
    }));
  }, [products, taxonomy]);
}

function Fan({ goal }) {
  return (
    <div className="hm-gn-fan" aria-hidden="true">
      <AnimatePresence initial={false}>
        <m.div
          key={goal.key}
          className="hm-gn-fan-set"
          exit={{ opacity: 0, scale: 0.96, transition: tween(DURATION.hover) }}
        >
          {goal.shots.map((p, i) => (
            <m.span
              key={p._id}
              className="hm-gn-shot"
              initial={{ x: '0%', y: '18%', rotate: 0, opacity: 0, scale: 0.9 }}
              animate={{ ...FAN[i], opacity: 1, scale: 1 }}
              transition={{ ...SPRING.soft, delay: i * 0.04, opacity: tween(DURATION.ui) }}
            >
              <img src={p.image} alt="" loading="lazy" decoding="async" draggable="false" />
            </m.span>
          ))}
        </m.div>
      </AnimatePresence>
    </div>
  );
}

/** «Что для вас важно сейчас?»: an index of the 12 goals with a live preview (desktop), a rail on phones. */
export default function GoalNavigator() {
  const { t, tf, plural } = useI18n();
  const goals = useGoals();
  const wide = useMediaQuery('(min-width: 900px)');
  const [activeKey, setActiveKey] = useState(NEED_KEYS[0]);
  const active = goals.find((g) => g.key === activeKey) || goals[0];
  const seeLabel = (g) => tf('home.goals.see', { n: g.count, unit: plural(g.count, t('unitProducts')) });

  return (
    <section className="hm-gn section" aria-labelledby="hm-gn-title">
      <div className="container">
        <h2 id="hm-gn-title" className="hm-gn-title t-h1">
          {t('home.goals.title')}
        </h2>

        {wide ? (
          <div className="hm-gn-grid">
            <ul className="hm-gn-index">
              {goals.map((g) => (
                <li key={g.key}>
                  <Link
                    to={`/shop/${g.key}`}
                    className={`hm-gn-row${g.key === active.key ? ' is-active' : ''}`}
                    onPointerEnter={() => setActiveKey(g.key)}
                    onFocus={() => setActiveKey(g.key)}
                  >
                    {g.key === active.key && (
                      <m.span className="hm-gn-row-fill" layoutId="hm-gn-active" transition={SPRING.snappy} aria-hidden="true" />
                    )}
                    <span className="hm-gn-icon">
                      <NeedIcon need={g.key} size={22} />
                    </span>
                    <span className="hm-gn-label">{t(`need.${g.key}`)}</span>
                    {g.count > 0 && <span className="hm-gn-count t-mono">{g.count}</span>}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="hm-gn-preview">
              <Fan goal={active} />
              <div className="hm-gn-copy">
                <p className="hm-gn-name t-h3">{t(`need.${active.key}`)}</p>
                <p className="hm-gn-desc t-muted">{t(`needDesc.${active.key}`)}</p>
                <Button to={`/shop/${active.key}`} iconEnd={<ArrowRight size={18} />} tabIndex={-1}>
                  {active.count > 0 ? seeLabel(active) : t('viewAll')}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <Rail label={t('home.goals.title')} itemWidth="clamp(232px, 70vw, 300px)" className="hm-gn-rail">
            {goals.map((g) => (
              <Link key={g.key} to={`/shop/${g.key}`} className="hm-gn-card">
                <span className="hm-gn-card-shots" aria-hidden="true">
                  {g.shots.slice(0, 3).map((p) => (
                    <span key={p._id} className="hm-gn-card-shot">
                      <img src={p.image} alt="" loading="lazy" decoding="async" draggable="false" />
                    </span>
                  ))}
                </span>
                <span className="hm-gn-card-text">
                  <span className="hm-gn-icon">
                    <NeedIcon need={g.key} size={20} />
                  </span>
                  <span className="hm-gn-card-label">{t(`need.${g.key}`)}</span>
                  {g.count > 0 && <span className="hm-gn-count t-mono">{g.count}</span>}
                </span>
              </Link>
            ))}
          </Rail>
        )}
      </div>
    </section>
  );
}
