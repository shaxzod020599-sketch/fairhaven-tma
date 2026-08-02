import React, { useEffect, useState } from 'react';
import { galleryApi } from '../../api/resources';
import { formatDateTime, formatNumber } from '../../lib/format';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { DataState } from '../../ui/DataState';
import { useToast } from '../../ui/ToastProvider';

const readAsDataUrl = (file) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });

export function GalleryPage({ api = galleryApi }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => { try { const response = await api.list(); setRows(response.data || []); setError(''); } catch (err) { setError(err.message); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const upload = async (event) => { const files = [...event.target.files]; for (const file of files) { try { const dataUrl = await readAsDataUrl(file); await api.upload(dataUrl); } catch (err) { toast?.error?.(`${file.name}: ${err.message}`); } } await load(); event.target.value = ''; };
  const remove = async (file) => { if (!window.confirm(`Удалить ${file.filename}?`)) return; await api.remove(file.filename); setRows((current) => current.filter((row) => row.filename !== file.filename)); };
  const copy = async (url) => { await navigator.clipboard?.writeText(new URL(url, window.location.origin).href); toast?.success?.('Ссылка скопирована'); };
  return <div className="fh-page"><header className="fh-page-head"><div><p className="fh-eyebrow">МЕДИАБИБЛИОТЕКА</p><h1>Галерея</h1><p>Оригинальные пропорции сохраняются. Квадратный фон не добавляется.</p></div><label className="fh-button fh-button--primary fh-button--md">Загрузить изображения<input hidden multiple accept="image/jpeg,image/png,image/webp,image/gif" type="file" aria-label="Загрузить изображения" onChange={upload} /></label></header>{loading ? <div className="fh-page-skeleton"><span /></div> : error ? <DataState tone="error" title="Галерея недоступна" message={error} /> : rows.length === 0 ? <DataState title="Галерея пока пустая" message="Загрузите изображения в исходных пропорциях." /> : <div className="fh-gallery-grid">{rows.map((file) => <Card key={file.filename} className="fh-gallery-card"><div className="fh-gallery-card__image"><img src={file.url} alt={file.filename} /></div><div><b>{file.filename}</b><small>{formatNumber(Math.ceil(file.size / 1024))} КБ · {formatDateTime(file.createdAt)}</small><footer><Button size="sm" onClick={() => copy(file.url)}>Копировать ссылку</Button><Button size="sm" variant="ghost" onClick={() => remove(file)}>Удалить</Button></footer></div></Card>)}</div>}</div>;
}
