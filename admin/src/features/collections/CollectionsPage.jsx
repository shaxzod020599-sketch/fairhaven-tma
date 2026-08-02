import React, { useState } from 'react';
import { collectionsApi } from '../../api/resources';
import { useRemoteList } from '../../lib/useRemoteList';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { DataState } from '../../ui/DataState';
import { Dialog } from '../../ui/Dialog';
import { Field } from '../../ui/Field';
import { useToast } from '../../ui/ToastProvider';

const blank = { name: '', eyebrow: '', description: '', visible: true, sortOrder: 0, productIds: [] };
const countLabel = (count) => count === 1 ? '1 товар' : `${count} товаров`;

export function CollectionsPage({ api = collectionsApi }) {
  const toast = useToast();
  const { data: rows, loading, error, refresh } = useRemoteList(() => api.list(), [api]);
  const [editor, setEditor] = useState(null);
  const save = async () => { if (!editor.name.trim()) return; const body = { ...editor, productIds: (editor.productIds || []).map((item) => item._id || item) }; try { editor._id ? await api.update(editor._id, body) : await api.create(body); setEditor(null); refresh(); toast?.success?.('Подборка сохранена'); } catch (err) { toast?.error?.(err.message); } };
  return <div className="fh-page"><header className="fh-page-head"><div><p className="fh-eyebrow">ВИТРИНА FAIRHAVEN.UZ</p><h1>Подборки</h1><p>Тематические группы товаров в нужном порядке.</p></div><Button variant="primary" onClick={() => setEditor({ ...blank })}>Новая подборка</Button></header>{loading ? <div className="fh-page-skeleton"><span /></div> : error ? <DataState tone="error" title="Подборки недоступны" message={error} /> : <div className="fh-collection-grid">{rows.map((collection) => <Card key={collection._id} className="fh-collection-card"><div className="fh-collection-card__art">{collection.imageUrl ? <img src={collection.imageUrl} alt="" /> : <span>FH</span>}</div><div><Badge tone={collection.visible ? 'success' : 'neutral'}>{collection.visible ? 'На fairhaven.uz' : 'Скрыта'}</Badge><h2>{collection.name}</h2><p>{collection.description || 'Без описания'}</p><small>{countLabel(collection.productIds?.length || 0)}</small><Button size="sm" onClick={() => setEditor({ ...collection })}>Изменить</Button></div></Card>)}</div>}<Dialog open={Boolean(editor)} title={editor?._id ? 'Изменить подборку' : 'Новая подборка'} onClose={() => setEditor(null)}>{editor && <div className="fh-form-stack"><Field label="Название"><input className="fh-input" value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} /></Field><Field label="Короткая подпись"><input className="fh-input" value={editor.eyebrow || ''} onChange={(e) => setEditor({ ...editor, eyebrow: e.target.value })} /></Field><Field label="Описание"><textarea className="fh-textarea" value={editor.description || ''} onChange={(e) => setEditor({ ...editor, description: e.target.value })} /></Field><label className="fh-check"><input type="checkbox" checked={editor.visible !== false} onChange={(e) => setEditor({ ...editor, visible: e.target.checked })} /><span><b>Показывать на fairhaven.uz</b><small>Скрытая подборка сохраняется, но клиенты её не видят.</small></span></label><div className="fh-selected-products"><b>{countLabel(editor.productIds?.length || 0)}</b>{(editor.productIds || []).map((product) => <span key={product._id || product}>{product.name || product}</span>)}</div><div className="fh-dialog-actions"><Button onClick={() => setEditor(null)}>Отмена</Button><Button variant="primary" onClick={save}>Сохранить</Button></div></div>}</Dialog></div>;
}
