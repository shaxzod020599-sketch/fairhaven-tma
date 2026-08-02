import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ordersApi } from '../../api/orders';
import { formatDateTime, formatMoney, plural, shortId } from '../../lib/format';
import { attentionReason, newPendingIds, nextActions, statusMeta } from './orderModel';
import { matchRoute, navigate, useRoute } from '../../app/route';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Dialog } from '../../ui/Dialog';
import { DataState } from '../../ui/DataState';
import { Field } from '../../ui/Field';
import { Pagination } from '../../ui/Pagination';
import { useToast } from '../../ui/ToastProvider';
import { OrderWorkbench } from './OrderWorkbench';

const LIMIT = 30;
const BUCKETS = [
  ['active', 'Требуют внимания'],
  ['history', 'В работе и история'],
  ['all', 'Все заказы'],
];
const SOUND_KEY = 'fh-orders-sound';

/** Short two-tone chime through WebAudio — no asset, no autoplay issues. */
function chime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const gain = ctx.createGain();
    gain.gain.value = 0.06;
    gain.connect(ctx.destination);
    [660, 880].forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = frequency;
      osc.connect(gain);
      osc.start(ctx.currentTime + index * 0.14);
      osc.stop(ctx.currentTime + index * 0.14 + 0.12);
    });
    window.setTimeout(() => ctx.close(), 600);
  } catch (_) { /* sound is best-effort */ }
}

function OrderActions({ order, onAction }) {
  const actions = nextActions(order.status);
  if (!actions.length) {
    return <Button size="sm" variant="ghost" onClick={() => onAction({ revert: true })}>Вернуть в очередь</Button>;
  }
  return (
    <div className="fh-order-actions">
      {actions.map((action) => <Button key={action.to} size="sm" variant={action.tone} onClick={() => onAction(action)}>{action.label}</Button>)}
    </div>
  );
}

export function OrdersPage({ api = ordersApi, me = null }) {
  const toast = useToast();
  const route = useRoute();
  const openId = matchRoute(route, '/orders/:id')?.id || null;

  const [bucket, setBucket] = useState('active');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [fresh, setFresh] = useState(0);
  const [sound, setSound] = useState(() => window.localStorage.getItem(SOUND_KEY) === '1');
  const requestId = useRef(0);
  const knownRows = useRef(null);

  useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    window.localStorage.setItem(SOUND_KEY, sound ? '1' : '0');
  }, [sound]);

  const load = useCallback(async ({ silent = false } = {}) => {
    const id = ++requestId.current;
    if (!silent) setLoading(true);
    try {
      const response = await api.list({ bucket, search: query, page, limit: LIMIT });
      if (id !== requestId.current) return;
      const next = response.data || [];

      // One notification per genuinely new order; first load stays silent.
      if (knownRows.current !== null) {
        const arrived = newPendingIds(knownRows.current, next);
        if (arrived.length) {
          setFresh((count) => count + arrived.length);
          if (sound) chime();
        }
      }
      knownRows.current = next;

      setRows(next);
      setTotal(response.meta?.total ?? next.length ?? 0);
      setError('');
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err.message || 'Не удалось загрузить заказы');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [api, bucket, page, query, sound]);

  useEffect(() => {
    knownRows.current = null;
    load();
    if (bucket !== 'active') return undefined;
    const poll = window.setInterval(() => load({ silent: true }), 10_000);
    return () => window.clearInterval(poll);
  }, [bucket, load]);

  const mutateRow = (updated) => {
    setRows((current) => current.map((row) => (row._id === updated._id ? { ...row, ...updated } : row)));
  };

  const runAction = async (order, action) => {
    try {
      if (action.revert) {
        const response = await api.revert(order._id);
        mutateRow(response.data);
        toast?.success?.(`Заказ #${shortId(order._id)} возвращён в очередь`);
      } else {
        const response = await api.transition(order._id, { to: action.to, reason: action.reasonText || '' });
        mutateRow(response.data.order || response.data);
        toast?.success?.(`${statusMeta(action.to).label}: заказ #${shortId(order._id)}`, {
          actionLabel: 'Вернуть в очередь',
          onAction: async () => {
            try {
              const undone = await api.revert(order._id);
              mutateRow(undone.data);
              toast?.success?.(`Заказ #${shortId(order._id)} снова в очереди`);
            } catch (err) {
              toast?.error?.(err.message || 'Не получилось вернуть');
            }
          },
        });
      }
    } catch (err) {
      toast?.error?.(err.message || 'Статус не изменён');
    }
  };

  const requestAction = (order, action) => {
    if (action.reason) setConfirm({ order, action, reason: '' });
    else runAction(order, action);
  };

  const openOrder = (order) => {
    setFresh(0);
    navigate(`/orders/${order._id}`);
  };
  const closeOrder = () => navigate('/orders');

  const attention = useMemo(() => rows.filter((row) => attentionReason(row)), [rows]);

  return (
    <div className="fh-page fh-orders">
      <header className="fh-page-head" data-print-hide>
        <div>
          <p className="fh-eyebrow">ОПЕРАТОРСКАЯ ОЧЕРЕДЬ</p>
          <h1>Заказы {fresh > 0 && <span className="fh-fresh-badge" aria-label={`${fresh} новых`}>+{fresh}</span>}</h1>
          <p>{attention.length} {plural(attention.length, 'требует', 'требуют', 'требуют')} внимания · обновление каждые 10 секунд</p>
        </div>
        <div className="fh-head-actions">
          <Button
            variant="ghost"
            aria-pressed={sound}
            onClick={() => setSound((current) => !current)}
          >{sound ? '🔔 Звук вкл.' : '🔕 Звук выкл.'}</Button>
          <Button onClick={() => { setFresh(0); load(); }}>Обновить</Button>
        </div>
      </header>

      <div className="fh-toolbar" data-print-hide>
        <div className="fh-tabs">
          {BUCKETS.map(([key, label]) => (
            <button key={key} type="button" className={bucket === key ? 'is-active' : ''} onClick={() => { setBucket(key); setPage(1); }}>{label}</button>
          ))}
        </div>
        <input className="fh-input fh-toolbar__search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Имя, телефон или Telegram ID" aria-label="Поиск заказов" />
      </div>

      {error && rows.length > 0 && (
        <div className="fh-stale-note" data-print-hide>Не удалось обновить. Предыдущие заказы сохранены. <button type="button" onClick={() => load()}>Повторить</button></div>
      )}

      {loading && rows.length === 0 ? (
        <div className="fh-page-skeleton"><span /><span /><span /></div>
      ) : error && rows.length === 0 ? (
        <DataState tone="error" title="Заказы недоступны" message={error} actionLabel="Повторить" onAction={load} />
      ) : rows.length === 0 ? (
        <DataState title="Очередь спокойна" message="Новых заказов пока нет. Панель продолжает проверять обновления." />
      ) : (
        <div className="fh-order-list" data-print-hide>
          {rows.map((order) => {
            const meta = statusMeta(order.status);
            const reason = attentionReason(order);
            return (
              <Card key={order._id} className={`fh-order-row ${reason ? 'is-attention' : ''}`}>
                <button type="button" className="fh-order-row__open" aria-label={`Открыть заказ #${shortId(order._id)}`} onClick={() => openOrder(order)}>
                  <span className="fh-mono">#{shortId(order._id)}</span>
                  <span><b>{order.customerName || 'Без имени'}</b><small>{order.customerPhone || 'Нет телефона'}</small></span>
                  <span><b>{(order.items || []).reduce((sum, item) => sum + item.quantity, 0)} поз.</b><small>{formatDateTime(order.createdAt)}</small></span>
                  <strong>{formatMoney(order.totalAmount)}</strong>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  {order.claimedBy?.name && <em className="fh-claim-tag">→ {order.claimedBy.name}</em>}
                  {reason && <em>{reason.label}</em>}
                </button>
                <OrderActions order={order} onAction={(action) => requestAction(order, action)} />
              </Card>
            );
          })}
        </div>
      )}
      <Pagination page={page} total={total} limit={LIMIT} onPage={setPage} />

      {openId && (
        <OrderWorkbench
          orderId={openId}
          api={api}
          me={me}
          initial={rows.find((row) => row._id === openId) || null}
          onClose={closeOrder}
          onChanged={() => load({ silent: true })}
          onAction={(action) => {
            const order = rows.find((row) => row._id === openId) || { _id: openId };
            if (action.reason) setConfirm({ order, action, reason: '' });
            else { runAction(order, action); closeOrder(); }
          }}
        />
      )}

      <Dialog open={Boolean(confirm)} title={confirm?.action?.to === 'returned' ? 'Оформить возврат' : 'Отклонить заказ'} description="Причину увидит команда, а клиент получит вежливое уведомление." onClose={() => setConfirm(null)} width="520px">
        <Field label="Причина" hint="Обязательное поле — коротко объясните решение.">
          <textarea className="fh-textarea" value={confirm?.reason || ''} onChange={(event) => setConfirm((current) => ({ ...current, reason: event.target.value }))} placeholder="Например: клиент не выходит на связь" />
        </Field>
        <div className="fh-dialog-actions">
          <Button onClick={() => setConfirm(null)}>Отмена</Button>
          <Button
            variant="danger"
            disabled={!confirm?.reason?.trim()}
            onClick={() => {
              const current = confirm;
              setConfirm(null);
              runAction(current.order, { ...current.action, reasonText: current.reason.trim() });
              if (openId) closeOrder();
            }}
          >Подтвердить</Button>
        </div>
      </Dialog>
    </div>
  );
}
