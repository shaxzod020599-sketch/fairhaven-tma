import React, { useCallback, useEffect, useState } from 'react';
import { productsApi } from '../../api/products';
import { formatDateTime, formatMoney, formatNumber } from '../../lib/format';
import { CATEGORIES, CHANNELS, duplicateDraft, emptyProduct, validateProduct } from './productModel';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { DataState } from '../../ui/DataState';
import { Dialog } from '../../ui/Dialog';
import { Field } from '../../ui/Field';
import { Pagination } from '../../ui/Pagination';
import { useToast } from '../../ui/ToastProvider';
import { ExcelDialog } from './ExcelDialog';

const LIMIT = 24;

function ChannelRow({ product, definition, onSave }) {
  const value = product.channels?.[definition.key] || {};
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="fh-channel-row">
      <div className="fh-channel-row__name"><span>{definition.label}</span><Badge tone={value.live ? 'success' : 'neutral'}>{value.live ? 'В продаже' : 'Скрыт'}</Badge></div>
      <label><span>Канал</span><input type="checkbox" checked={Boolean(draft.enabled)} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /></label>
      <label><span>Цена</span><input className="fh-input fh-mono" type="number" value={draft.price || 0} onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) })} /></label>
      <label><span>Наличие</span><select className="fh-select" value={draft.forceStatus || 'auto'} onChange={(event) => setDraft({ ...draft, forceStatus: event.target.value })}><option value="auto">По Billz</option><option value="in">Есть</option><option value="out">Нет</option></select></label>
      <label><span>Защита остатка</span><input className="fh-input fh-mono" type="number" min="0" value={draft.minStock || 0} onChange={(event) => setDraft({ ...draft, minStock: Number(event.target.value) })} /></label>
      <Button size="sm" onClick={() => onSave(definition.key, draft)}>Сохранить</Button>
    </div>
  );
}

function BillzBlock({ product, onLink }) {
  if (!product.billz) {
    return <div className="fh-billz fh-billz--empty"><div><p className="fh-eyebrow">BILLZ / НЕ СВЯЗАН</p><h3>Нет данных об остатке</h3><p>Свяжите карточку с номенклатурой Billz. Цена и остаток появятся здесь.</p></div><Button variant="primary" onClick={onLink}>Связать с Billz</Button></div>;
  }
  return (
    <div className="fh-billz">
      <div className="fh-billz__head"><p className="fh-eyebrow">BILLZ / ИСТОЧНИК ОСТАТКА</p><span>{formatDateTime(product.billz.syncedAt)}</span></div>
      <div className="fh-billz__numbers"><div><span>Цена в Billz</span><strong>{formatMoney(product.billz.retailPrice)}</strong></div><div><span>Остаток</span><strong>{formatNumber(product.billz.stock)} шт.</strong></div><div><span>Доступно</span><strong>{formatNumber(product.billz.available)} шт.</strong></div></div>
      <div className="fh-billz__foot"><span>Резерв {product.billz.reservedQty || 0}</span><span>Ожидает {product.billz.pendingQty || 0}</span>{product.billz.deletedInBillz && <Badge tone="danger">Удалён в Billz</Badge>}</div>
    </div>
  );
}

function ProductCard({ product, onEdit, onDuplicate, onLink, onChannel }) {
  return (
    <Card className="fh-product-card">
      <div className="fh-product-card__identity">
        <div className="fh-product-card__image">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span>FH</span>}</div>
        <div><p>{product.brand || 'Fairhaven Health'}</p><h2>{product.name}</h2><div className="fh-product-card__meta"><span className="fh-mono">{product.sku || 'SKU не указан'}</span><span>{CATEGORIES.find(([key]) => key === product.category)?.[1] || product.category}</span><Badge tone={product.shop?.visible || product.isAvailable ? 'success' : 'neutral'}>{product.shop?.visible || product.isAvailable ? 'На fairhaven.uz' : 'Скрыт с fairhaven.uz'}</Badge></div></div>
        <div className="fh-product-card__price"><span>Цена FairHaven</span><strong>{formatMoney(product.price)}</strong><div><Button size="sm" onClick={onEdit}>Изменить</Button><Button size="sm" variant="ghost" onClick={onDuplicate}>Дублировать</Button></div></div>
      </div>
      <BillzBlock product={product} onLink={onLink} />
      <section className="fh-channel-matrix"><div className="fh-channel-matrix__head"><div><h3>Где продаётся</h3><p>Цена, наличие и защищённый остаток каждого сервиса.</p></div><div className="fh-mxik-chip"><span>ИКПУ</span><b className="fh-mono">{product.mxikCode || 'По умолчанию'}</b></div></div>{CHANNELS.map((definition) => <ChannelRow key={definition.key} product={product} definition={definition} onSave={onChannel} />)}</section>
    </Card>
  );
}

function BillzPicker({ product, api, onClose, onLinked }) {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (value) => {
    setLoading(true);
    try { const response = await api.searchBillz({ search: value, limit: 50 }); setRows(response.data || []); setError(''); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [api]);

  useEffect(() => { load(''); }, [load]);
  useEffect(() => { const timer = window.setTimeout(() => { if (search) load(search.trim()); }, 300); return () => window.clearTimeout(timer); }, [load, search]);

  const choose = async (row) => {
    if (row.linkedTo) return;
    const response = await api.link(product._id, row.billzProductId);
    onLinked(response.data);
  };

  return (
    <Dialog open title="Связать с Billz" description="Список открыт сразу. Введите название, SKU или штрихкод, чтобы сузить выбор." onClose={onClose} width="720px">
      <input autoFocus className="fh-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Название, SKU или штрихкод" aria-label="Поиск в Billz" />
      {loading ? <div className="fh-picker-loading">Загружаем номенклатуру…</div> : error ? <DataState tone="error" title="Billz недоступен" message={error} actionLabel="Повторить" onAction={() => load(search)} /> : <div className="fh-billz-picker">{rows.map((row) => <button type="button" key={row.billzProductId} disabled={Boolean(row.linkedTo)} onClick={() => choose(row)}><span><b>{row.name}</b><small>{row.sku || 'Без SKU'}{row.linkedTo ? ` · уже связан с «${row.linkedTo}»` : ''}</small></span><span><b>{formatMoney(row.retailPrice)}</b><small>{formatNumber(row.stock)} шт.</small></span></button>)}</div>}
    </Dialog>
  );
}

function ProductEditor({ draft: initial, api, onClose, onSaved }) {
  const isNew = !initial._id;
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const save = async () => {
    const nextErrors = validateProduct(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    try { const response = isNew ? await api.create(draft) : await api.update(draft._id, draft); onSaved(response.data); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open title={isNew ? 'Новый товар' : 'Изменить товар'} description="Карточка FairHaven, описания и изображения. Billz и сервисы настраиваются в этом же товаре." onClose={onClose} width="900px">
      <div className="fh-form-grid">
        <Field label="Название" error={errors.name}><input className="fh-input" value={draft.name || ''} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Бренд"><input className="fh-input" value={draft.brand || ''} onChange={(e) => set('brand', e.target.value)} /></Field>
        <Field label="Категория" error={errors.category}><select className="fh-select" value={draft.category || ''} onChange={(e) => set('category', e.target.value)}>{CATEGORIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
        <Field label="SKU"><input className="fh-input fh-mono" value={draft.sku || ''} onChange={(e) => set('sku', e.target.value)} /></Field>
        <Field label="Цена FairHaven" error={errors.price}><input className="fh-input fh-mono" type="number" value={draft.price || 0} onChange={(e) => set('price', Number(e.target.value))} /></Field>
        <Field label="Старая цена"><input className="fh-input fh-mono" type="number" value={draft.oldPrice || 0} onChange={(e) => set('oldPrice', Number(e.target.value))} /></Field>
        <Field label="ИКПУ" hint="Оставьте пустым — применится общий код." error={errors.mxikCode}><input className="fh-input fh-mono" value={draft.mxikCode || ''} onChange={(e) => set('mxikCode', e.target.value)} /></Field>
        <Field label="Главное изображение"><input className="fh-input" value={draft.imageUrl || ''} onChange={(e) => set('imageUrl', e.target.value)} /></Field>
      </div>
      <div className="fh-form-stack"><Field label="Описание на русском"><textarea className="fh-textarea" value={draft.description || ''} onChange={(e) => set('description', e.target.value)} /></Field><Field label="Описание на узбекском"><textarea className="fh-textarea" value={draft.descriptionUz || ''} onChange={(e) => set('descriptionUz', e.target.value)} /></Field><Field label="O‘zbekcha tavsif"><textarea className="fh-textarea" value={draft.descriptionUzLat || ''} onChange={(e) => set('descriptionUzLat', e.target.value)} /></Field></div>
      <div className="fh-dialog-actions"><Button onClick={onClose}>Отмена</Button><Button variant="primary" disabled={saving} onClick={save}>{saving ? 'Сохраняем…' : 'Сохранить товар'}</Button></div>
    </Dialog>
  );
}

export function ProductsPage({ api = productsApi }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState(null);
  const [linking, setLinking] = useState(null);
  const [excel, setExcel] = useState(false);

  useEffect(() => { const timer = window.setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300); return () => window.clearTimeout(timer); }, [search]);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [products, counts] = await Promise.all([api.list({ page, limit: LIMIT, search: query, filter }), api.summary()]);
      setRows(products.data || []); setTotal(products.meta?.total || 0); setSummary(counts.data?.counts || counts.data || {}); setError('');
    } catch (err) { setError(err.message || 'Не удалось загрузить товары'); }
    finally { setLoading(false); }
  }, [api, filter, page, query]);
  useEffect(() => { load(); }, [load]);

  const replace = (updated) => setRows((current) => current.map((row) => row._id === updated._id ? { ...row, ...updated } : row));
  const saveChannel = async (product, channel, body) => { try { const response = await api.updateChannel(product._id, channel, body); replace(response.data); toast?.success?.(`${channel === 'medicalka' ? 'Medicalka' : 'Uzum'} обновлён`); } catch (err) { toast?.error?.(err.message); } };
  const saved = (product) => { setEditor(null); setRows((current) => current.some((row) => row._id === product._id) ? current.map((row) => row._id === product._id ? { ...row, ...product } : row) : [product, ...current]); toast?.success?.('Товар сохранён'); };

  const chips = [['', 'Все', summary.total], ['unlinked', 'Без Billz', summary.unlinked], ['out_of_stock', 'Нет остатка', summary.out_of_stock], ['no_price', 'Нет цены', summary.no_price], ['no_mxik', 'Без ИКПУ', summary.no_mxik]];
  return (
    <div className="fh-page fh-products">
      <header className="fh-page-head"><div><p className="fh-eyebrow">КАТАЛОГ + КАНАЛЫ</p><h1>Товары</h1><p>Billz, FairHaven, Medicalka и Uzum — в одной карточке.</p></div><div className="fh-head-actions"><Button onClick={() => setEditor(emptyProduct())}>Добавить товар</Button><Button variant="primary" onClick={() => setExcel(true)}>Excel</Button></div></header>
      <div className="fh-toolbar fh-toolbar--stack"><input className="fh-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Название, бренд, SKU или штрихкод" aria-label="Поиск товаров" /><div className="fh-filter-chips">{chips.map(([key, label, count]) => <button key={key} type="button" className={filter === key ? 'is-active' : ''} onClick={() => { setFilter(key); setPage(1); }}>{label}<b>{count || 0}</b></button>)}</div></div>
      {error && rows.length > 0 && <div className="fh-stale-note">Не удалось обновить каталог. Показываем предыдущие данные.</div>}
      {loading && rows.length === 0 ? <div className="fh-page-skeleton"><span /><span /><span /></div> : error && rows.length === 0 ? <DataState tone="error" title="Каталог недоступен" message={error} actionLabel="Повторить" onAction={load} /> : rows.length === 0 ? <DataState title="Товары не найдены" message="Измените фильтр или добавьте первый товар." actionLabel="Добавить товар" onAction={() => setEditor(emptyProduct())} /> : <div className="fh-product-list">{rows.map((product) => <ProductCard key={product._id} product={product} onEdit={() => setEditor(product)} onDuplicate={() => setEditor(duplicateDraft(product))} onLink={() => setLinking(product)} onChannel={(channel, body) => saveChannel(product, channel, body)} />)}</div>}
      <Pagination page={page} total={total} limit={LIMIT} onPage={setPage} />
      {linking && <BillzPicker product={linking} api={api} onClose={() => setLinking(null)} onLinked={(updated) => { replace(updated); setLinking(null); toast?.success?.('Товар связан с Billz'); }} />}
      {editor && <ProductEditor draft={editor} api={api} onClose={() => setEditor(null)} onSaved={saved} />}
      <ExcelDialog open={excel} api={api} onClose={() => setExcel(false)} onApplied={() => { load(); toast?.success?.('Изменения из Excel применены'); }} />
    </div>
  );
}
