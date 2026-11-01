import React, { useMemo, useState } from 'react';
import { useCatalog, searchProducts, productTitle, formatSum } from '../../catalog/index.js';
import { pickOrbit } from '../home/Orbit.jsx';
import { Plus, Search } from '../../components/Icons.jsx';
import { OrderTools, moveItem } from './fields.jsx';

export const SHOWCASE_MAX = 14;
// Below this many usable products the home page ignores the list and picks automatically (pickOrbit).
const SHOWCASE_MIN = 3;
const RESULTS = 20;

const usable = (p) => p && p.image && p.isAvailable !== false;

function Thumb({ product }) {
  return (
    <span className="ap-sc-thumb">
      {product?.image ? <img src={product.image} alt="" loading="lazy" /> : <span>нет фото</span>}
    </span>
  );
}

function Meta({ product }) {
  return (
    <span className="ap-sc-meta">
      <span className="ap-sc-title">{productTitle(product, 'ru')}</span>
      <span className="ap-sc-sub">
        {[product.brandName, formatSum(product.price, 'ru')].filter(Boolean).join(' · ')}
      </span>
    </span>
  );
}

/** «Витрина»: the products of the home orbit, in order; an empty list leaves the choice to the page. */
export default function ShowcaseEditor({ ids, patch }) {
  const { products, status, index, byId } = useCatalog();
  const [q, setQ] = useState('');

  const full = ids.length >= SHOWCASE_MAX;
  const okCount = ids.filter((id) => usable(byId.get(String(id)))).length;
  const auto = ids.length === 0 || okCount < SHOWCASE_MIN;

  const results = useMemo(() => {
    if (!q.trim()) return [];
    const taken = new Set(ids.map(String));
    return searchProducts(products, q, index).filter((p) => !taken.has(String(p._id))).slice(0, RESULTS);
  }, [products, index, q, ids]);

  const autoPick = useMemo(() => pickOrbit(products, null, 12), [products]);

  const setIds = (fn) => patch((d) => { fn(d.home.showcase.productIds); });
  const add = (id) => setIds((list) => { if (list.length < SHOWCASE_MAX && !list.includes(id)) list.push(id); });

  return (
    <>
      <p className="ap-hint">
        Товары, которые кружатся вокруг солнца на главном экране, в этом порядке (до {SHOWCASE_MAX}). На телефоне
        видны первые 8. Круг выглядит полным от 8 товаров, лучше разных брендов и с фото на белом фоне.
        Если список пуст, сайт сам выбирает товары разных брендов.
      </p>

      <div className={`ap-sc-status ${auto ? '' : 'is-manual'}`} role="status">
        {ids.length === 0 && 'Сейчас: автоматический выбор.'}
        {ids.length > 0 && !auto && `Сейчас: ваш список, ${okCount} из ${SHOWCASE_MAX}.`}
        {ids.length > 0 && auto &&
          `Нужно минимум ${SHOWCASE_MIN} товара с фото и в наличии, иначе главная выбирает автоматически. Сейчас подходит: ${okCount}.`}
      </div>

      {ids.length > 0 && (
        <>
          <ol className="ap-sc-list" aria-label="Выбранные товары">
            {ids.map((id, i) => {
              const p = byId.get(String(id));
              const what = p ? productTitle(p, 'ru') : 'товар';
              const problem = !p
                ? status === 'ready' ? 'Товар не найден в каталоге' : null
                : !p.image ? 'Нет фото, на главной не покажется' : p.isAvailable === false ? 'Нет в наличии, на главной не покажется' : null;
              return (
                <li key={id} className={`ap-sc-row ${problem ? 'has-problem' : ''}`}>
                  <span className="ap-sc-pos">{i + 1}</span>
                  {p ? <Thumb product={p} /> : <span className="ap-sc-thumb" />}
                  {p ? <Meta product={p} /> : <span className="ap-sc-meta"><span className="ap-sc-title">{status === 'ready' ? id : 'Загрузка…'}</span></span>}
                  {problem && <span className="ap-sc-problem">{problem}</span>}
                  <OrderTools
                    index={i}
                    count={ids.length}
                    what={what}
                    onMove={(from, to) => setIds((list) => moveItem(list, from, to))}
                    onRemove={(at) => setIds((list) => { list.splice(at, 1); })}
                  />
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              if (window.confirm('Очистить витрину? Главная снова будет выбирать товары автоматически.')) {
                setIds((list) => { list.length = 0; });
              }
            }}
          >
            Очистить, выбирать автоматически
          </button>
        </>
      )}

      <h3 className="ap-subhead">Добавить товар</h3>
      <label className="ap-field ap-sc-search">
        <span>Поиск по каталогу: название, бренд или состав</span>
        <span className="ap-sc-input">
          <Search size={18} aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Например, Solgar или магний" />
        </span>
      </label>
      {full && <p className="ap-hint">В витрине уже {SHOWCASE_MAX} товаров. Уберите один, чтобы добавить другой.</p>}
      {q.trim() && (
        <ul className="ap-sc-results" aria-label="Найденные товары">
          {results.length === 0 && <li className="ap-hint">Ничего не найдено.</li>}
          {results.map((p) => (
            <li key={p._id} className="ap-sc-row">
              <Thumb product={p} />
              <Meta product={p} />
              {!usable(p) && <span className="ap-sc-problem">{p.image ? 'Нет в наличии' : 'Нет фото'}</span>}
              <button
                type="button"
                className="ap-mini ap-sc-add"
                disabled={full}
                onClick={() => add(String(p._id))}
                aria-label={`Добавить: ${productTitle(p, 'ru')}`}
              >
                <Plus size={16} aria-hidden="true" /> Добавить
              </button>
            </li>
          ))}
        </ul>
      )}

      {ids.length === 0 && autoPick.length > 0 && (
        <>
          <h3 className="ap-subhead">Сейчас на главной автоматически</h3>
          <ul className="ap-sc-auto" aria-label="Автоматический выбор">
            {autoPick.map((p) => (
              <li key={p._id} title={productTitle(p, 'ru')}>
                <Thumb product={p} />
                <span>{p.brandName}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setIds((list) => { list.push(...autoPick.map((p) => String(p._id))); })}
          >
            Взять этот набор и изменить
          </button>
        </>
      )}
    </>
  );
}
