import React, { useEffect, useState } from 'react';
import { customersApi } from '../../api/resources';
import { formatDateTime, formatMoney } from '../../lib/format';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { DataState } from '../../ui/DataState';
import { Dialog } from '../../ui/Dialog';
import { Field } from '../../ui/Field';
import { Pagination } from '../../ui/Pagination';
import { useToast } from '../../ui/ToastProvider';

const LIMIT = 30;

function CustomerDetail({ detail, api, toast, onClose, onUserChanged }) {
  const user = detail.user;
  const [form, setForm] = useState({ firstName: user.firstName || '', lastName: user.lastName || '', phone: user.phone || '' });
  const [editing, setEditing] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const response = await api.update(user.telegramId, form);
      onUserChanged(response.data);
      setEditing(false);
      toast?.success?.('Данные клиента сохранены');
    } catch (err) {
      toast?.error?.(err.message || 'Не сохранилось');
    } finally { setBusy(false); }
  };

  const setBlocked = async (blocked) => {
    setBusy(true);
    try {
      const response = await api.setBlocked(user.telegramId, blocked);
      onUserChanged(response.data);
      setBlocking(false);
      toast?.success?.(blocked ? 'Клиент заблокирован' : 'Клиент разблокирован');
    } catch (err) {
      toast?.error?.(err.message || 'Не получилось');
    } finally { setBusy(false); }
  };

  return (
    <div className="fh-customer-detail">
      <div className="fh-customer-detail__flags">
        {user.customerBlocked && <Badge tone="danger">Заблокирован — рассылки не приходят</Badge>}
        {user.botBlocked && <Badge tone="warning">Бот заблокирован клиентом</Badge>}
      </div>

      {editing ? (
        <div className="fh-form-grid">
          <Field label="Имя"><input className="fh-input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
          <Field label="Фамилия"><input className="fh-input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
          <Field label="Телефон"><input className="fh-input fh-mono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <div className="fh-dialog-actions">
            <Button onClick={() => setEditing(false)}>Отмена</Button>
            <Button variant="primary" disabled={busy} onClick={save}>Сохранить</Button>
          </div>
        </div>
      ) : (
        <section className="fh-metric-ledger">
          <div className="fh-metric-ledger__item"><span>Заказов</span><strong>{detail.orderStats?.total || 0}</strong></div>
          <div className="fh-metric-ledger__item"><span>Сумма покупок</span><strong>{formatMoney(detail.orderStats?.amount)}</strong></div>
          <div className="fh-metric-ledger__item"><span>Доставлено</span><strong>{detail.orderStats?.delivered || 0}</strong></div>
          <div className="fh-metric-ledger__item"><span>Отменено</span><strong>{detail.orderStats?.cancelled || 0}</strong></div>
        </section>
      )}

      <div className="fh-simple-list">
        {(detail.orders || []).map((order) => (
          <div key={order._id}>
            <span><b>#{String(order._id).slice(-6).toUpperCase()}</b><small>{formatDateTime(order.createdAt)}</small></span>
            <strong>{formatMoney(order.totalAmount)}</strong>
          </div>
        ))}
      </div>

      <div className="fh-dialog-actions fh-dialog-actions--split">
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => (user.customerBlocked ? setBlocked(false) : setBlocking(true))}
        >{user.customerBlocked ? 'Разблокировать' : 'Заблокировать клиента'}</Button>
        {!editing && <Button onClick={() => setEditing(true)}>Изменить данные</Button>}
      </div>

      <Dialog open={blocking} title="Заблокировать клиента?" description="Клиент перестанет получать рассылки, а его заказы будут помечены. Заказы при этом не удаляются." onClose={() => setBlocking(false)} width="480px">
        <div className="fh-dialog-actions">
          <Button onClick={() => setBlocking(false)}>Отмена</Button>
          <Button variant="danger" disabled={busy} onClick={() => setBlocked(true)}>Заблокировать</Button>
        </div>
      </Dialog>
    </div>
  );
}

export function CustomersPage({ api = customersApi }) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState(null);

  useEffect(() => { const timer = window.setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => {
    let live = true;
    setLoading(true);
    api.list({ search: query, role: 'user', page, limit: LIMIT })
      .then((response) => { if (!live) return; setRows(response.data || []); setTotal(response.meta?.total || response.data?.length || 0); setError(''); })
      .catch((err) => live && setError(err.message))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [api, page, query]);

  const open = async (user) => {
    setDetail({ user, loading: true });
    try {
      const response = await api.detail(user.telegramId);
      setDetail({ ...response.data, loading: false });
    } catch (error) {
      setDetail({ user, error: error.message, loading: false });
    }
  };

  const userChanged = (updated) => {
    setDetail((current) => current && ({ ...current, user: { ...current.user, ...updated } }));
    setRows((current) => current.map((row) => (row.telegramId === updated.telegramId ? { ...row, ...updated } : row)));
  };

  return (
    <div className="fh-page">
      <header className="fh-page-head"><div><p className="fh-eyebrow">КЛИЕНТСКАЯ БАЗА</p><h1>Клиенты</h1><p>Контакты, регистрация и история заказов.</p></div></header>
      <div className="fh-toolbar"><input className="fh-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Имя, телефон или Telegram ID" aria-label="Поиск клиентов" /></div>
      {loading && rows.length === 0 ? <div className="fh-page-skeleton"><span /><span /></div> : error && rows.length === 0 ? <DataState tone="error" title="Клиенты недоступны" message={error} /> : (
        <div className="fh-person-grid">
          {rows.map((user) => (
            <Card key={user.telegramId} className="fh-person-card">
              <button type="button" onClick={() => open(user)}>
                <span className="fh-person-card__avatar">{(user.firstName || 'К').slice(0, 1)}</span>
                <span>
                  <b>{[user.firstName, user.lastName].filter(Boolean).join(' ') || 'Без имени'}</b>
                  <small>{user.phone || 'Телефон не указан'}</small>
                  <small className="fh-mono">ID {user.telegramId}</small>
                </span>
                {user.customerBlocked
                  ? <Badge tone="danger">Заблокирован</Badge>
                  : <Badge tone={user.registrationStep === 'done' ? 'success' : 'warning'}>{user.registrationStep === 'done' ? 'Зарегистрирован' : 'Не завершил'}</Badge>}
              </button>
            </Card>
          ))}
        </div>
      )}
      <Pagination page={page} total={total} limit={LIMIT} onPage={setPage} />
      <Dialog open={Boolean(detail)} title={detail?.user ? [detail.user.firstName, detail.user.lastName].filter(Boolean).join(' ') || 'Клиент' : 'Клиент'} description={detail?.user?.phone} onClose={() => setDetail(null)} width="760px">
        {detail?.loading ? <p>Загружаем профиль…</p> : detail?.error ? <div className="fh-error-note">{detail.error}</div> : detail && (
          <CustomerDetail detail={detail} api={api} toast={toast} onClose={() => setDetail(null)} onUserChanged={userChanged} />
        )}
      </Dialog>
    </div>
  );
}
