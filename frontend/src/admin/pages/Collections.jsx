import React, { useEffect, useState } from 'react';
import {
  listCollectionsAdmin,
  createCollection,
  updateCollectionAdmin,
  deleteCollection,
  fetchAllProductsAdmin,
  listUploads,
} from '../adminApi';
import Modal, { ConfirmDialog } from '../components/Modal';
import ImageUpload from '../components/ImageUpload';

const TONES = [
  { key: 'default', label: 'Кремовый', color: '#EFE7D5' },
  { key: 'terracotta', label: 'Терракота', color: '#C96F3E' },
  { key: 'ink', label: 'Лес (тёмный)', color: '#0E2B1F' },
  { key: 'sage', label: 'Шалфей', color: '#6F8A6A' },
  { key: 'butter', label: 'Сливочный', color: '#F2DFB5' },
];

const ART_PRESETS = ['🌸', '🌿', '🤱', '💊', '💄', '🌱', '🥤', '🍃', '✦', '🩺'];

export default function Collections({ toast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await listCollectionsAdmin();
      setItems(res.data || []);
    } catch (e) {
      toast?.err(e.message || 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onSaved = () => {
    setEditing(null);
    load();
    toast?.ok('Сохранено');
  };

  const onDelete = async (c) => {
    try {
      await deleteCollection(c._id);
      setItems((prev) => prev.filter((x) => x._id !== c._id));
      toast?.ok('Удалено');
    } catch (e) {
      toast?.err(e.message || 'Ошибка');
    }
  };

  return (
    <div className="ap-page">
      <div className="ap-page-head">
        <div>
          <h1 className="ap-page-title">Подборки</h1>
          <div className="ap-page-sub">Коллекции товаров на главной странице сайта</div>
        </div>
        <button className="ap-btn ap-btn-primary" onClick={() => setEditing('new')}>
          + Новая подборка
        </button>
      </div>

      {loading ? (
        <div className="ap-muted">Загрузка…</div>
      ) : items.length === 0 ? (
        <div className="ap-empty">Подборок пока нет</div>
      ) : (
        <div className="ap-collection-grid">
          {items.map((c) => (
            <div key={c._id} className={`ap-collection-card tone-${c.tone}`}>
              <div className="ap-collection-media">
                {c.imageUrl ? (
                  <img src={c.imageUrl} alt={c.name} />
                ) : (
                  <span className="ap-collection-art">{c.art || '✦'}</span>
                )}
                {!c.visible && <div className="ap-stock-over">СКРЫТА</div>}
              </div>
              <div className="ap-collection-body">
                {c.eyebrow && <div className="ap-collection-eyebrow">{c.eyebrow}</div>}
                <div className="ap-collection-title">{c.name}</div>
                {c.description && <div className="ap-collection-desc">{c.description}</div>}
                <div className="ap-muted-sm" style={{ marginTop: 6 }}>
                  Товаров: {c.productIds?.length || 0}
                </div>
              </div>
              <div className="ap-row-actions" style={{ padding: 12, borderTop: '1px solid var(--line)' }}>
                <button className="ap-btn ap-btn-xs ap-btn-ghost" onClick={() => setEditing(c)}>
                  Изменить
                </button>
                <button
                  className="ap-btn ap-btn-xs ap-btn-danger"
                  onClick={() => setConfirm({
                    title: 'Удалить подборку',
                    message: `Удалить подборку «${c.name}»?`,
                    onConfirm: () => onDelete(c),
                  })}
                >
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <CollectionEditor
          collection={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function CollectionEditor({ collection, onClose, onSaved }) {
  const isNew = !collection;
  const [name, setName] = useState(collection?.name || '');
  const [eyebrow, setEyebrow] = useState(collection?.eyebrow || '');
  const [description, setDescription] = useState(collection?.description || '');
  const [tone, setTone] = useState(collection?.tone || 'default');
  const [imageUrl, setImageUrl] = useState(collection?.imageUrl || '');
  const [art, setArt] = useState(collection?.art || '✦');
  const [visible, setVisible] = useState(collection?.visible !== false);
  const [sortOrder, setSortOrder] = useState(collection?.sortOrder ?? 100);
  const [productIds, setProductIds] = useState(
    (collection?.productIds || []).map((p) => p._id || p)
  );
  const [allProducts, setAllProducts] = useState([]);
  const [productFilter, setProductFilter] = useState('');
  const [gallery, setGallery] = useState([]);
  const [pickingImage, setPickingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetchAllProductsAdmin().then((res) => setAllProducts(res.data || [])).catch(() => {});
  }, []);

  const openGallery = async () => {
    try {
      const res = await listUploads();
      setGallery(res.data || []);
      setPickingImage(true);
    } catch (e) {
      setErr(e.message || 'Не удалось открыть галерею');
    }
  };

  const save = async () => {
    setErr('');
    if (!name.trim()) { setErr('Укажите название'); return; }
    const body = {
      name: name.trim(),
      eyebrow: eyebrow.trim(),
      description: description.trim(),
      tone,
      imageUrl,
      art,
      visible,
      sortOrder: Number(sortOrder) || 0,
      productIds,
    };
    try {
      setSaving(true);
      if (isNew) await createCollection(body);
      else await updateCollectionAdmin(collection._id, body);
      onSaved();
    } catch (e) {
      setErr(e.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const toggleProduct = (id) => {
    setProductIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const filteredProducts = allProducts.filter((p) =>
    !productFilter.trim() ||
    p.name.toLowerCase().includes(productFilter.toLowerCase()) ||
    (p.brand || '').toLowerCase().includes(productFilter.toLowerCase())
  );

  return (
    <Modal
      title={isNew ? 'Новая подборка' : 'Редактировать подборку'}
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

      <div className="ap-form-grid">
        <div>
          <label className="ap-label">Название</label>
          <input className="ap-input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="ap-label">Надпись сверху (eyebrow)</label>
          <input className="ap-input" placeholder="Например: Для неё" value={eyebrow} onChange={(e) => setEyebrow(e.target.value)} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="ap-label">Описание</label>
          <textarea
            className="ap-input ap-textarea"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <label className="ap-label">Тон оформления</label>
          <div className="ap-tone-picker">
            {TONES.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`ap-tone ${tone === t.key ? 'active' : ''}`}
                onClick={() => setTone(t.key)}
              >
                <span className="ap-tone-swatch" style={{ background: t.color }} />
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="ap-label">Иконка</label>
          <div className="ap-emoji-picker">
            {ART_PRESETS.map((e) => (
              <button
                key={e}
                type="button"
                className={`ap-emoji ${art === e ? 'active' : ''}`}
                onClick={() => setArt(e)}
              >
                {e}
              </button>
            ))}
            <input
              className="ap-input ap-emoji-input"
              value={art}
              onChange={(e) => setArt(e.target.value)}
              placeholder="свой"
            />
          </div>
        </div>
      </div>

      <ImageUpload value={imageUrl} onChange={setImageUrl} label="Изображение подборки (необязательно)" />

      <button
        type="button"
        className="ap-btn ap-btn-ghost"
        onClick={openGallery}
        style={{ marginTop: 8 }}
      >
        📁 Выбрать из ранее загруженных
      </button>

      <div className="ap-form-grid" style={{ marginTop: 14 }}>
        <div>
          <label className="ap-label">Порядок сортировки</label>
          <input
            className="ap-input"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </div>
        <div>
          <label className="ap-label" style={{ visibility: 'hidden' }}>x</label>
          <label className="ap-checkbox">
            <input
              type="checkbox"
              checked={visible}
              onChange={(e) => setVisible(e.target.checked)}
            />
            <span>Показывать на сайте</span>
          </label>
        </div>
      </div>

      <div className="ap-label" style={{ marginTop: 18 }}>
        Товары в подборке ({productIds.length})
      </div>
      <input
        type="text"
        className="ap-input"
        placeholder="Фильтр по названию или бренду…"
        value={productFilter}
        onChange={(e) => setProductFilter(e.target.value)}
      />
      <div className="ap-picklist">
        {filteredProducts.map((p) => {
          const checked = productIds.includes(p._id);
          return (
            <label
              key={p._id}
              className={`ap-pick ${checked ? 'picked' : ''}`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleProduct(p._id)}
              />
              <div className="ap-pick-body">
                <div className="ap-pick-name">{p.name}</div>
                <div className="ap-muted-sm">
                  {(p.brand || '—')} · {p.isAvailable ? 'в наличии' : 'нет в наличии'}
                </div>
              </div>
            </label>
          );
        })}
      </div>

      {pickingImage && (
        <Modal title="Выбор изображения" onClose={() => setPickingImage(false)} wide>
          {gallery.length === 0 ? (
            <div className="ap-empty">Пока нет загруженных картинок. Загрузите первое изображение через кнопку выше.</div>
          ) : (
            <div className="ap-gallery">
              {gallery.map((f) => (
                <button
                  key={f.filename}
                  type="button"
                  className={`ap-gallery-item ${imageUrl === f.url ? 'active' : ''}`}
                  onClick={() => { setImageUrl(f.url); setPickingImage(false); }}
                >
                  <img src={f.url} alt="" />
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}
    </Modal>
  );
}
