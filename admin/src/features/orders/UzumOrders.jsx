import React, { useCallback, useEffect, useRef, useState } from 'react';
import { uzumApi } from '../../api/uzum';
import { formatDateTime, formatMoney } from '../../lib/format';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Dialog } from '../../ui/Dialog';
import { DataState } from '../../ui/DataState';
import { Field } from '../../ui/Field';
import { Pagination } from '../../ui/Pagination';
const LABEL = { accept: 'Принять', ready: 'Готов', reject: 'Отклонить' };
const STATUS = { NEW: 'Новый', ACCEPTED_BY_RESTAURANT: 'Принят', READY: 'Готов', CANCELLED: 'Отменён' };
const ERROR = {
  uzum_acceptance_expired: 'Срок принятия истёк. Проверьте отмену в Uzum.',
  uzum_reconciliation_required: 'Нужна сверка учёта. Повторная продажа или отмена недоступна.',
  uzum_unavailable: 'Товара уже нет в наличии.',
  uzum_disabled: 'Uzum отключён. Действия недоступны.',
  uzum_operation_in_progress: 'Решение уже обрабатывается. Обновите заказ.',
  uzum_cancellation_pending: 'Отмена ожидает завершения текущей операции.',
  uzum_cancelled: 'Заказ уже отменён.',
};
export function UzumOrders({ api = uzumApi }) {
  const [rows, setRows] = useState([]); const [enabled, setEnabled] = useState(false);
  const [bucket, setBucket] = useState('active'); const [page, setPage] = useState(1); const [total, setTotal] = useState(0);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null); const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const generation = useRef(0);
  const load = useCallback(async () => {
    const request = ++generation.current;
    try {
      const result = await api.list({ bucket, page, limit: 30 });
      if (request !== generation.current) return;
      setRows(result.data || []); setEnabled(result.enabled === true); setTotal(result.meta?.total || 0); setError('');
    } catch (err) { if (request === generation.current) setError(ERROR[err.code] || err.message || 'Заказы Uzum недоступны'); }
    finally { if (request === generation.current) setLoading(false); }
  }, [api, bucket, page]);
  useEffect(() => { load(); const timer = window.setInterval(load, 10_000); return () => { generation.current += 1; window.clearInterval(timer); }; }, [load]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const decide = async () => {
    setBusy(true);
    generation.current += 1;
    try {
      const result = await api.decide(confirm.order.id, { action: confirm.action, reason: confirm.reason.trim() });
      generation.current += 1;
      setRows((current) => current.map((row) => row.id === result.order.id ? result.order : row));
      setConfirm(null); setError('');
    } catch (err) {
      await load(); setError(ERROR[err.code] || err.message || 'Решение не подтверждено'); setConfirm(null);
    } finally { setBusy(false); }
  };
  return <section aria-label="Заказы Uzum">
    <div className="fh-toolbar">
      <div className="fh-tabs">{[['active', 'Требуют внимания'], ['history', 'История'], ['all', 'Все']].map(([value, label]) => <button type="button" key={value} className={bucket === value ? 'is-active' : ''} onClick={() => { setBucket(value); setPage(1); }}>{label}</button>)}</div>
      <Button onClick={load}>Обновить Uzum</Button>
    </div>
    <p>Примите заказ в течение 15 минут. После сборки нажмите «Готов». Передачу курьеру и доставку отмечает Uzum.</p>
    {!loading && !enabled && <div className="fh-stale-note">Uzum отключён. История доступна, действия недоступны.</div>}
    {error && <div className="fh-stale-note" role="alert">{error}</div>}
    {loading ? <DataState title="Загружаем заказы Uzum" /> : rows.length === 0 ? <DataState title="Заказов Uzum пока нет" /> : <div className="fh-order-list">{rows.map((row) => {
      const seconds = Math.max(0, Math.ceil((new Date(row.deadlineAt).getTime() - now) / 1000));
      const actions = enabled && !error ? (row.actions || []).filter((action) => LABEL[action] && (action !== 'accept' || seconds > 0)) : [];
      return <Card key={row.id} className="fh-order-row">
        <div className="fh-order-row__open">
          <span className="fh-mono">{row.externalId}</span><Badge tone={row.reconciliationRequired ? 'danger' : 'neutral'}>{STATUS[row.status] || row.status}</Badge>
          <strong>{formatMoney(row.totalAmount)}</strong>
          <span>{formatDateTime(row.createdAt)}</span>
        </div>
        <p>Принять до {formatDateTime(row.deadlineAt)} · {row.status === 'NEW' ? seconds > 0 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : 'Срок принятия истёк' : STATUS[row.status]}</p>
        {row.reconciliationRequired && <p role="status">Нужна сверка учёта. Продажа и отмена заблокированы до проверки.</p>}
        {row.cancellationPending && <p>Отмена ожидает обработки.</p>}
        {row.inProgress && <p>Решение обрабатывается…</p>}
        <details><summary>Состав и история решения</summary>
          <p>{row.customer?.name} {row.customer?.phone}</p>
          <ul>{(row.items || []).map((item, index) => <li key={`${item.billzProductId}-${index}`}>{item.name || item.billzProductId} × {item.quantity} — {formatMoney(item.unitPrice)}</li>)}</ul>
          {(row.audit || []).length > 0 && <ul>{row.audit.map((entry, index) => <li key={index}>{formatDateTime(entry.at)} · {entry.actor?.name || 'Uzum'} · {LABEL[entry.action] || entry.action} · {({ started: 'начато', requested: 'запрошено', applied: 'выполнено', failed: 'не выполнено' })[entry.outcome] || entry.outcome}</li>)}</ul>}
        </details>
        <div className="fh-order-actions">{actions.map((action) => <Button key={action} disabled={busy} variant={action === 'reject' ? 'danger' : 'primary'} onClick={() => setConfirm({ order: row, action, reason: '' })}>{LABEL[action]}</Button>)}</div>
      </Card>;
    })}</div>}
    <Pagination page={page} total={total} limit={30} onPage={setPage} />
    <Dialog open={Boolean(confirm)} title={`${LABEL[confirm?.action] || ''} заказ Uzum`} description={confirm?.action === 'ready' ? 'Подтверждение завершит продажу в Billz. Убедитесь, что заказ собран.' : confirm?.action === 'accept' ? 'Подтверждение зарезервирует товары в Billz.' : 'Отмена освободит резерв. Проданный заказ требует сверки учёта.'} onClose={() => !busy && setConfirm(null)}>
      {confirm?.action === 'reject' && <Field label="Причина отклонения"><textarea className="fh-textarea" maxLength={300} value={confirm.reason} onChange={(event) => setConfirm((current) => ({ ...current, reason: event.target.value }))} /></Field>}
      <div className="fh-dialog-actions"><Button disabled={busy} onClick={() => setConfirm(null)}>Назад</Button><Button disabled={busy || (confirm?.action === 'reject' && !confirm.reason.trim())} variant="primary" onClick={decide}>{busy ? 'Обрабатываем…' : 'Подтвердить'}</Button></div>
    </Dialog>
  </section>;
}
