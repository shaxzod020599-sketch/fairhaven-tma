import React, { useRef, useState } from 'react';
import { uploadImage } from '../adminApi';

const OUT_SIZE = 800;
const PAPER_BG = '#FAF5EA';

async function beautify(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = OUT_SIZE;
    canvas.height = OUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no_canvas');

    ctx.fillStyle = PAPER_BG;
    ctx.fillRect(0, 0, OUT_SIZE, OUT_SIZE);

    const pad = 40;
    const box = OUT_SIZE - pad * 2;
    const scale = Math.min(box / img.width, box / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    const dx = (OUT_SIZE - dw) / 2;
    const dy = (OUT_SIZE - dh) / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(14, 43, 31, 0.12)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 12;
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();

    const imageData = ctx.getImageData(0, 0, OUT_SIZE, OUT_SIZE);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i], g = data[i + 1], b = data[i + 2];
      r = curve(r); g = curve(g); b = curve(b);
      r = clamp(r + 3); g = clamp(g + 1); b = clamp(b - 2);
      data[i] = r; data[i + 1] = g; data[i + 2] = b;
    }
    ctx.putImageData(imageData, 0, 0);

    return canvas.toDataURL('image/jpeg', 0.88);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function curve(v) {
  const x = v / 255;
  const y = x < 0.5
    ? 0.5 * Math.pow(2 * x, 1.08)
    : 1 - 0.5 * Math.pow(2 * (1 - x), 1.08);
  return Math.round(y * 255);
}
function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export default function MultiImageUpload({
  primary,
  extras = [],
  onChangePrimary,
  onChangeExtras,
  maxExtras = 5,
}) {
  const fileRef = useRef(null);
  const extraFileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const onPickPrimary = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { setError('Нужен файл изображения'); return; }
    setError(''); setBusy(true);
    try {
      const dataUrl = await beautify(file);
      const res = await uploadImage(dataUrl);
      onChangePrimary?.(res.data.url);
    } catch (err) {
      setError(err.message || 'Не удалось загрузить');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onPickExtra = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setError(''); setBusy(true);
    try {
      const remaining = maxExtras - extras.length;
      const batch = files.slice(0, remaining);
      const urls = [];
      for (const file of batch) {
        if (!/^image\//.test(file.type)) continue;
        const dataUrl = await beautify(file);
        const res = await uploadImage(dataUrl);
        urls.push(res.data.url);
      }
      onChangeExtras?.([...extras, ...urls]);
    } catch (err) {
      setError(err.message || 'Не удалось загрузить');
    } finally {
      setBusy(false);
      if (extraFileRef.current) extraFileRef.current.value = '';
    }
  };

  const removeExtra = (idx) => {
    const next = extras.filter((_, i) => i !== idx);
    onChangeExtras?.(next);
  };

  const promoteExtra = (idx) => {
    const wasPrimary = primary;
    const next = [...extras];
    const promoted = next.splice(idx, 1)[0];
    onChangePrimary?.(promoted);
    if (wasPrimary) next.unshift(wasPrimary);
    onChangeExtras?.(next);
  };

  return (
    <div className="ap-upload">
      <div className="ap-upload-label">Изображения товара</div>

      <div className="ap-multi-upload">
        <div className="ap-multi-primary">
          <div className="ap-multi-slot ap-multi-slot-primary">
            {primary ? (
              <>
                <img src={primary} alt="" />
                <span className="ap-multi-tag">Главное</span>
                <button
                  type="button"
                  className="ap-multi-remove"
                  onClick={() => onChangePrimary?.('')}
                  aria-label="Убрать"
                >×</button>
              </>
            ) : (
              <button
                type="button"
                className="ap-multi-add primary"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
              >
                <span style={{ fontSize: 28, marginBottom: 4 }}>+</span>
                <span>Главное фото</span>
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPickPrimary} />
          {primary && (
            <input
              type="text"
              className="ap-input"
              placeholder="URL главного фото"
              value={primary}
              onChange={(e) => onChangePrimary?.(e.target.value)}
              style={{ marginTop: 8 }}
            />
          )}
        </div>

        <div className="ap-multi-extras">
          <div className="ap-multi-extras-label">
            Дополнительные ({extras.length}/{maxExtras})
          </div>
          <div className="ap-multi-extras-grid">
            {extras.map((url, idx) => (
              <div key={`${idx}-${url}`} className="ap-multi-slot">
                <img src={url} alt="" />
                <button
                  type="button"
                  className="ap-multi-remove"
                  onClick={() => removeExtra(idx)}
                  aria-label="Убрать"
                >×</button>
                <button
                  type="button"
                  className="ap-multi-promote"
                  onClick={() => promoteExtra(idx)}
                  title="Сделать главным"
                >★</button>
              </div>
            ))}
            {extras.length < maxExtras && (
              <button
                type="button"
                className="ap-multi-add"
                onClick={() => extraFileRef.current?.click()}
                disabled={busy}
              >
                <span style={{ fontSize: 24 }}>+</span>
                <span style={{ fontSize: 11 }}>Добавить</span>
              </button>
            )}
          </div>
          <input
            ref={extraFileRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={onPickExtra}
          />
        </div>
      </div>

      {busy && <div className="ap-upload-hint">Обработка изображений…</div>}
      {error && <div className="ap-upload-error">{error}</div>}
      <div className="ap-upload-hint">
        Все фото будут обрезаны под кремовый фон 800×800. Главное фото — на карточке и в шапке деталей.
      </div>
    </div>
  );
}
