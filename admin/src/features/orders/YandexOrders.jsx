import React, { useCallback, useEffect, useRef, useState } from 'react';
import { yandexApi } from '../../api/yandex';
import { formatDateTime } from '../../lib/format';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { DataState } from '../../ui/DataState';
import { Dialog } from '../../ui/Dialog';
import { Field } from '../../ui/Field';
import { Pagination } from '../../ui/Pagination';

const LABEL = { accept: 'Принять', cooking: 'Начать сборку', ready: 'Готов', reject: 'Отклонить' };
const STATUS = { NEW: 'Новый', ACCEPTED_BY_RESTAURANT: 'Принят', COOKING: 'Собирается', READY: 'Готов · ожидает курьера', TAKEN_BY_COURIER: 'У курьера', DELIVERED: 'Доставлен', CANCELLED: 'Отменён' };
const ACCOUNTING = { received: 'Получен · без резерва', reserved: 'Зарезервирован', sold: 'Продажа завершена', cancelled: 'Отменён', failed: 'Ошибка учёта' };
const ERROR = {
  yandex_disabled: 'Yandex отключён. Действия недоступны.',
  yandex_accounting_disabled: 'Учёт отключён: резервирование и продажа недоступны.',
  yandex_unavailable: 'Товар недоступен. Проверьте состав и выберите замену.',
  yandex_empty_items: 'Состав пуст: отклоните заказ или добавьте товары.',
  yandex_items_locked: 'Состав заблокирован. Проверьте актуальное состояние заказа.',
  yandex_reconciliation_required: 'Нужна сверка учёта. Повторная продажа недоступна.',
  yandex_operation_in_progress: 'Решение обрабатывается. Дождитесь обновления.',
  yandex_cancellation_pending: 'Отмена ожидает обработки.',
  yandex_cancelled: 'Заказ отменён.',
};
const money = (value) => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value || 0).replace(/\u00a0/g, ' ')} UZS`;
const errorText = (error) => ERROR[error.code] || error.message || 'Не удалось загрузить заказ Yandex';
const guarded = (order) => !order.enabled || order.inProgress || order.reconciliationRequired || order.cancellationPending || order.status === 'CANCELLED';
const actionsFor = (order) => guarded(order) ? [] : (order.actions || []).filter((action) => LABEL[action] && (order.accountingEnabled || !['accept', 'ready'].includes(action)));
const editable = (order) => order && !guarded(order) && !order.itemsFrozen && ['received', 'failed'].includes(order.accountingStatus);
const picked = (items) => items.filter((item) => item.quantity > 0).map(({ billzProductId, quantity }) => ({ billzProductId, quantity }));

function Status({ order }) {
  return <div className="fh-yandex-status">
    <Badge tone={order.status === 'CANCELLED' ? 'danger' : 'neutral'}>Выдача: {STATUS[order.status] || order.status}</Badge>
    <Badge tone={order.reconciliationRequired ? 'danger' : 'neutral'}>Учёт: {ACCOUNTING[order.accountingStatus] || order.accountingStatus}</Badge>
  </div>;
}
function Warnings({ order }) {
  const warnings = [
    !order.enabled && 'Yandex отключён. История доступна, действия недоступны.',
    !order.accountingEnabled && ERROR.yandex_accounting_disabled,
    order.reconciliationRequired && 'Нужна сверка учёта. Продажа и отмена заблокированы до проверки; возврат денег не подтверждён.',
    order.cancellationPending && ERROR.yandex_cancellation_pending,
    order.inProgress && 'Решение обрабатывается. Повторное действие недоступно.',
    order.status === 'CANCELLED' && 'Заказ отменён. Статус выдачи не подтверждает возврат денег.',
  ].filter(Boolean);
  return warnings.length > 0 && <div className="fh-stale-note" role="status">{warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>;
}

export function YandexOrders({ api = yandexApi, leaveRef }) {
  const [result, setResult] = useState(null);
  const [bucket, setBucket] = useState('active'); const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const generation = useRef(0); const list = useRef(null); const lastOpened = useRef(null);
  const load = useCallback(async () => {
    const request = ++generation.current;
    try {
      const response = await api.list({ bucket, page, limit: 30 });
      if (request !== generation.current) return;
      setResult((previous) => ({ ...response, data: (response.data || []).map((row) => {
        const known = previous?.data?.find((item) => item.id === row.id);
        return known && (known.revision > row.revision || known.itemsRevision > row.itemsRevision) ? known : row;
      }) })); setError('');
    } catch (err) { if (request === generation.current) setError(errorText(err)); }
    finally { if (request === generation.current) setLoading(false); }
  }, [api, bucket, page]);
  const changed = useCallback((updated) => {
    if (updated) setResult((previous) => previous && ({ ...previous, data: previous.data.map((row) => row.id === updated.id ? updated : row) }));
    return load();
  }, [load]);
  useEffect(() => {
    setLoading(true); load();
    const timer = window.setInterval(load, 10000);
    return () => { generation.current += 1; window.clearInterval(timer); };
  }, [load]);
  useEffect(() => {
    if (!selected) [...(list.current?.querySelectorAll('button[data-order-id]') || [])].find((button) => button.dataset.orderId === lastOpened.current)?.focus();
  }, [selected]);
  const back = () => setSelected(null);
  return <section className="fh-yandex" aria-label="Заказы Yandex">
    {selected ? <OrderDetail key={selected} id={selected} api={api} onBack={back} onChanged={changed} leaveRef={leaveRef} /> : <>
      <div className="fh-toolbar">
        <div className="fh-tabs" aria-label="Состояние заказов Yandex">{[['active', 'Активные'], ['history', 'История'], ['all', 'Все']].map(([value, label]) =>
          <button type="button" key={value} className={bucket === value ? 'is-active' : ''} aria-pressed={bucket === value} onClick={() => { setBucket(value); setPage(1); }}>{label}</button>)}</div>
        <Button onClick={load}>Обновить Yandex</Button>
      </div>
      <p>Принятие резервирует товары, «Готов» завершает продажу. Выдачу курьеру и доставку отмечает Yandex. Готовые заказы остаются активными до завершения доставки.</p>
      {result && !result.enabled && <div className="fh-stale-note">Yandex отключён. История доступна, действия недоступны.</div>}
      {result && !result.accountingEnabled && <div className="fh-stale-note">{ERROR.yandex_accounting_disabled}</div>}
      {error && <div className="fh-error-note" role="alert">{error}</div>}
      {loading && !result ? <DataState title="Загружаем заказы Yandex" /> : !result && error ? <DataState tone="error" title="Заказы Yandex недоступны" /> : !result?.data?.length ?
        <DataState title="Заказов Yandex пока нет" message="Выберите другую вкладку или обновите список." /> : <div ref={list} className="fh-order-list">
          {result.data.map((order) => <Card key={order.id} className="fh-yandex-card">
            <div className="fh-yandex-lead"><strong className="fh-mono">Yandex · {order.externalId}</strong><strong>{money(order.totalAmount)}</strong></div>
            <Status order={order} />
            <p>{formatDateTime(order.createdAt)} · {order.customer?.name || 'Без имени'}</p>
            <Warnings order={order} />
            <div className="fh-yandex-lead"><span>Следующее действие: {actionsFor(order).map((action) => LABEL[action]).join(' / ') || 'ожидать обновления'}</span>
              <Button data-order-id={order.id} onClick={() => { lastOpened.current = order.id; setSelected(order.id); }} aria-label={`Открыть ${order.externalId}`}>Открыть заказ</Button></div>
          </Card>)}
        </div>}
      <Pagination page={page} total={result?.meta?.total || 0} limit={30} onPage={setPage} />
    </>}
  </section>;
}

function OrderDetail({ id, api, onBack, onChanged, leaveRef }) {
  const [order, setOrder] = useState(null); const [draft, setDraft] = useState([]); const [reason, setReason] = useState('');
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null); const [busy, setBusy] = useState(false); const [needsRefresh, setNeedsRefresh] = useState(false);
  const [query, setQuery] = useState(''); const [products, setProducts] = useState([]); const [searchError, setSearchError] = useState(''); const [searching, setSearching] = useState(false);
  const generation = useRef(0); const searchGeneration = useRef(0); const mounted = useRef(true);
  const current = useRef(null); const lock = useRef({}); const heading = useRef(null);
  const dirty = Boolean(order && (JSON.stringify(picked(draft)) !== JSON.stringify(picked(order.items)) || reason.trim() || draft.some((item) => item.quantity === '')));
  lock.current = { dirty, confirm, busy, needsRefresh };
  const canEdit = editable(order);
  const invalid = draft.some((item) => !Number.isSafeInteger(item.quantity) || item.quantity < 0 || item.quantity > item.maximum);

  const adopt = useCallback((next) => {
    if (!next || next.id !== id || (current.current && (next.revision < current.current.revision || next.itemsRevision < current.current.itemsRevision))) return false;
    current.current = next; setOrder(next);
    setDraft(next.items.map((item) => ({ ...item, maximum: item.quantity })));
    setReason(''); setError(''); setNeedsRefresh(false); lock.current.needsRefresh = false; lock.current.dirty = false;
    return true;
  }, [id]);

  const load = useCallback(async ({ recover = false } = {}) => {
    if (!recover && (lock.current.dirty || lock.current.confirm || lock.current.busy)) return;
    const request = ++generation.current;
    try {
      const response = await api.detail(id);
      if (!mounted.current || request !== generation.current) return;
      if (!adopt(response.data) && recover) setError('Получена старая версия. Обновите заказ ещё раз.');
    } catch (err) { if (mounted.current && request === generation.current) setError(errorText(err)); }
    finally { if (mounted.current && request === generation.current) setLoading(false); }
  }, [api, id, adopt]);
  useEffect(() => {
    mounted.current = true; load();
    const timer = window.setInterval(() => {
      if (!lock.current.needsRefresh) load();
    }, 10000);
    return () => { mounted.current = false; generation.current += 1; searchGeneration.current += 1; window.clearInterval(timer); };
  }, [load]);
  useEffect(() => { if (order) heading.current?.focus(); }, [Boolean(order)]);

  const requestLeave = (proceed) => {
    if (lock.current.busy) return;
    if (lock.current.dirty) {
      generation.current += 1; lock.current.confirm = true;
      setConfirm({ kind: 'discard', proceed });
    } else proceed();
  };
  useEffect(() => {
    if (!leaveRef) return undefined;
    leaveRef.current = requestLeave;
    return () => { leaveRef.current = null; };
  });
  useEffect(() => {
    if (!dirty) return undefined;
    const prevent = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty]);

  useEffect(() => {
    const request = ++searchGeneration.current;
    setProducts([]); setSearchError(''); setSearching(false);
    if (!query.trim() || !canEdit || busy || confirm || needsRefresh) return undefined;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.products({ search: query.trim().slice(0, 120), limit: 30 });
        if (mounted.current && request === searchGeneration.current) setProducts(response.items || []);
      } catch (err) { if (mounted.current && request === searchGeneration.current) setSearchError(errorText(err)); }
      finally { if (mounted.current && request === searchGeneration.current) setSearching(false); }
    }, 300);
    return () => { window.clearTimeout(timer); searchGeneration.current += 1; };
  }, [api, query, canEdit, busy, Boolean(confirm), needsRefresh]);

  const touch = () => { generation.current += 1; lock.current.dirty = true; };
  const editQuantity = (id, value) => { touch(); setDraft((items) => items.map((item) => item.billzProductId === id ? { ...item, quantity: value } : item)); };
  const openConfirm = (value) => { generation.current += 1; lock.current.confirm = true; setConfirm(value); };
  const closeConfirm = () => { if (!lock.current.busy) { lock.current.confirm = false; setConfirm(null); } };

  const submit = async () => {
    if (lock.current.busy || lock.current.needsRefresh || !confirm || confirm.kind === 'discard') return;
    lock.current.busy = true; setBusy(true); generation.current += 1; searchGeneration.current += 1;
    try {
      const response = confirm.kind === 'items'
        ? await api.updateItems(id, { items: confirm.items, expectedItemsRevision: confirm.order.itemsRevision, reason: confirm.reason.trim() })
        : await api.decide(id, { action: confirm.action, expectedRevision: confirm.order.revision,
          ...(confirm.action === 'accept' ? { expectedItemsRevision: confirm.order.itemsRevision } : {}), reason: confirm.reason.trim() });
      if (!mounted.current) return;
      generation.current += 1;
      if (!adopt(response.order)) throw new Error('Не получено актуальное подтверждение');
      setNotice(''); setQuery(''); setConfirm(null); onChanged(response.order);
    } catch (err) {
      if (!mounted.current) return;
      setConfirm(null); setNeedsRefresh(true); lock.current.needsRefresh = true;
      setNotice(err.status === 409
        ? `Конфликт версий или состояния. Загружаем актуальный состав; проверьте его перед новым решением. ${ERROR[err.code] || ''}`
        : !err.status || err.status >= 500
          ? 'Результат неизвестен. Повтор не отправлен. Обновите заказ перед следующим действием.'
          : errorText(err));
      await Promise.all([load({ recover: true }), onChanged()]);
    } finally {
      if (mounted.current) { lock.current.busy = false; lock.current.confirm = false; setBusy(false); }
    }
  };
  const blocked = busy || needsRefresh || Boolean(error) || Boolean(confirm);
  const description = confirm?.kind === 'items' ? 'Сохранение проверит товары и цены на сервере. Состав можно изменить до принятия заказа.'
    : confirm?.action === 'accept' ? 'Подтверждение зарезервирует товары в BILLZ и зафиксирует состав. Это не завершение продажи.'
      : confirm?.action === 'ready' ? 'Подтверждение завершит продажу в BILLZ. Убедитесь, что заказ собран. Передачу курьеру отмечает Yandex.'
        : confirm?.action === 'cooking' ? 'Подтвердите начало сборки. Продажа будет завершена отдельным действием «Готов».'
          : 'Отмена выдачи освобождает резерв. После продажи отмена требует сверки учёта и не оформляет возврат денег.';

  return <div className="fh-yandex-detail">
    <div className="fh-yandex-lead"><Button disabled={busy} onClick={() => requestLeave(onBack)}>К списку Yandex</Button>
      <Button disabled={busy || (!needsRefresh && (dirty || Boolean(confirm)))} onClick={() => load({ recover: needsRefresh })}>Обновить заказ</Button></div>
    {notice && <div className="fh-stale-note" role="alert">{notice}</div>}
    {error && <div className="fh-error-note" role="alert">{error}</div>}
    {!order ? <DataState title={loading ? 'Загружаем заказ Yandex' : 'Заказ Yandex недоступен'} /> : <>
      <Card className="fh-yandex-card">
        <div className="fh-yandex-lead"><h2 ref={heading} tabIndex={-1}>Yandex · {order.externalId}</h2><strong>{money(order.totalAmount)}</strong></div>
        <Status order={order} /><Warnings order={order} />
        <p>{order.customer?.name || 'Без имени'} {order.customer?.phone} · {formatDateTime(order.createdAt)}</p>
        <p>Версия решения: {order.revision}</p>
        <p>Версия состава: {order.itemsRevision}</p>
      </Card>
      <Card className="fh-yandex-card">
        <h3>Состав заказа</h3>
        <p>«Загружено» — состав на указанной версии. Сумма выше получена от сервера. Цена и наличие повторно проверяются при сохранении и принятии.</p>
        {order.itemsFrozen && <p className="fh-info-note">Состав зафиксирован. Изменения недоступны.</p>}
        {dirty && <p className="fh-info-note" role="status">Есть несохранённые изменения. Обновление состава приостановлено.</p>}
        {!picked(draft).length && <p className="fh-stale-note">Состав пуст: отклоните заказ или добавьте товары. Принятие недоступно.</p>}
        <ul className="fh-yandex-items">{draft.map((item) => {
          const original = order.items.find((loaded) => loaded.billzProductId === item.billzProductId)?.quantity || 0;
          return <li key={item.billzProductId}>
            <div><b>{item.name || item.billzProductId}</b><small className="fh-mono">{item.billzProductId}</small><p>Загружено: {original}</p><p>Цена: {money(item.unitPrice)}{!original && ' · из каталога'}</p></div>
            {canEdit ? <div className="fh-yandex-quantity"><Field label={`Количество: ${item.name || item.billzProductId}`} hint={`Целое число от 0 до ${item.maximum}`} error={(!Number.isSafeInteger(item.quantity) || item.quantity < 0 || item.quantity > item.maximum) ? 'Укажите допустимое целое количество' : ''}>
              <input aria-label={`Количество: ${item.name || item.billzProductId}`} className="fh-input" type="number" min="0" max={item.maximum} step="1" value={item.quantity} disabled={blocked} onChange={(event) => editQuantity(item.billzProductId, event.target.value === '' ? '' : Number(event.target.value))} /></Field>
              {item.quantity === 0 ? <><span>Удалено из сборки</span><Button disabled={blocked || picked(draft).length >= 100} onClick={() => editQuantity(item.billzProductId, original || 1)}>Вернуть {item.name}</Button></>
                : <Button disabled={blocked} onClick={() => editQuantity(item.billzProductId, 0)}>Удалить {item.name}</Button>}
            </div> : <p>В составе: {item.quantity}</p>}
          </li>;
        })}</ul>
        {canEdit && <>
          <Field label="Поиск замены" hint="Удалите заменяемую строку и добавьте товар из доступного каталога."><input aria-label="Поиск замены" className="fh-input" maxLength={120} value={query} disabled={blocked} onChange={(event) => { searchGeneration.current += 1; setQuery(event.target.value.slice(0, 120)); }} /></Field>
          {searchError && <div className="fh-error-note" role="alert">{searchError}</div>}
          {searching && <p role="status">Ищем доступные товары…</p>}
          {query.trim() && !searching && !searchError && !products.length && <p>Доступных товаров не найдено.</p>}
          <ul className="fh-yandex-products">{products.map((product) => <li key={product.billzProductId}>
            <span><b>{product.name}</b><small>{money(product.unitPrice)} · доступно по каталогу: {product.availableQuantity}</small></span>
            <Button disabled={blocked || draft.some((item) => item.billzProductId === product.billzProductId) || picked(draft).length >= 100} onClick={() => {
              touch(); setDraft((items) => [...items, { ...product, quantity: 1, maximum: Math.min(product.availableQuantity, 10000) }]);
            }}>Добавить {product.name}</Button>
          </li>)}</ul>
          <Field label="Причина изменения состава" hint="Необязательно, до 300 символов."><textarea aria-label="Причина изменения состава" className="fh-textarea" maxLength={300} disabled={blocked} value={reason} onChange={(event) => { touch(); setReason(event.target.value.slice(0, 300)); }} /></Field>
          <Button variant="primary" disabled={!dirty || invalid || blocked} onClick={() => openConfirm({ kind: 'items', order, items: picked(draft), reason })}>Сохранить состав</Button>
        </>}
      </Card>
      <Card className="fh-yandex-card"><h3>Действия сотрудника</h3>
        {dirty && <p>Сохраните состав перед решением.</p>}
        <div className="fh-order-actions">{actionsFor(order).map((action) => <Button key={action} variant={action === 'reject' ? 'danger' : 'primary'} disabled={blocked || dirty || (action === 'accept' && !order.items.length)} onClick={() => openConfirm({ kind: 'decision', action, order, reason: '' })}>{LABEL[action]}</Button>)}</div>
        {!actionsFor(order).length && <p>Действия недоступны. Ожидайте обновления состояния.</p>}
      </Card>
      {order.audit?.length > 0 && <Card className="fh-yandex-card"><h3>История решений</h3><ul>{order.audit.map((entry, index) => <li key={index}>{formatDateTime(entry.at)} · {entry.actor?.name || 'Yandex'} · {LABEL[entry.action] || (entry.action === 'items' ? 'Состав' : entry.action)} · {({ started: 'начато', requested: 'запрошено', applied: 'выполнено', failed: 'не выполнено' })[entry.outcome] || entry.outcome}{entry.reason && ` · ${entry.reason}`}</li>)}</ul></Card>}
    </>}
    <Dialog open={Boolean(confirm)} closeDisabled={busy} onClose={closeConfirm} title={confirm?.kind === 'discard' ? 'Отменить несохранённые изменения?' : confirm?.kind === 'items' ? 'Сохранить состав Yandex' : `${LABEL[confirm?.action] || ''} заказ Yandex`} description={confirm?.kind === 'discard' ? 'Несохранённая сборка будет потеряна.' : description}>
      {confirm?.kind === 'discard' ? <div className="fh-dialog-actions fh-yandex-dialog"><Button onClick={closeConfirm}>Продолжить сборку</Button><Button variant="danger" onClick={() => { const proceed = confirm.proceed; closeConfirm(); proceed(); }}>Отменить изменения</Button></div> : <>
        <p>Версия решения: {confirm?.order.revision} · версия состава: {confirm?.order.itemsRevision}</p>
        {confirm?.action === 'reject' && <Field label="Причина отклонения" hint="Обязательно, до 300 символов."><textarea aria-label="Причина отклонения" className="fh-textarea" maxLength={300} disabled={busy} value={confirm.reason} onChange={(event) => setConfirm((value) => ({ ...value, reason: event.target.value.slice(0, 300) }))} /></Field>}
        <div className="fh-dialog-actions fh-yandex-dialog"><Button disabled={busy} onClick={closeConfirm}>Назад</Button><Button variant="primary" disabled={busy || (confirm?.action === 'reject' && !confirm.reason.trim())} onClick={submit}>{busy ? 'Обрабатываем…' : 'Подтвердить'}</Button></div>
      </>}
    </Dialog>
  </div>;
}
