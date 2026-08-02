import React, { useState } from 'react';
import { promosApi } from '../../api/resources';
import { useRemoteList } from '../../lib/useRemoteList';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { DataState } from '../../ui/DataState';
import { Dialog } from '../../ui/Dialog';
import { Field } from '../../ui/Field';
import { useToast } from '../../ui/ToastProvider';

const blank = { code: '', description: '', discountType: 'percentage', discountValue: 10, minOrderAmount: 0, maxDiscount: 0, maxUses: 0, startsAt: '', expiresAt: '', firstOrderOnly: false, oncePerUser: true, isActive: true };

export function PromosPage({ api = promosApi }) {
  const toast = useToast();
  const { data: rows, loading, error, refresh } = useRemoteList(() => api.list(), [api]);
  const [editor, setEditor] = useState(null);
  const [validation, setValidation] = useState('');
  const save = async () => { if (!editor.code.trim()) return setValidation('Введите код'); if (editor.expiresAt && editor.startsAt && new Date(editor.expiresAt) <= new Date(editor.startsAt)) return setValidation('Дата окончания должна быть позже начала'); try { editor._id ? await api.update(editor._id, editor) : await api.create(editor); setEditor(null); setValidation(''); refresh(); toast?.success?.('Промокод сохранён'); } catch (err) { toast?.error?.(err.message); } };
  const toggle = async (promo) => { await api.toggle(promo._id); refresh(); };
  return <div className="fh-page"><header className="fh-page-head"><div><p className="fh-eyebrow">СТИМУЛ ДЛЯ ПОКУПКИ</p><h1>Промокоды</h1><p>Скидки, сроки и фактическое использование.</p></div><Button variant="primary" onClick={() => setEditor({ ...blank })}>Создать промокод</Button></header>{loading ? <div className="fh-page-skeleton"><span /></div> : error ? <DataState tone="error" title="Промокоды недоступны" message={error} /> : <div className="fh-promo-grid">{rows.map((promo) => <Card key={promo._id} className="fh-promo-card"><div><code>{promo.code}</code><Badge tone={promo.currentlyActive ? 'success' : 'neutral'}>{promo.currentlyActive ? 'Работает' : 'Остановлен'}</Badge></div><strong>{promo.discountType === 'percentage' ? `${promo.discountValue}%` : `${promo.discountValue} сум`}</strong><p>{promo.description || 'Без описания'}</p><small>{promo.maxUses ? `${promo.usedCount || 0} из ${promo.maxUses} использований` : `${promo.usedCount || 0} использований · без лимита`}</small><footer><Button size="sm" onClick={() => setEditor({ ...promo, startsAt: promo.startsAt?.slice?.(0, 10) || '', expiresAt: promo.expiresAt?.slice?.(0, 10) || '' })}>Изменить</Button><Button size="sm" variant="ghost" onClick={() => toggle(promo)}>{promo.isActive ? 'Остановить' : 'Включить'}</Button></footer></Card>)}</div>}<Dialog open={Boolean(editor)} title={editor?._id ? 'Изменить промокод' : 'Новый промокод'} onClose={() => setEditor(null)}>{editor && <div className="fh-form-stack"><div className="fh-form-grid"><Field label="Код"><input className="fh-input fh-mono" value={editor.code} onChange={(e) => setEditor({ ...editor, code: e.target.value.toUpperCase() })} /></Field><Field label="Скидка"><input className="fh-input" type="number" value={editor.discountValue} onChange={(e) => setEditor({ ...editor, discountValue: Number(e.target.value) })} /></Field><Field label="Начало"><input className="fh-input" type="date" value={editor.startsAt || ''} onChange={(e) => setEditor({ ...editor, startsAt: e.target.value })} /></Field><Field label="Окончание"><input className="fh-input" type="date" value={editor.expiresAt || ''} onChange={(e) => setEditor({ ...editor, expiresAt: e.target.value })} /></Field></div><Field label="Описание"><textarea className="fh-textarea" value={editor.description || ''} onChange={(e) => setEditor({ ...editor, description: e.target.value })} /></Field>{validation && <div className="fh-error-note">{validation}</div>}<div className="fh-dialog-actions"><Button onClick={() => setEditor(null)}>Отмена</Button><Button variant="primary" onClick={save}>Сохранить</Button></div></div>}</Dialog></div>;
}
