import React, { useEffect, useState } from 'react';
import { stats } from '../adminApi';

function formatUZS(n) {
  return (Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' UZS';
}

export default function Dashboard({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const res = await stats();
      setData(res.data);
      setErr('');
    } catch (e) {
      setErr(e.message || 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, []);

  if (loading && !data) return <div className="ap-muted">Загрузка…</div>;
  if (err) return <div className="ap-error">{err}</div>;
  if (!data) return null;

  const cards = [
    { label: 'В обработке', value: data.orders.pending, tone: 'pending', to: { page: 'orders', bucket: 'active' } },
    { label: 'Принятые', value: data.orders.confirmed, tone: 'ok', to: { page: 'orders', bucket: 'confirmed' } },
    { label: 'Отклонённые', value: data.orders.cancelled, tone: 'danger', to: { page: 'orders', bucket: 'cancelled' } },
    { label: 'Всего заказов', value: data.orders.total, tone: 'neutral', to: { page: 'orders', bucket: 'all' } },
  ];

  const second = [
    { label: 'Товары', value: `${data.products.available}/${data.products.total}`, sub: 'в наличии', to: { page: 'products' } },
    { label: 'Администраторы', value: data.users.admins, sub: '', to: { page: 'admins' } },
    { label: 'Клиенты', value: data.users.customers, sub: 'зарегистр.', to: null },
    { label: 'Выручка', value: formatUZS(data.revenue), sub: 'принятые заказы', to: null },
  ];

  return (
    <div className="ap-page">
      <div className="ap-page-head">
        <div>
          <h1 className="ap-page-title">Панель управления</h1>
          <div className="ap-page-sub">FairHaven Health — оперативный обзор</div>
        </div>
        <button className="ap-btn ap-btn-ghost" onClick={load}>Обновить</button>
      </div>

      <div className="ap-grid ap-grid-4">
        {cards.map((c, i) => (
          <button
            key={i}
            className={`ap-stat-card tone-${c.tone}`}
            onClick={() => c.to && onNavigate(c.to.page, c.to)}
            disabled={!c.to}
          >
            <div className="ap-stat-label">{c.label}</div>
            <div className="ap-stat-value">{c.value}</div>
          </button>
        ))}
      </div>

      <div className="ap-grid ap-grid-4" style={{ marginTop: 14 }}>
        {second.map((c, i) => (
          <button
            key={i}
            className="ap-stat-card tone-neutral"
            onClick={() => c.to && onNavigate(c.to.page)}
            disabled={!c.to}
          >
            <div className="ap-stat-label">{c.label}</div>
            <div className="ap-stat-value">{c.value}</div>
            {c.sub && <div className="ap-stat-sub">{c.sub}</div>}
          </button>
        ))}
      </div>

      <div className="ap-card" style={{ marginTop: 22 }}>
        <h3 className="ap-card-title">Быстрые действия</h3>
        <div className="ap-row-wrap">
          <button className="ap-btn ap-btn-primary" onClick={() => onNavigate('orders', { bucket: 'active' })}>
            📦 Текущие заказы ({data.orders.pending})
          </button>
          <button className="ap-btn ap-btn-ghost" onClick={() => onNavigate('products')}>
            🌿 Каталог
          </button>
          <button className="ap-btn ap-btn-ghost" onClick={() => onNavigate('collections')}>
            ✦ Подборки
          </button>
          <button className="ap-btn ap-btn-ghost" onClick={() => onNavigate('admins')}>
            👑 Администраторы
          </button>
          <button className="ap-btn ap-btn-ghost" onClick={() => onNavigate('settings')}>
            ⚙ Настройки
          </button>
        </div>
      </div>
    </div>
  );
}
