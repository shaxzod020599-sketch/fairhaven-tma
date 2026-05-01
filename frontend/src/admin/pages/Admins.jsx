import React, { useEffect, useState } from 'react';
import { listAdmins, promoteAdmin, demoteAdmin } from '../adminApi';
import Modal, { ConfirmDialog } from '../components/Modal';

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('ru-RU');
}

export default function Admins({ me, toast }) {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await listAdmins();
      setAdmins(res.data || []);
    } catch (e) {
      toast?.err(e.message || 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onPromote = async ({ telegramId, firstName, lastName }) => {
    try {
      await promoteAdmin({ telegramId: Number(telegramId), firstName, lastName });
      await load();
      setAdding(false);
      toast?.ok('Назначен администратором');
    } catch (e) {
      toast?.err(e.message || 'Ошибка');
    }
  };

  const onDemote = async (a) => {
    try {
      await demoteAdmin(a.telegramId);
      setAdmins((prev) => prev.filter((x) => x.telegramId !== a.telegramId));
      toast?.ok('Права администратора сняты');
    } catch (e) {
      toast?.err(e.message || 'Ошибка');
    }
  };

  return (
    <div className="ap-page">
      <div className="ap-page-head">
        <div>
          <h1 className="ap-page-title">Администраторы</h1>
          <div className="ap-page-sub">Назначение и снятие прав</div>
        </div>
        <button className="ap-btn ap-btn-primary" onClick={() => setAdding(true)}>
          + Назначить администратора
        </button>
      </div>

      {loading ? (
        <div className="ap-muted">Загрузка…</div>
      ) : (
        <div className="ap-table-wrap">
          <table className="ap-table">
            <thead>
              <tr>
                <th>Telegram ID</th>
                <th>Имя</th>
                <th>Username</th>
                <th>Телефон</th>
                <th>Добавлен</th>
                <th style={{ width: 140 }}></th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => {
                const isSelf = me?.telegramId === a.telegramId;
                return (
                  <tr key={a.telegramId}>
                    <td data-label="Telegram ID"><code>{a.telegramId}</code>{isSelf && <span className="ap-badge-self">вы</span>}</td>
                    <td data-label="Имя">{[a.firstName, a.lastName].filter(Boolean).join(' ') || '—'}</td>
                    <td data-label="Username">{a.username ? `@${a.username}` : '—'}</td>
                    <td data-label="Телефон">{a.phone || '—'}</td>
                    <td data-label="Добавлен" className="ap-muted-sm">{fmtDate(a.createdAt)}</td>
                    <td>
                      <button
                        className="ap-btn ap-btn-xs ap-btn-danger"
                        disabled={isSelf}
                        onClick={() => setConfirm({
                          title: 'Снять администратора',
                          message: `Снять права у ${a.firstName || a.telegramId}? Пользователь останется в системе как клиент.`,
                          confirmLabel: 'Снять',
                          onConfirm: () => onDemote(a),
                        })}
                      >
                        Снять
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {adding && <AddAdminModal onClose={() => setAdding(false)} onAdd={onPromote} />}
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function AddAdminModal({ onClose, onAdd }) {
  const [tgId, setTgId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [err, setErr] = useState('');

  const submit = () => {
    if (!tgId.trim() || !/^\d+$/.test(tgId.trim())) {
      setErr('Введите числовой Telegram ID');
      return;
    }
    onAdd({ telegramId: tgId.trim(), firstName: firstName.trim(), lastName: lastName.trim() });
  };

  return (
    <Modal
      title="Назначить администратора"
      onClose={onClose}
      footer={
        <>
          <button className="ap-btn ap-btn-ghost" onClick={onClose}>Отмена</button>
          <button className="ap-btn ap-btn-primary" onClick={submit}>Назначить</button>
        </>
      }
    >
      {err && <div className="ap-error">{err}</div>}
      <div>
        <label className="ap-label">Telegram ID</label>
        <input
          className="ap-input"
          placeholder="например, 123456789"
          value={tgId}
          onChange={(e) => setTgId(e.target.value)}
        />
        <div className="ap-muted-sm" style={{ marginTop: 4 }}>
          Пользователь увидит @userinfobot свой ID, или откройте бота Fairhaven и посмотрите ID заказа.
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <label className="ap-label">Имя (необязательно)</label>
        <input
          className="ap-input"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
      </div>
      <div style={{ marginTop: 10 }}>
        <label className="ap-label">Фамилия (необязательно)</label>
        <input
          className="ap-input"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
      </div>
    </Modal>
  );
}
