import React, { useCallback, useEffect, useState } from 'react';
import { formatDateTime, formatMoney, shortId } from '../../lib/format';
import { actionsFor, statusMeta } from './orderModel';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Field } from '../../ui/Field';

function Timeline({ history = [], createdAt }) {
  const items = [...history].reverse();
  return (
    <ol className="fh-timeline">
      {items.map((entry, index) => {
        const meta = statusMeta(entry.status);
        return (
          <li key={`${entry.status}-${entry.at}-${index}`} className={index === 0 ? 'is-current' : ''}>
            <i aria-hidden="true" />
            <div>
              <b>{meta.label}</b>
              <small>
                {formatDateTime(entry.at)}
                {entry.by?.name ? ` · ${entry.by.name}` : ''}
              </small>
              {entry.reason && <p>{entry.reason}</p>}
            </div>
          </li>
        );
      })}
      <li className="fh-timeline__origin">
        <i aria-hidden="true" />
        <div><b>Заказ оформлен</b><small>{formatDateTime(createdAt)}</small></div>
      </li>
    </ol>
  );
}

function Notes({ notes = [], onAdd }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try { await onAdd(text.trim()); setText(''); } finally { setSaving(false); }
  };
  return (
    <div className="fh-notes">
      {notes.length > 0 && (
        <div className="fh-notes__list">
          {notes.map((note, index) => (
            <div key={`${note.at}-${index}`}>
              <small>{note.by?.name || 'Оператор'} · {formatDateTime(note.at)}</small>
              <p>{note.text}</p>
            </div>
          ))}
        </div>
      )}
      <div className="fh-notes__composer">
        <input
          className="fh-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && submit()}
          placeholder="Заметка для команды — клиент её не увидит"
          aria-label="Внутренняя заметка"
        />
        <Button size="sm" disabled={saving || !text.trim()} onClick={submit}>Добавить</Button>
      </div>
    </div>
  );
}

/**
 * The order detail dialog. Loads the full server detail (history, notes,
 * customer context, legal actions) and renders action buttons strictly from
 * the server's `actions` answer.
 */
export function OrderWorkbench({ orderId, api, me, initial, onClose, onChanged, onAction }) {
  const [detail, setDetail] = useState(initial ? { order: initial, actions: null, customer: null } : null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await api.detail(orderId);
      setDetail(response.data);
      setError('');
    } catch (err) {
      setError(err.message || 'Не удалось загрузить заказ');
    }
  }, [api, orderId]);

  useEffect(() => { load(); }, [load]);

  const order = detail?.order;
  const claim = async (release) => {
    try {
      const response = await api.claim(orderId, release ? { release: true } : {});
      setDetail((current) => current && ({ ...current, order: { ...current.order, ...response.data } }));
      onChanged?.();
    } catch (err) {
      setError(err.message);
    }
  };
  const addNote = async (text) => {
    const response = await api.addNote(orderId, text);
    setDetail((current) => current && ({
      ...current,
      order: { ...current.order, internalNotes: response.data.internalNotes },
    }));
  };

  if (!order) {
    return (
      <Dialog open title="Загружаем заказ…" onClose={onClose} width="860px">
        {error ? <div className="fh-error-note">{error}</div> : <div className="fh-page-skeleton"><span /><span /></div>}
      </Dialog>
    );
  }

  const meta = statusMeta(order.status);
  const actions = detail.actions ? actionsFor(detail.actions) : [];
  const customer = detail.customer;
  const itemTotal = (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const claimedByMe = order.claimedBy?.telegramId && order.claimedBy.telegramId === me?.telegramId;
  const claimedByOther = order.claimedBy?.telegramId && !claimedByMe;

  return (
    <Dialog open title={`Заказ #${shortId(order._id)}`} description={formatDateTime(order.createdAt)} onClose={onClose} width="860px">
      <div className="fh-workbench fh-print-area">
        <section className="fh-workbench__lead">
          <div>
            <div className="fh-workbench__badges">
              <Badge tone={meta.tone}>{meta.label}</Badge>
              {customer?.customerBlocked && <Badge tone="danger">Клиент заблокирован</Badge>}
              {order.billzSync?.conflict && <Badge tone="danger">Конфликт Billz</Badge>}
            </div>
            <h3>{order.customerName || 'Без имени'}</h3>
            <p>
              {order.customerPhone || 'Телефон не указан'}
              {customer?.ordersCount > 1 && ` · ${customer.ordersCount}-й заказ клиента`}
            </p>
          </div>
          <div className="fh-workbench__total"><span>{itemTotal} поз.</span><strong>{formatMoney(order.totalAmount)}</strong></div>
        </section>

        <div className="fh-claim-strip" data-print-hide>
          {claimedByOther
            ? <span className="fh-claim-strip__holder">В работе у: <b>{order.claimedBy.name || order.claimedBy.telegramId}</b></span>
            : claimedByMe
              ? <><span className="fh-claim-strip__holder">Вы ведёте этот заказ</span><Button size="sm" variant="ghost" onClick={() => claim(true)}>Отпустить</Button></>
              : <Button size="sm" onClick={() => claim(false)}>Беру заказ</Button>}
        </div>

        <div className="fh-contact-strip" data-print-hide>
          {order.customerPhone && <a href={`tel:${order.customerPhone}`}>Позвонить</a>}
          {order.telegramId && <a href={`tg://user?id=${order.telegramId}`}>Написать в Telegram</a>}
          {order.location?.lat ? <a href={`https://maps.google.com/?q=${order.location.lat},${order.location.lng}`} target="_blank" rel="noopener noreferrer">Открыть карту</a> : null}
        </div>

        <section className="fh-workbench__section">
          <h4>Адрес доставки</h4>
          <p>{order.location?.addressString || 'Адрес не указан'}</p>
        </section>

        <section className="fh-workbench__section">
          <h4>Состав заказа</h4>
          <div className="fh-order-items">
            {(order.items || []).map((item, index) => (
              <div key={`${item.productId || item.name}-${index}`}>
                <span>{item.name}<small>{item.quantity} × {formatMoney(item.price)}</small></span>
                <b>{formatMoney(item.quantity * item.price)}</b>
              </div>
            ))}
          </div>
          <div className="fh-order-totals">
            <div><span>Доставка</span><b>{formatMoney(order.deliveryFee)}</b></div>
            {order.discount > 0 && <div><span>Скидка{order.promoCode ? ` (${order.promoCode})` : ''}</span><b>−{formatMoney(order.discount)}</b></div>}
            <div className="fh-order-totals__grand"><span>Итого</span><b>{formatMoney(order.totalAmount)}</b></div>
          </div>
        </section>

        {order.notes && (
          <section className="fh-workbench__section">
            <h4>Комментарий клиента</h4>
            <p>{order.notes}</p>
          </section>
        )}

        <section className="fh-workbench__section">
          <h4>Оплата</h4>
          <p>{order.paymentMethod === 'card' ? 'Картой' : 'Наличными'} · источник: {order.source === 'miniapp' ? 'мини-приложение' : 'сайт'}</p>
        </section>

        <section className="fh-workbench__section" data-print-hide>
          <h4>Внутренние заметки</h4>
          <Notes notes={order.internalNotes} onAdd={addNote} />
        </section>

        <section className="fh-workbench__section" data-print-hide>
          <h4>История статусов</h4>
          <Timeline history={order.statusHistory} createdAt={order.createdAt} />
        </section>

        {error && <div className="fh-error-note" data-print-hide>{error}</div>}

        <footer className="fh-workbench__footer" data-print-hide>
          <Button onClick={() => window.print()}>Печать чека</Button>
          <div className="fh-order-actions">
            {detail.canRevert && !actions.length && (
              <Button size="sm" variant="ghost" onClick={() => onAction({ revert: true })}>Вернуть в очередь</Button>
            )}
            {actions.map((action) => (
              <Button key={action.to} variant={action.tone} onClick={() => onAction(action)}>{action.label}</Button>
            ))}
          </div>
        </footer>
      </div>
    </Dialog>
  );
}
