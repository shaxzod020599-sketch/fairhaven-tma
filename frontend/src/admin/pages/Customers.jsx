import React, { useEffect, useState, useCallback } from 'react';
import { listUsers, getUserDetail } from '../adminApi';
import Modal from '../components/Modal';

const FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'registered', label: 'Зарегистр.' },
  { key: 'unregistered', label: 'Не завершили' },
  { key: 'admins', label: 'Админы' },
];

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ru-RU', {
    timeZone: 'Asia/Tashkent',
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtPrice(n) {
  return (Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' UZS';
}

function genderLabel(g) {
  if (g === 'male') return 'муж';
  if (g === 'female') return 'жен';
  return '—';
}

function statusLabel(u) {
  if (u.role === 'admin') return { label: 'Админ', tone: 'ok' };
  if (u.registrationStep === 'done' && u.consentAccepted) {
    return { label: 'Зарегистр.', tone: 'ok' };
  }
  return { label: 'Не завершил', tone: 'pending' };
}

export default function Customers({ toast }) {
  const [filter, setFilter] = useState('registered');
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (filter === 'registered') params.registered = 'true';
      else if (filter === 'unregistered') params.registered = 'false';
      else if (filter === 'admins') params.role = 'admin';
      const res = await listUsers(params);
      setUsers(res.data || []);
    } catch (e) {
      toast?.err(e.message || 'Ошибка');
    } finally {
      setLoading(false);
    }
  }, [filter, search, toast]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="ap-page">
      <div className="ap-page-head">
        <div>
          <h1 className="ap-page-title">Клиенты</h1>
          <div className="ap-page-sub">Зарегистрированные пользователи бота</div>
        </div>
        <button className="ap-btn ap-btn-ghost" onClick={load}>Обновить</button>
      </div>

      <div className="ap-card" style={{ marginBottom: 14 }}>
        <div className="ap-row-wrap" style={{ alignItems: 'center', gap: 8 }}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`ap-btn ap-btn-xs ${filter === f.key ? 'ap-btn-primary' : 'ap-btn-ghost'}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
          <input
            className="ap-input"
            style={{ flex: 1, minWidth: 220 }}
            placeholder="Поиск: имя, фамилия, username, телефон, ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="ap-muted">Загрузка…</div>
      ) : users.length === 0 ? (
        <div className="ap-muted">Нет совпадений</div>
      ) : (
        <div className="ap-table-wrap">
          <table className="ap-table">
            <thead>
              <tr>
                <th>Клиент</th>
                <th>Telegram</th>
                <th>Телефон</th>
                <th>Пол</th>
                <th>Год</th>
                <th>Статус</th>
                <th>Регистрация</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const st = statusLabel(u);
                const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ');
                return (
                  <tr key={u.telegramId}>
                    <td data-label="Клиент">
                      <strong>{fullName || '—'}</strong>
                    </td>
                    <td data-label="Telegram">
                      <code>{u.telegramId}</code>
                      {u.username && <div className="ap-muted-sm">@{u.username}</div>}
                    </td>
                    <td data-label="Телефон">{u.phone || '—'}</td>
                    <td data-label="Пол">{genderLabel(u.gender)}</td>
                    <td data-label="Год">{u.birthYear || '—'}</td>
                    <td data-label="Статус">
                      <span className={`ap-pill tone-${st.tone}`}>{st.label}</span>
                    </td>
                    <td data-label="Регистрация" className="ap-muted-sm">
                      {fmtDate(u.createdAt)}
                    </td>
                    <td>
                      <button
                        className="ap-btn ap-btn-xs ap-btn-ghost"
                        onClick={() => setOpenId(u.telegramId)}
                      >
                        Открыть
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {openId && (
        <CustomerDetailModal
          telegramId={openId}
          onClose={() => setOpenId(null)}
          toast={toast}
        />
      )}
    </div>
  );
}

function CustomerDetailModal({ telegramId, onClose, toast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getUserDetail(telegramId);
        if (!cancelled) setData(res.data);
      } catch (e) {
        toast?.err(e.message || 'Ошибка');
        onClose?.();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [telegramId, onClose, toast]);

  const u = data?.user;
  const fullName = u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || '—' : '';
  const orders = data?.orders || [];
  const stats = data?.orderStats || { total: 0, amount: 0, delivered: 0, cancelled: 0 };

  return (
    <Modal title={fullName || 'Клиент'} onClose={onClose} wide>
      {loading ? (
        <div className="ap-muted">Загрузка…</div>
      ) : !u ? (
        <div className="ap-error">Не найден</div>
      ) : (
        <div>
          <div className="ap-grid ap-grid-2">
            <Field label="Telegram ID" value={<code>{u.telegramId}</code>} />
            <Field label="Username" value={u.username ? `@${u.username}` : '—'} />
            <Field label="Имя" value={u.firstName || '—'} />
            <Field label="Фамилия" value={u.lastName || '—'} />
            <Field label="Телефон" value={u.phone || '—'} />
            <Field label="Пол" value={genderLabel(u.gender)} />
            <Field label="Год рождения" value={u.birthYear || '—'} />
            <Field label="Язык" value={u.languageCode || '—'} />
            <Field label="Роль" value={u.role || 'user'} />
            <Field
              label="Регистрация"
              value={
                u.registrationStep === 'done' && u.consentAccepted
                  ? 'Завершена'
                  : `Шаг: ${u.registrationStep || '—'}`
              }
            />
            <Field label="Уведомления" value={u.notificationsEnabled === false ? 'Выкл' : 'Вкл'} />
            <Field label="Создан" value={fmtDate(u.createdAt)} />
          </div>

          <h4 className="ap-card-title" style={{ marginTop: 18 }}>
            Заказы ({stats.total})
          </h4>
          <div className="ap-row-wrap" style={{ gap: 8, marginBottom: 10 }}>
            <span className="ap-pill tone-neutral">Всего: {stats.total}</span>
            <span className="ap-pill tone-ok">Доставлено: {stats.delivered}</span>
            <span className="ap-pill tone-danger">Отменено: {stats.cancelled}</span>
            <span className="ap-pill tone-neutral">Сумма: {fmtPrice(stats.amount)}</span>
          </div>

          {orders.length === 0 ? (
            <div className="ap-muted">У клиента нет заказов</div>
          ) : (
            <div className="ap-table-wrap">
              <table className="ap-table">
                <thead>
                  <tr>
                    <th>Заказ</th>
                    <th>Статус</th>
                    <th>Товаров</th>
                    <th>Сумма</th>
                    <th>Создан</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const itemCount = (o.items || []).reduce(
                      (s, i) => s + (Number(i.quantity) || 0),
                      0
                    );
                    return (
                      <tr key={o._id}>
                        <td data-label="Заказ"><code>{o._id.slice(-6).toUpperCase()}</code></td>
                        <td data-label="Статус">{o.status}</td>
                        <td data-label="Товаров">{itemCount}</td>
                        <td data-label="Сумма">{fmtPrice(o.totalAmount)}</td>
                        <td data-label="Создан" className="ap-muted-sm">
                          {fmtDate(o.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div className="ap-label">{label}</div>
      <div>{value}</div>
    </div>
  );
}
