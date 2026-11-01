import React, { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Search, Close } from '../../components/Icons.jsx';
import './SearchWithin.css';

const DEBOUNCE = 220;

/**
 * Search inside the current catalogue view. The query lands in the URL a moment after typing stops;
 * the field follows the URL when back/forward or a removed chip changes it.
 */
export default function SearchWithin({ value, onChange, placeholder }) {
  const { t } = useI18n();
  const id = useId();
  const [text, setText] = useState(value);
  const timer = useRef(0);
  const sent = useRef(value);
  const input = useRef(null);

  useEffect(() => {
    if (value !== sent.current) {
      sent.current = value;
      setText(value);
    }
  }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const push = (next) => {
    clearTimeout(timer.current);
    const q = next.trim();
    if (q === sent.current) return;
    // The first letters start a new history entry; refining the same search replaces it.
    const replace = Boolean(sent.current);
    sent.current = q;
    onChange(q, { replace });
  };

  return (
    <form
      className="shop-search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        push(text);
      }}
    >
      <label htmlFor={id} className="sr-only">
        {t('catalog.searchLabel')}
      </label>
      <Search size={20} className="shop-search-icon" />
      <input
        ref={input}
        id={id}
        type="search"
        className="shop-search-input"
        value={text}
        placeholder={placeholder}
        autoComplete="off"
        enterKeyHint="search"
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => push(next), DEBOUNCE);
        }}
      />
      {text && (
        <button
          type="button"
          className="shop-search-clear"
          aria-label={t('catalog.searchClear')}
          title={t('catalog.searchClear')}
          onClick={() => {
            setText('');
            push('');
            input.current?.focus();
          }}
        >
          <Close size={18} />
        </button>
      )}
    </form>
  );
}
