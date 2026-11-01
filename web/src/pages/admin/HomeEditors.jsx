import React from 'react';
import { formatSum } from '../../catalog/index.js';
import { useSettings } from '../../context/SettingsContext.jsx';
import { HOME } from '../../content/home.js';
import { useHomeFacts } from '../home/useHomeFacts.js';
import { Field, LangTabs } from './fields.jsx';

const TOKEN = /\{(brands|products|threshold)\}/g;
const HAS_TOKEN = /\{(brands|products|threshold)\}/;

/** The live values behind {brands}, {products} and {threshold}, in the language being edited. */
function useTokens(lang) {
  const { brands, products } = useHomeFacts();
  const { get } = useSettings();
  const threshold = formatSum(get('free_delivery_threshold'), lang);
  const values = { brands, products, threshold };
  return {
    values,
    fill: (text) => String(text || '').replace(TOKEN, (_, key) => values[key]),
  };
}

function TokenHint({ values }) {
  return (
    <p className="ap-hint">
      Можно вставлять метки, сайт сам подставит живые значения: <code>{'{brands}'}</code> число брендов
      (сейчас {values.brands}), <code>{'{products}'}</code> число товаров (сейчас {values.products || 'считается'}),{' '}
      <code>{'{threshold}'}</code> порог бесплатной доставки ({values.threshold}). Пустое поле = текст по умолчанию.
    </p>
  );
}

export function HeroEditor({ hero, lang, setLang, patch }) {
  const { values, fill } = useTokens(lang);
  const h = hero[lang];
  const set = (field) => (v) => patch((d) => { d.home.hero[lang][field] = v; });
  const shown = (field) => h[field] || HOME.hero[lang][field];

  return (
    <>
      <LangTabs lang={lang} setLang={setLang} />
      <TokenHint values={values} />
      <div className="ap-row2">
        <Field label="Заголовок, первая строка" value={h.line1} placeholder={HOME.hero[lang].line1} onChange={set('line1')} />
        <Field label="Заголовок, вторая строка" value={h.line2} placeholder={HOME.hero[lang].line2} onChange={set('line2')} />
      </div>
      <Field
        label="Текст под заголовком (до 20 слов)"
        area
        rows={3}
        value={h.sub}
        placeholder={HOME.hero[lang].sub}
        onChange={set('sub')}
      />
      <Field
        label="Подсказка в поле поиска"
        value={h.searchHint}
        placeholder={HOME.hero[lang].searchHint}
        onChange={set('searchHint')}
        hint="Показывается первой, затем поле по очереди предлагает реальные запросы."
      />

      <div className="ap-preview" aria-label="Как это будет выглядеть">
        <span className="ap-preview-label">На сайте</span>
        <p className="ap-preview-title">
          {fill(shown('line1'))}
          <br />
          {fill(shown('line2'))}
        </p>
        <p className="ap-preview-sub">{fill(shown('sub'))}</p>
      </div>

      <button
        type="button"
        className="btn btn-outline"
        onClick={() => patch((d) => { d.home.hero[lang] = { ...HOME.hero[lang] }; })}
      >
        Вернуть текст по умолчанию ({lang === 'ru' ? 'русский' : 'узбекский'})
      </button>
    </>
  );
}

export function TrustEditor({ trust, patch }) {
  const ru = useTokens('ru');
  return (
    <>
      <p className="ap-hint">
        Четыре коротких факта под главным экраном, со значками: оригинальность, официальный дистрибьютор,
        доставка, оплата. Пишите только то, что правда. Метка <code>{'{threshold}'}</code> подставит порог
        бесплатной доставки ({ru.values.threshold}). Пустой факт на сайте не показывается.
      </p>
      <ol className="ap-trust">
        {trust.map((item, i) => (
          <li key={i} className="ap-card">
            <strong className="ap-card-num">Факт {i + 1}</strong>
            <div className="ap-row2">
              <Field
                label="Русский"
                value={item.ru}
                onChange={(v) => patch((d) => { d.home.trust[i].ru = v; })}
                hint={item.ru && HAS_TOKEN.test(item.ru) ? `На сайте: ${ru.fill(item.ru)}` : undefined}
              />
              <Field label="O‘zbekcha" value={item.uz} onChange={(v) => patch((d) => { d.home.trust[i].uz = v; })} />
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn btn-outline"
        onClick={() => patch((d) => { d.home.trust = HOME.trust.map((x) => ({ ...x })); })}
      >
        Вернуть факты по умолчанию
      </button>
    </>
  );
}
