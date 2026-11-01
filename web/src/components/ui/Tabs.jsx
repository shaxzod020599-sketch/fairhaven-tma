import React, { useRef } from 'react';
import { m } from 'motion/react';
import { SPRING } from '../../motion/easings.js';
import './Tabs.css';

const tabId = (prefix, value) => `${prefix}-tab-${value}`;
const panelId = (prefix, value) => `${prefix}-panel-${value}`;

/**
 * Tab list (WAI-ARIA tabs, selection follows focus). Arrow keys, Home and End move between tabs; the active
 * underline slides between them. Pair each tab with a <TabPanel> sharing `idPrefix` (required, unique per page).
 *   <Tabs label="О товаре" idPrefix="pdp" value={tab} onChange={setTab} tabs={[{ value: 'use', label: 'Приём' }]} />
 *   <TabPanel idPrefix="pdp" value="use" active={tab}>…</TabPanel>
 */
export function Tabs({ label, idPrefix, value, onChange, tabs, className = '' }) {
  const listRef = useRef(null);

  const onKeyDown = (e) => {
    const i = tabs.findIndex((t) => t.value === value);
    const last = tabs.length - 1;
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: last }[e.key];
    if (next == null) return;
    e.preventDefault();
    const target = tabs[(next + tabs.length) % tabs.length];
    onChange(target.value);
    listRef.current?.querySelector(`#${CSS.escape(tabId(idPrefix, target.value))}`)?.focus();
  };

  return (
    <div ref={listRef} role="tablist" aria-label={label} className={`ui-tabs ${className}`} onKeyDown={onKeyDown}>
      {tabs.map((tab) => {
        const on = tab.value === value;
        return (
          <button
            key={tab.value}
            id={tabId(idPrefix, tab.value)}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={panelId(idPrefix, tab.value)}
            tabIndex={on ? 0 : -1}
            className={`ui-tab${on ? ' is-on' : ''}`}
            onClick={() => onChange(tab.value)}
          >
            {tab.label}
            {on && <m.span className="ui-tab-line" layoutId={`tabs-${idPrefix}`} transition={SPRING.snappy} aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

/** Panel of one tab; hidden unless `active` equals its `value`. */
export function TabPanel({ idPrefix, value, active, className = '', children }) {
  return (
    <div
      id={panelId(idPrefix, value)}
      role="tabpanel"
      aria-labelledby={tabId(idPrefix, value)}
      hidden={active !== value}
      tabIndex={0}
      className={`ui-tabpanel ${className}`}
    >
      {children}
    </div>
  );
}

export default Tabs;
