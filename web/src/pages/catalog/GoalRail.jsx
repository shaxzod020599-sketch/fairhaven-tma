import React, { useEffect, useRef } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { NEED_KEYS } from '../../catalog/index.js';
import { Chip, ChipGroup } from '../../components/ui/index.js';
import { NeedIcon } from '../../components/Icons.jsx';
import { useHeaderHidden } from './useHeaderHidden.js';
import './GoalRail.css';

const ALL = 'all';

/**
 * Sticky rail of the twelve goals under the header; the active fill glides between chips. It slides up
 * when the header tucks away, so it always sits at the top edge. `counts`: Map need -> products.
 */
export default function GoalRail({ value, counts, total, onChange }) {
  const { t } = useI18n();
  const headerHidden = useHeaderHidden();
  const row = useRef(null);

  // Bring the active goal into view inside the row (phones), without moving the page.
  useEffect(() => {
    const el = row.current?.querySelector('.ui-chips');
    const chip = el?.querySelector('.ui-chip.is-on');
    if (!el || !chip) return;
    const box = el.getBoundingClientRect();
    const at = chip.getBoundingClientRect();
    el.scrollLeft = Math.max(0, el.scrollLeft + at.left - box.left - (box.width - at.width) / 2);
  }, [value]);

  return (
    <div className={`shop-rail${headerHidden ? ' is-raised' : ''}`}>
      <div className="container" ref={row}>
        <ChipGroup label={t('groupNeeds')} value={value || ALL} onChange={(v) => onChange(v && v !== ALL ? v : '')} scroll>
          <Chip value={ALL} count={total}>
            {t('catalog.allGoals')}
          </Chip>
          {NEED_KEYS.map((key) => (
            <Chip key={key} value={key} count={counts.get(key) ?? 0} icon={<NeedIcon need={key} />}>
              {t(`need.${key}`)}
            </Chip>
          ))}
        </ChipGroup>
      </div>
    </div>
  );
}
