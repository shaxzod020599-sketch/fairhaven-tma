import React, { useState } from 'react';
import { adminsApi } from '../../api/resources';
import { useRemoteList } from '../../lib/useRemoteList';
import { formatDateTime } from '../../lib/format';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { DataState } from '../../ui/DataState';
import { Dialog } from '../../ui/Dialog';
import { useToast } from '../../ui/ToastProvider';

export function AdminsPage({ api = adminsApi }) {
  const toast = useToast();
  const { data: rows, loading, error, refresh } = useRemoteList(() => api.list(), [api]);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState([]);
  const search = async () => { const response = await api.search(query); setCandidates(response.data || []); };
  const promote = async (user) => { try { await api.promote(user); setAdding(false); setCandidates([]); setQuery(''); toast?.success?.('Администратор добавлен'); refresh(); } catch (err) { toast?.error?.(err.message); } };
  const demote = async (user) => { if (!window.confirm(`Снять права администратора у ${user.firstName || user.telegramId}?`)) return; try { await api.demote(user.telegramId); refresh(); } catch (err) { toast?.error?.(err.message); } };
  return <div className="fh-page"><header className="fh-page-head"><div><p className="fh-eyebrow">ДОСТУП К УПРАВЛЕНИЮ</p><h1>Администраторы</h1><p>Только эти люди могут открыть панель.</p></div><Button variant="primary" onClick={() => setAdding(true)}>Добавить администратора</Button></header>{loading ? <div className="fh-page-skeleton"><span /></div> : error ? <DataState tone="error" title="Список недоступен" message={error} /> : <div className="fh-person-grid">{rows.map((user) => <Card key={user.telegramId} className="fh-person-card fh-admin-card"><div><span className="fh-person-card__avatar">{(user.firstName || 'A').slice(0, 1)}</span><span><b>{[user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'Администратор'}</b><small>@{user.username || 'нет username'} · ID {user.telegramId}</small><small>с {formatDateTime(user.createdAt)}</small></span><Button size="sm" variant="ghost" onClick={() => demote(user)}>Снять доступ</Button></div></Card>)}</div>}<Dialog open={adding} title="Добавить администратора" description="Найдите зарегистрированного клиента. Telegram ID вручную вводить не нужно." onClose={() => setAdding(false)}><div className="fh-search-row"><input className="fh-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Имя или телефон" /><Button onClick={search} disabled={query.trim().length < 2}>Найти</Button></div><div className="fh-simple-list">{candidates.map((user) => <button key={user.telegramId} type="button" onClick={() => promote(user)}><span><b>{[user.firstName, user.lastName].filter(Boolean).join(' ')}</b><small>{user.phone}</small></span><strong>Добавить</strong></button>)}</div></Dialog></div>;
}
