import React, { useEffect, useState, useMemo } from 'react';
import {
  listProductsAdmin,
  createProduct,
  updateProduct,
  deleteProduct,
  toggleProduct,
} from '../adminApi';
import Modal, { ConfirmDialog } from '../components/Modal';
import MultiImageUpload from '../components/MultiImageUpload';

const CATEGORIES = [
  { key: 'vitamins', label: 'Витамины' },
  { key: 'supplements', label: 'Добавки' },
  { key: 'cosmetics', label: 'Косметика' },
  { key: 'parapharmaceuticals', label: 'Парафармация' },
  { key: 'hygiene', label: 'Гигиена' },
  { key: 'drinks', label: 'Напитки' },
];

function fmtPrice(n) {
  return (Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' UZS';
}
function catLabel(k) { return CATEGORIES.find((c) => c.key === k)?.label || k; }

export default function Products({ toast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [availability, setAvailability] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | product
  const [confirm, setConfirm] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (category) params.category = category;
      if (availability) params.availability = availability;
      const res = await listProductsAdmin(params);
      setItems(res.data || []);
    } catch (e) {
      toast?.err(e.message || 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [search, category, availability]);

  const onToggle = async (p) => {
    try {
      const res = await toggleProduct(p._id);
      setItems((prev) => prev.map((x) => (x._id === p._id ? res.data : x)));
      toast?.ok(res.data.isAvailable ? 'В наличии' : 'Нет в наличии');
    } catch (e) {
      toast?.err(e.message || 'Ошибка');
    }
  };

  const onDelete = async (p) => {
    try {
      await deleteProduct(p._id);
      setItems((prev) => prev.filter((x) => x._id !== p._id));
      toast?.ok('Удалено');
    } catch (e) {
      toast?.err(e.message || 'Ошибка');
    }
  };

  const onSaved = (product, isNew) => {
    if (isNew) setItems((prev) => [product, ...prev]);
    else setItems((prev) => prev.map((x) => (x._id === product._id ? product : x)));
    setEditing(null);
    toast?.ok(isNew ? 'Товар добавлен' : 'Товар обновлён');
  };

  const summary = useMemo(() => {
    const total = items.length;
    const available = items.filter((p) => p.isAvailable).length;
    return { total, available, unavailable: total - available };
  }, [items]);

  return (
    <div className="ap-page">
      <div className="ap-page-head">
        <div>
          <h1 className="ap-page-title">Товары</h1>
          <div className="ap-page-sub">
            Всего: {summary.total} · В наличии: {summary.available} · Нет: {summary.unavailable}
          </div>
        </div>
        <div className="ap-row">
          <button className="ap-btn ap-btn-ghost" onClick={load}>Обновить</button>
          <button className="ap-btn ap-btn-primary" onClick={() => setEditing('new')}>
            + Новый товар
          </button>
        </div>
      </div>

      <div className="ap-filters">
        <input
          type="text"
          className="ap-input"
          placeholder="Название, бренд, SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="ap-input ap-select"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Все категории</option>
          {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <select
          className="ap-input ap-select"
          value={availability}
          onChange={(e) => setAvailability(e.target.value)}
        >
          <option value="">Все</option>
          <option value="available">В наличии</option>
          <option value="unavailable">Нет в наличии</option>
        </select>
      </div>

      {loading ? (
        <div className="ap-muted">Загрузка…</div>
      ) : items.length === 0 ? (
        <div className="ap-empty">Ничего не найдено</div>
      ) : (
        <div className="ap-product-grid">
          {items.map((p) => (
            <div
              key={p._id}
              className={`ap-product-card ${p.isAvailable ? '' : 'unavailable'}`}
            >
              <div className="ap-product-media">
                {p.imageUrl
                  ? <img src={p.imageUrl} alt={p.name} onError={(e) => { e.target.style.opacity = 0.15; }} />
                  : <span className="ap-muted">Нет фото</span>}
                {!p.isAvailable && <div className="ap-stock-over">НЕТ В НАЛИЧИИ</div>}
              </div>
              <div className="ap-product-body">
                <div className="ap-product-brand">{p.brand || '—'}</div>
                <div className="ap-product-name">{p.name}</div>
                <div className="ap-muted-sm">{catLabel(p.category)}</div>
                {p.oldPrice && p.oldPrice > p.price ? (
                  <div className="ap-product-price-row">
                    <span className="ap-product-price-old">{fmtPrice(p.oldPrice)}</span>
                    <span className="ap-product-price discounted">{fmtPrice(p.price)}</span>
                    <span className="ap-product-discount-badge">
                      −{Math.round(((p.oldPrice - p.price) / p.oldPrice) * 100)}%
                    </span>
                  </div>
                ) : (
                  <div className="ap-product-price">{fmtPrice(p.price)}</div>
                )}
              </div>
              <div className="ap-product-actions">
                <button
                  className={`ap-toggle ${p.isAvailable ? 'on' : 'off'}`}
                  onClick={() => onToggle(p)}
                  title={p.isAvailable ? 'В наличии' : 'Нет в наличии'}
                >
                  <span className="ap-toggle-dot" />
                  <span className="ap-toggle-label">
                    {p.isAvailable ? 'в наличии' : 'нет'}
                  </span>
                </button>
                <div className="ap-row-actions">
                  <button className="ap-btn ap-btn-xs ap-btn-ghost" onClick={() => setEditing(p)}>
                    Изменить
                  </button>
                  <button
                    className="ap-btn ap-btn-xs ap-btn-danger"
                    onClick={() => setConfirm({
                      title: 'Удалить товар',
                      message: `Удалить «${p.name}»? Это действие нельзя отменить.`,
                      onConfirm: () => onDelete(p),
                    })}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ProductEditor
          product={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function ProductEditor({ product, onClose, onSaved }) {
  const isNew = !product;
  const [name, setName] = useState(product?.name || '');
  const [nameUz, setNameUz] = useState(product?.nameUz || '');
  const [brand, setBrand] = useState(product?.brand || 'Fairhaven Health');
  const [sku, setSku] = useState(product?.sku || '');
  const [price, setPrice] = useState(product?.price || 0);
  const [oldPrice, setOldPrice] = useState(product?.oldPrice || 0);
  const [discountEnabled, setDiscountEnabled] = useState(Boolean(product?.oldPrice && product.oldPrice > product.price));
  const [cat, setCat] = useState(product?.category || 'supplements');
  const [description, setDescription] = useState(product?.description || '');
  const [descriptionUz, setDescriptionUz] = useState(product?.descriptionUz || '');
  const [descriptionUzLat, setDescriptionUzLat] = useState(product?.descriptionUzLat || '');
  const [imageUrl, setImageUrl] = useState(product?.imageUrl || '');
  const [images, setImages] = useState(Array.isArray(product?.images) ? product.images : []);
  const [isAvailable, setIsAvailable] = useState(product?.isAvailable !== false);
  const [tags, setTags] = useState((product?.tags || []).join(', '));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const priceN = Number(price) || 0;
  const oldPriceN = Number(oldPrice) || 0;
  const computedPercent = discountEnabled && oldPriceN > priceN && oldPriceN > 0
    ? Math.round(((oldPriceN - priceN) / oldPriceN) * 100)
    : 0;

  const applyPercent = (pct) => {
    const p = Number(pct);
    if (!p || p <= 0 || p >= 100 || !priceN) return;
    const newOld = Math.round(priceN / (1 - p / 100));
    setOldPrice(newOld);
  };

  const save = async () => {
    setErr('');
    if (!name.trim()) { setErr('Укажите название'); return; }
    if (!priceN || priceN <= 0) { setErr('Укажите цену'); return; }
    if (discountEnabled && (!oldPriceN || oldPriceN <= priceN)) {
      setErr('Старая цена должна быть больше текущей');
      return;
    }
    const body = {
      name: name.trim(),
      nameUz: nameUz.trim(),
      brand: brand.trim(),
      sku: sku.trim(),
      price: priceN,
      oldPrice: discountEnabled ? oldPriceN : 0,
      category: cat,
      description: description.trim(),
      descriptionUz: descriptionUz.trim(),
      descriptionUzLat: descriptionUzLat.trim(),
      imageUrl,
      images: images.filter(Boolean),
      isAvailable,
      tags: tags.split(',').map((s) => s.trim()).filter(Boolean),
    };
    try {
      setSaving(true);
      const res = isNew ? await createProduct(body) : await updateProduct(product._id, body);
      onSaved(res.data, isNew);
    } catch (e) {
      setErr(e.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={isNew ? 'Новый товар' : 'Редактировать товар'}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="ap-btn ap-btn-ghost" onClick={onClose}>Отмена</button>
          <button className="ap-btn ap-btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </>
      }
    >
      {err && <div className="ap-error">{err}</div>}

      <MultiImageUpload
        primary={imageUrl}
        extras={images}
        onChangePrimary={setImageUrl}
        onChangeExtras={setImages}
      />

      <div className="ap-form-grid">
        <div>
          <label className="ap-label">Название (рус)</label>
          <input className="ap-input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="ap-label">Nomi (uz)</label>
          <input className="ap-input" value={nameUz} onChange={(e) => setNameUz(e.target.value)} />
        </div>
        <div>
          <label className="ap-label">Бренд</label>
          <input className="ap-input" value={brand} onChange={(e) => setBrand(e.target.value)} />
        </div>
        <div>
          <label className="ap-label">SKU</label>
          <input className="ap-input" value={sku} onChange={(e) => setSku(e.target.value)} />
        </div>
        <div>
          <label className="ap-label">Цена (UZS)</label>
          <input
            className="ap-input"
            type="number"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div>
          <label className="ap-label">Категория</label>
          <select className="ap-input ap-select" value={cat} onChange={(e) => setCat(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div className="ap-discount-block">
            <label className="ap-checkbox">
              <input
                type="checkbox"
                checked={discountEnabled}
                onChange={(e) => {
                  setDiscountEnabled(e.target.checked);
                  if (!e.target.checked) setOldPrice(0);
                }}
              />
              <span>🎯 Включить скидку (зачёркнутая старая цена + % бейдж)</span>
            </label>

            {discountEnabled && (
              <div className="ap-discount-grid">
                <div>
                  <label className="ap-label">Старая цена (UZS)</label>
                  <input
                    className="ap-input"
                    type="number"
                    min="0"
                    value={oldPrice}
                    onChange={(e) => setOldPrice(e.target.value)}
                    placeholder="600000"
                  />
                </div>
                <div>
                  <label className="ap-label">Быстро: % скидки</label>
                  <div className="ap-discount-presets">
                    {[5, 10, 15, 20, 25, 30, 40, 50].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        className={`ap-discount-preset ${computedPercent === pct ? 'active' : ''}`}
                        onClick={() => applyPercent(pct)}
                      >
                        −{pct}%
                      </button>
                    ))}
                  </div>
                </div>
                <div className="ap-discount-preview">
                  {computedPercent > 0 && oldPriceN > priceN ? (
                    <>
                      <div className="ap-discount-percent">−{computedPercent}%</div>
                      <div>
                        <span className="ap-discount-old">{oldPriceN.toLocaleString('ru-RU')} UZS</span>
                        <span className="ap-discount-new">{priceN.toLocaleString('ru-RU')} UZS</span>
                      </div>
                      <div className="ap-discount-save">
                        Экономия {(oldPriceN - priceN).toLocaleString('ru-RU')} UZS
                      </div>
                    </>
                  ) : (
                    <div className="ap-muted-sm">Укажите старую цену больше текущей, чтобы увидеть превью</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="ap-label">Описание (рус)</label>
          <textarea
            className="ap-input ap-textarea"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="ap-label">Tavsif (uz · кириллица)</label>
          <textarea
            className="ap-input ap-textarea"
            rows={2}
            value={descriptionUz}
            onChange={(e) => setDescriptionUz(e.target.value)}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="ap-label">Tavsif (uz · lotin)</label>
          <textarea
            className="ap-input ap-textarea"
            rows={2}
            value={descriptionUzLat}
            onChange={(e) => setDescriptionUzLat(e.target.value)}
            placeholder="Mahsulot haqida lotin alifbosida tavsif…"
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="ap-label">Теги (через запятую)</label>
          <input className="ap-input" value={tags} onChange={(e) => setTags(e.target.value)} />
        </div>
      </div>

      <label className="ap-checkbox" style={{ marginTop: 14 }}>
        <input
          type="checkbox"
          checked={isAvailable}
          onChange={(e) => setIsAvailable(e.target.checked)}
        />
        <span>В наличии (виден на сайте и доступен для заказа)</span>
      </label>
    </Modal>
  );
}
