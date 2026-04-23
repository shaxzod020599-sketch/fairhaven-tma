import React, { useEffect, useState, useCallback } from 'react';
import { listOrders, updateOrderStatus, revertOrder } from '../adminApi';
import Modal, { ConfirmDialog } from '../components/Modal';

const BUCKETS = [
  { key: 'active', label: 'Активные', short: 'Активные' },
  { key: 'history', label: 'История', short: 'История' },
  { key: 'all', label: 'Все', short: 'Все' },
];

const STATUS_META = {
  pending: { label: 'В обработке', tone: 'pending' },
  confirmed: { label: 'Принят', tone: 'ok' },
  preparing: { label: 'В сборке', tone: 'ok' },
  delivering: { label: 'Доставка', tone: 'ok' },
  delivered: { label: 'Доставлен', tone: 'ok' },
  cancelled: { label: 'Отклонён', tone: 'danger' },
};

function fmtPrice(n) {
  return (Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' UZS';
}
function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ru-RU', {
    timeZone: 'Asia/Tashkent',
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}
function shortId(o) { return o._id.slice(-6).toUpperCase(); }

export default function Orders({ initial, toast }) {
  const [bucket, setBucket] = useState(initial?.bucket || 'active');
  const [search, setSearch] = useState('');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openOrder, setOpenOrder] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await listOrders({ bucket, ...(search ? { search } : {}) });
      setOrders(res.data || []);
    } catch (e) {
      toast?.err(e.message || 'Ошибка');
    } finally {
      setLoading(false);
    }
  }, [bucket, search, toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (bucket !== 'active') return;
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [bucket, load]);

  const doAction = async (order, next) => {
    try {
      const res = await updateOrderStatus(order._id, next);
      toast?.ok(`#${shortId(order)} → ${STATUS_META[next]?.label || next}`);
      setOrders((prev) => prev.map((o) => (o._id === order._id ? res.data : o)));
      if (openOrder && openOrder._id === order._id) setOpenOrder(res.data);
    } catch (e) {
      toast?.err(e.message || 'Ошибка');
    }
  };

  const doRevert = async (order) => {
    try {
      const res = await revertOrder(order._id);
      toast?.ok(`#${shortId(order)} → В обработке`);
      setOrders((prev) => prev.map((o) => (o._id === order._id ? res.data : o)));
      if (openOrder && openOrder._id === order._id) setOpenOrder(res.data);
    } catch (e) {
      toast?.err(e.message || 'Ошибка');
    }
  };

  return (
    <div className="ap-page">
      <div className="ap-page-head">
        <div>
          <h1 className="ap-page-title">Заказы</h1>
          <div className="ap-page-sub">Актуальные заказы и архив</div>
        </div>
        <button className="ap-btn ap-btn-ghost" onClick={load}>Обновить</button>
      </div>

      <div className="ap-tabs">
        {BUCKETS.map((b) => (
          <button
            key={b.key}
            className={`ap-tab ${bucket === b.key ? 'active' : ''}`}
            onClick={() => setBucket(b.key)}
          >
            {b.label}
          </button>
        ))}
        <input
          type="text"
          className="ap-input ap-tab-search"
          placeholder="Поиск по имени, телефону, Telegram ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="ap-muted">Загрузка…</div>
      ) : orders.length === 0 ? (
        <div className="ap-empty">
          {bucket === 'active' ? 'Активных заказов нет' : 'Пока ничего не найдено'}
        </div>
      ) : (
        <div className="ap-table-wrap">
          <table className="ap-table">
            <thead>
              <tr>
                <th>Заказ</th>
                <th>Клиент</th>
                <th>Позиций</th>
                <th>Сумма</th>
                <th>Статус</th>
                <th>Дата</th>
                <th style={{ width: 180 }}></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const meta = STATUS_META[o.status] || { label: o.status, tone: 'neutral' };
                const itemCount = (o.items || []).reduce((s, i) => s + i.quantity, 0);
                const isHistory = o.status !== 'pending';
                return (
                  <tr key={o._id}>
                    <td data-label="Заказ">
                      <button className="ap-link" onClick={() => setOpenOrder(o)}>
                        #{shortId(o)}
                      </button>
                    </td>
                    <td data-label="Клиент">
                      <div>{o.customerName || '—'}</div>
                      <div className="ap-muted-sm">{o.customerPhone || '—'}</div>
                    </td>
                    <td data-label="Позиций">{itemCount}</td>
                    <td data-label="Сумма">{fmtPrice(o.totalAmount)}</td>
                    <td data-label="Статус"><span className={`ap-pill tone-${meta.tone}`}>{meta.label}</span></td>
                    <td data-label="Дата" className="ap-muted-sm">{fmtDate(o.createdAt)}</td>
                    <td>
                      <div className="ap-row-actions">
                        {o.status === 'pending' && (
                          <>
                            <button
                              className="ap-btn ap-btn-xs ap-btn-primary"
                              onClick={() => doAction(o, 'confirmed')}
                            >
                              ✓ Принять
                            </button>
                            <button
                              className="ap-btn ap-btn-xs ap-btn-danger"
                              onClick={() => doAction(o, 'cancelled')}
                            >
                              × Отклонить
                            </button>
                          </>
                        )}
                        {isHistory && (
                          <button
                            className="ap-btn ap-btn-xs ap-btn-ghost"
                            onClick={() => setConfirm({
                              title: 'Вернуть заказ',
                              message: `Вернуть заказ #${shortId(o)} в статус «В обработке»?`,
                              confirmLabel: 'Вернуть',
                              tone: 'primary',
                              onConfirm: () => doRevert(o),
                            })}
                            title="Вернуть в обработку"
                          >
                            ↩ Вернуть
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {openOrder && (
        <OrderDetailModal
          order={openOrder}
          onClose={() => setOpenOrder(null)}
          onAction={doAction}
          onRevert={doRevert}
        />
      )}
      {confirm && (
        <ConfirmDialog
          {...confirm}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

function OrderDetailModal({ order, onClose, onAction, onRevert }) {
  const meta = STATUS_META[order.status] || { label: order.status, tone: 'neutral' };
  const mapLink = `https://yandex.uz/maps/?pt=${order.location.lng},${order.location.lat}&z=17&l=map`;
  const isHistory = order.status !== 'pending';

  return (
    <Modal
      title={`Заказ #${shortId(order)}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="ap-btn ap-btn-ghost" onClick={onClose}>Закрыть</button>
          {order.status === 'pending' && (
            <>
              <button className="ap-btn ap-btn-danger" onClick={() => onAction(order, 'cancelled')}>× Отклонить</button>
              <button className="ap-btn ap-btn-primary" onClick={() => onAction(order, 'confirmed')}>✓ Принять</button>
            </>
          )}
          {isHistory && (
            <button className="ap-btn ap-btn-primary" onClick={() => onRevert(order)}>↩ Вернуть в обработку</button>
          )}
        </>
      }
    >
      <div className="ap-detail-grid">
        <div>
          <div className="ap-label">Статус</div>
          <div><span className={`ap-pill tone-${meta.tone}`}>{meta.label}</span></div>
        </div>
        <div>
          <div className="ap-label">Создан</div>
          <div>{fmtDate(order.createdAt)}</div>
        </div>
        <div>
          <div className="ap-label">Клиент</div>
          <div>{order.customerName || '—'}</div>
        </div>
        <div>
          <div className="ap-label">Телефон</div>
          <div>
            {order.customerPhone ? (
              <a className="ap-link" href={`tel:${order.customerPhone}`}>{order.customerPhone}</a>
            ) : '—'}
          </div>
        </div>
        <div>
          <div className="ap-label">Telegram ID</div>
          <div><code>{order.telegramId}</code></div>
        </div>
        <div>
          <div className="ap-label">Оплата</div>
          <div>{order.paymentMethod === 'card' ? 'Карта' : 'Наличные'}</div>
        </div>
      </div>

      <div className="ap-label" style={{ marginTop: 14 }}>Адрес</div>
      <div>{order.location?.addressString || '—'}</div>
      <a className="ap-link" href={mapLink} target="_blank" rel="noreferrer">🗺 Открыть на карте</a>

      {order.notes && (
        <>
          <div className="ap-label" style={{ marginTop: 14 }}>Комментарий</div>
          <div>{order.notes}</div>
        </>
      )}

      <div className="ap-label" style={{ marginTop: 14 }}>Товары</div>
      <div className="ap-order-items">
        {(order.items || []).map((it, idx) => (
          <div key={idx} className="ap-order-item">
            <div>
              <div>{it.name}</div>
              <div className="ap-muted-sm">{fmtPrice(it.price)} × {it.quantity}</div>
            </div>
            <div>{fmtPrice(it.price * it.quantity)}</div>
          </div>
        ))}
      </div>
      <div className="ap-order-total">Итого: <b>{fmtPrice(order.totalAmount)}</b></div>
    </Modal>
  );
}
