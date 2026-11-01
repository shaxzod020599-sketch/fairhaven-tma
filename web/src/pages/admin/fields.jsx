import React from 'react';
import { ChevronDown, ChevronUp, Close } from '../../components/Icons.jsx';

export function Field({ label, value, onChange, area = false, rows = 3, hint, placeholder }) {
  return (
    <label className="ap-field">
      <span>{label}</span>
      {area ? (
        <textarea value={value || ''} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type="text" value={value || ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && <small className="ap-field-hint">{hint}</small>}
    </label>
  );
}

export function LangTabs({ lang, setLang }) {
  return (
    <div className="ap-langtabs" role="group" aria-label="Язык текста">
      {['ru', 'uz'].map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          className={lang === l ? 'active' : ''}
          onClick={() => setLang(l)}
        >
          {l === 'ru' ? 'Русский' : 'O‘zbekcha'}
        </button>
      ))}
    </div>
  );
}

/** Up, down and remove for one item of an ordered list; `what` names the item for screen readers. */
export function OrderTools({ index, count, what, onMove, onRemove, confirmRemove }) {
  return (
    <div className="ap-card-tools">
      <button
        type="button"
        className="ap-icon"
        disabled={index === 0}
        aria-label={`Выше: ${what}`}
        title="Выше"
        onClick={() => onMove(index, index - 1)}
      >
        <ChevronUp size={18} />
      </button>
      <button
        type="button"
        className="ap-icon"
        disabled={index === count - 1}
        aria-label={`Ниже: ${what}`}
        title="Ниже"
        onClick={() => onMove(index, index + 1)}
      >
        <ChevronDown size={18} />
      </button>
      <button
        type="button"
        className="ap-icon ap-danger"
        aria-label={`Убрать: ${what}`}
        title="Убрать"
        onClick={() => {
          if (!confirmRemove || window.confirm(confirmRemove)) onRemove(index);
        }}
      >
        <Close size={18} />
      </button>
    </div>
  );
}

/** Moves list[from] to position `to` in place (no-op outside the list). */
export function moveItem(list, from, to) {
  if (to < 0 || to >= list.length) return;
  const [x] = list.splice(from, 1);
  list.splice(to, 0, x);
}
