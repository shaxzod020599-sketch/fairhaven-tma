import React, { useRef, useState } from 'react';
import { uploadImage } from '../adminApi';

const OUT_SIZE = 800;
const PAPER_BG = '#FAF5EA';

/**
 * Beautifies a product image on-device before upload. The result is a square
 * 800×800 image on a warm paper background, with slight sharpening and a
 * gentle tone curve so every product looks like it belongs in the catalog.
 */
async function beautify(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = OUT_SIZE;
    canvas.height = OUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no_canvas');

    // Fill warm paper background
    ctx.fillStyle = PAPER_BG;
    ctx.fillRect(0, 0, OUT_SIZE, OUT_SIZE);

    // Fit the image within a padded square, keeping aspect ratio
    const pad = 40;
    const box = OUT_SIZE - pad * 2;
    const scale = Math.min(box / img.width, box / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    const dx = (OUT_SIZE - dw) / 2;
    const dy = (OUT_SIZE - dh) / 2;

    // Soft drop shadow underneath the product
    ctx.save();
    ctx.shadowColor = 'rgba(14, 43, 31, 0.12)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 12;
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();

    // Tone curve: gentle contrast + warmth
    const imageData = ctx.getImageData(0, 0, OUT_SIZE, OUT_SIZE);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i], g = data[i + 1], b = data[i + 2];

      // S-curve contrast — gentle
      r = curve(r);
      g = curve(g);
      b = curve(b);

      // Warmth: tiny lift on red/green vs blue
      r = clamp(r + 3);
      g = clamp(g + 1);
      b = clamp(b - 2);

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
    ctx.putImageData(imageData, 0, 0);

    return canvas.toDataURL('image/jpeg', 0.88);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function curve(v) {
  // Mild S-curve centred on 128
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

export default function ImageUpload({ value, onChange, label = 'Изображение' }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      setError('Нужен файл изображения');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const dataUrl = await beautify(file);
      const res = await uploadImage(dataUrl);
      onChange?.(res.data.url);
    } catch (err) {
      setError(err.message || 'Не удалось загрузить');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onUrl = (e) => {
    onChange?.(e.target.value);
  };

  return (
    <div className="ap-upload">
      <div className="ap-upload-label">{label}</div>
      <div className="ap-upload-row">
        <div className="ap-upload-preview">
          {value ? (
            <img src={value} alt="" onError={(e) => { e.target.style.opacity = 0.2; }} />
          ) : (
            <span className="ap-upload-ph">Нет изображения</span>
          )}
        </div>
        <div className="ap-upload-ctrls">
          <input
            type="text"
            className="ap-input"
            placeholder="URL изображения или загрузите файл →"
            value={value || ''}
            onChange={onUrl}
          />
          <button
            type="button"
            className="ap-btn ap-btn-ghost"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {busy ? 'Обработка…' : '📷 Загрузить и обработать'}
          </button>
          {value && (
            <button
              type="button"
              className="ap-btn ap-btn-ghost ap-btn-danger"
              onClick={() => onChange?.('')}
            >
              Убрать
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={onPick}
          />
          {error && <div className="ap-upload-error">{error}</div>}
          <div className="ap-upload-hint">
            Картинка будет автоматически обрезана, выровнена под кремовый фон и сохранена в 800×800.
          </div>
        </div>
      </div>
    </div>
  );
}
