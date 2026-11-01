import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { SORTS } from '../../catalog/index.js';
import { Select } from '../../components/ui/index.js';
import { Filter } from '../../components/Icons.jsx';
import './Toolbar.css';

/** «Фильтры» (phones and tablets), «Показано N из M» and the sort select. */
export default function Toolbar({ shown, total, sort, onSort, activeCount, onOpenFilters, filtersOpen }) {
  const { t, tf } = useI18n();
  return (
    <div className="shop-toolbar">
      <button
        type="button"
        className="shop-toolbar-filters"
        onClick={onOpenFilters}
        aria-haspopup="dialog"
        aria-expanded={filtersOpen}
        aria-label={activeCount ? tf('catalog.filtersActive', { n: activeCount }) : undefined}
      >
        <Filter size={20} />
        <span>{t('catalog.filters')}</span>
        {activeCount > 0 && (
          <span className="shop-toolbar-badge t-num" aria-hidden="true">
            {activeCount}
          </span>
        )}
      </button>
      <p className="shop-toolbar-count t-small t-muted" aria-live="polite">
        {tf('shownOf', { shown, total })}
      </p>
      <Select
        className="shop-toolbar-sort"
        label={t('catalog.sort')}
        hideLabel
        value={sort}
        onChange={onSort}
        options={SORTS.map((value) => ({ value, label: t(`catalog.sort.${value}`) }))}
      />
    </div>
  );
}
