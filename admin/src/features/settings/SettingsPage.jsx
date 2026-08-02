import React, { useEffect, useState } from 'react';
import { settingsApi } from '../../api/resources';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { DataState } from '../../ui/DataState';
import { useToast } from '../../ui/ToastProvider';

function groupFor(key) {
  if (/delivery|order|payment/i.test(key)) return 'Доставка и заказы';
  if (/phone|contact|social|support/i.test(key)) return 'Контакты';
  if (/hero|site|banner|title/i.test(key)) return 'Сайт';
  return 'Остальное';
}

export function SettingsPage({ api = settingsApi }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { api.list().then((response) => { setRows(response.data || []); setError(''); }).catch((err) => setError(err.message)).finally(() => setLoading(false)); }, [api]);
  const change = (key, value) => setRows((current) => current.map((row) => row.key === key ? { ...row, value } : row));
  const saveAll = async () => { try { await Promise.all(rows.map((row) => api.save({ key: row.key, value: row.value, label: row.label }))); toast?.success?.('Настройки сохранены'); } catch (err) { toast?.error?.(err.message); } };
  const groups = Object.groupBy ? Object.groupBy(rows, (row) => groupFor(row.key)) : rows.reduce((acc, row) => ({ ...acc, [groupFor(row.key)]: [...(acc[groupFor(row.key)] || []), row] }), {});
  return <div className="fh-page"><header className="fh-page-head"><div><p className="fh-eyebrow">ПРАВИЛА FAIRHAVEN.UZ</p><h1>Настройки</h1><p>Тексты, контакты и параметры fairhaven.uz.</p></div><Button variant="primary" onClick={saveAll} disabled={!rows.length}>Сохранить всё</Button></header>{loading ? <div className="fh-page-skeleton"><span /></div> : error ? <DataState tone="error" title="Настройки недоступны" message={error} /> : <div className="fh-settings-groups">{Object.entries(groups).map(([group, items]) => <Card key={group} className="fh-settings-card"><h2>{group}</h2>{items.map((setting) => <label key={setting.key}><span><b>{setting.label || setting.key}</b><small className="fh-mono">{setting.key}</small></span>{typeof setting.value === 'boolean' ? <input type="checkbox" checked={setting.value} onChange={(e) => change(setting.key, e.target.checked)} /> : <input className="fh-input" value={typeof setting.value === 'object' ? JSON.stringify(setting.value) : setting.value ?? ''} onChange={(e) => change(setting.key, e.target.value)} />}</label>)}</Card>)}</div>}</div>;
}
