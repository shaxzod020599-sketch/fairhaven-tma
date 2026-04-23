import React, { useEffect, useState } from 'react';
import { listUploads, deleteUpload, uploadImage } from '../adminApi';
import { ConfirmDialog } from '../components/Modal';

function fmtSize(b) {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export default function Gallery({ toast }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await listUploads();
      setFiles(res.data || []);
    } catch (e) {
      toast?.err(e.message || 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const url = URL.createObjectURL(file);
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = 800; canvas.height = 800;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FAF5EA';
      ctx.fillRect(0, 0, 800, 800);
      const scale = Math.min(720 / img.width, 720 / img.height);
      const dw = img.width * scale, dh = img.height * scale;
      ctx.drawImage(img, (800 - dw) / 2, (800 - dh) / 2, dw, dh);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      await uploadImage(dataUrl);
      toast?.ok('Загружено');
      load();
    } catch (err) {
      toast?.err(err.message || 'Ошибка загрузки');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  const onDelete = async (f) => {
    try {
      await deleteUpload(f.filename);
      setFiles((prev) => prev.filter((x) => x.filename !== f.filename));
      toast?.ok('Удалено');
    } catch (e) {
      toast?.err(e.message || 'Ошибка');
    }
  };

  return (
    <div className="ap-page">
      <div className="ap-page-head">
        <div>
          <h1 className="ap-page-title">Галерея</h1>
          <div className="ap-page-sub">Загруженные изображения — используйте их в товарах и подборках</div>
        </div>
        <label className="ap-btn ap-btn-primary">
          {busy ? 'Загрузка…' : '+ Загрузить'}
          <input type="file" accept="image/*" onChange={onPick} style={{ display: 'none' }} />
        </label>
      </div>

      {loading ? (
        <div className="ap-muted">Загрузка…</div>
      ) : files.length === 0 ? (
        <div className="ap-empty">Пока нет загруженных изображений</div>
      ) : (
        <div className="ap-gallery">
          {files.map((f) => (
            <div key={f.filename} className="ap-gallery-item">
              <img src={f.url} alt="" />
              <div className="ap-gallery-meta">
                <span>{fmtSize(f.size)}</span>
                <button
                  className="ap-btn ap-btn-xs ap-btn-danger"
                  onClick={() => setConfirm({
                    title: 'Удалить изображение',
                    message: 'Удалить это изображение из галереи?',
                    onConfirm: () => onDelete(f),
                  })}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
