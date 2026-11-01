import React from 'react';
import { Field, LangTabs, OrderTools, moveItem } from './fields.jsx';

const EMPTY = () => ({ ru: { name: '', city: '', text: '' }, uz: { name: '', city: '', text: '' } });

/**
 * Reviews for the home page as written by real customers. Saved data: [{ ru: {name, city, text}, uz: {...} }].
 * The section appears on the home page only while at least one review has text.
 */
export default function ReviewsEditor({ reviews, lang, setLang, patch }) {
  const set = (i, field) => (v) => patch((d) => {
    d.home.reviews[i][lang] = { name: '', city: '', text: '', ...d.home.reviews[i][lang], [field]: v };
  });

  return (
    <>
      <p className="ap-note">Добавляйте только настоящие отзывы с согласия покупателя.</p>
      <p className="ap-hint">
        Пока здесь пусто, блока отзывов на главной нет. Если отзыв есть только на русском, узбекская версия
        сайта покажет его на русском.
      </p>
      <LangTabs lang={lang} setLang={setLang} />
      {reviews.length === 0 && <p className="ap-hint">Отзывов пока нет.</p>}
      <ol className="ap-list">
        {reviews.map((r, i) => {
          const who = r.ru?.name || r.uz?.name || `отзыв ${i + 1}`;
          return (
            <li className="ap-card" key={i}>
              <div className="ap-card-head">
                <strong className="ap-card-num">Отзыв {i + 1}</strong>
                <OrderTools
                  index={i}
                  count={reviews.length}
                  what={who}
                  confirmRemove={`Удалить отзыв ${i + 1}?`}
                  onMove={(from, to) => patch((d) => moveItem(d.home.reviews, from, to))}
                  onRemove={(at) => patch((d) => { d.home.reviews.splice(at, 1); })}
                />
              </div>
              <Field label={`Текст (${lang.toUpperCase()})`} area rows={4} value={r[lang]?.text} onChange={set(i, 'text')} />
              <div className="ap-row2">
                <Field label={`Имя (${lang.toUpperCase()})`} value={r[lang]?.name} onChange={set(i, 'name')} />
                <Field label={`Город (${lang.toUpperCase()})`} value={r[lang]?.city} onChange={set(i, 'city')} />
              </div>
            </li>
          );
        })}
      </ol>
      <button type="button" className="btn btn-outline" onClick={() => patch((d) => { d.home.reviews.push(EMPTY()); })}>
        Добавить отзыв
      </button>
    </>
  );
}

/** Before saving: trimmed fields, no empty language versions (the page would pick an empty one), no empty reviews. */
export function cleanReviews(list) {
  return (Array.isArray(list) ? list : [])
    .map((r) => {
      const out = {};
      for (const l of ['ru', 'uz']) {
        const v = r?.[l] || {};
        const entry = { name: String(v.name || '').trim(), city: String(v.city || '').trim(), text: String(v.text || '').trim() };
        if (entry.text) out[l] = entry;
      }
      return out;
    })
    .filter((r) => r.ru || r.uz);
}
