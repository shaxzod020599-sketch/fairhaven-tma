import React, { useCallback, useEffect, useState } from 'react';
import { formatDateTime, formatMoney } from '../../lib/format';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { DataState } from '../../ui/DataState';
import { Dialog } from '../../ui/Dialog';
import { Pagination } from '../../ui/Pagination';
import { useToast } from '../../ui/ToastProvider';

const LIMIT = 30;
const BUCKETS = [
  ['active', 'Jarayonda'],
  ['reconciliation', 'Tekshirish kerak'],
  ['history', 'Tarix'],
  ['all', 'Hammasi'],
];

function name(customer = {}) {
  return [customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'Mijoz';
}

function statusLabel(status) {
  return {
    processing: 'Tayyorlanmoqda', shipped: 'Kuryerga berildi',
    delivered: 'Yetkazildi', completed: 'Yakunlandi', cancelled: 'Bekor qilindi',
  }[status] || status;
}

function nextStatusAction(order) {
  if (order.deliveryType === 'delivery' && order.status === 'processing') {
    return { value: 'shipped', label: 'Kuryerga berildi' };
  }
  if (order.deliveryType === 'pickup' && ['processing', 'shipped'].includes(order.status)) {
    return { value: 'delivered', label: 'Mijozga berildi' };
  }
  if (order.deliveryType === 'pickup' && order.status === 'delivered') {
    return { value: 'completed', label: 'Yakunlash' };
  }
  return null;
}

export function MedicalkaSubOrders({ api }) {
  const toast = useToast();
  const [bucket, setBucket] = useState('active');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [sync, setSync] = useState({ stale: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [action, setAction] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const response = await api.listSubOrders({ bucket, page, limit: LIMIT });
      setRows(response.data || []);
      setTotal(response.meta?.total || 0);
      setSync(response.sync || { stale: false });
      setError('');
    } catch (err) {
      setError(err.message || 'Paid orderlar yuklanmadi');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [api, bucket, page]);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load({ silent: true }), 10_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const replace = (updated) => {
    setRows((current) => current.map((row) => (row.id === updated.id ? updated : row)));
  };

  const submit = async () => {
    if (!action) return;
    setSubmitting(true);
    try {
      let response;
      if (action.kind === 'status') {
        response = await api.transitionSubOrder(action.order.id, action.value);
      } else if (action.kind === 'cancel') {
        response = await api.cancelSubOrder(action.order.id, action.value.trim());
      } else {
        response = await api.addSubOrderLabel(action.order.id, {
          itemId: action.item.itemId, label: action.value,
        });
      }
      replace(response.data);
      setAction(null);
      toast?.success?.('Medicalka holati yangilandi');
    } catch (err) {
      if (err.status === 409) await load({ silent: true });
      toast?.error?.(err.message || 'Medicalka amali bajarilmadi');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="fh-medicalka-suborders">
      <div className="fh-toolbar">
        <div className="fh-tabs">
          {BUCKETS.map(([key, label]) => (
            <button key={key} type="button" className={bucket === key ? 'is-active' : ''} onClick={() => { setBucket(key); setPage(1); }}>{label}</button>
          ))}
        </div>
        <Button onClick={() => load()} disabled={loading}>Yangilash</Button>
      </div>

      {(error || sync.stale) && rows.length > 0 && (
        <div className="fh-stale-note">Oldingi paid orderlar ko‘rsatilmoqda. Sync vaqtincha ishlamayapti.</div>
      )}
      {sync.enabled === false && (
        <div className="fh-stale-note">Paid sub-order sync alohida prod flag bilan yoqiladi.</div>
      )}

      {loading && rows.length === 0 ? (
        <div className="fh-page-skeleton"><span /><span /><span /></div>
      ) : error && rows.length === 0 ? (
        <DataState tone="error" title="Paid orderlar mavjud emas" message={error} actionLabel="Qayta urinish" onAction={load} />
      ) : rows.length === 0 ? (
        <DataState title="Paid orderlar yo‘q" message="Mijoz to‘laganidan keyin sub-order shu yerda chiqadi." />
      ) : (
        <div className="fh-medicalka-list">
          {rows.map((order) => {
            const blocked = order.mapping?.state === 'reconciliation_required'
              || order.sale?.reconciliationRequired;
            const statusAction = nextStatusAction(order);
            return (
              <Card key={order.id} className="fh-medicalka-card fh-medicalka-suborder">
                <header>
                  <div>
                    <span className="fh-mono">{order.subOrderNumber || order.externalId}</span>
                    <h3>{name(order.customer)}</h3>
                    <small>{order.customer?.phone || 'Telefon yo‘q'} · {order.deliveryType}</small>
                  </div>
                  <div className="fh-medicalka-card__status">
                    <Badge tone={blocked ? 'danger' : 'success'}>{statusLabel(order.status)}</Badge>
                    <small>{formatDateTime(order.sourceCreatedAt)}</small>
                  </div>
                </header>

                {blocked && (
                  <div className="fh-medicalka-reconcile">
                    Product mapping tekshirilishi kerak: {(order.mapping?.missingProductIds || []).join(', ') || 'Billz refund/reconciliation'}
                  </div>
                )}

                <div className="fh-medicalka-items">
                  {(order.items || []).map((item) => (
                    <div key={item.itemId || item.productId}>
                      <span><b>{item.name || item.productId}</b><small>{item.itemId}</small></span>
                      <span>{item.quantity} dona</span>
                      <strong>{formatMoney(item.lineTotal)}</strong>
                      {order.deliveryType === 'delivery' && item.markingRequired && (
                        <div className="fh-medicalka-marking">
                          <small>Marka: {(item.labels || []).length}/{item.quantity}</small>
                          <Button size="sm" disabled={blocked || (item.labels || []).length >= item.quantity} onClick={() => setAction({ kind: 'label', order, item, value: '' })}>Marka qo‘shish</Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <footer>
                  <div>
                    <span>To‘lov: {order.paymentStatus}</span>
                    <span>Billz: {order.sale?.state === 'sold' ? 'sotildi' : order.sale?.state}</span>
                  </div>
                  <strong>{formatMoney(order.subtotal)}</strong>
                  {(statusAction || order.status === 'processing') && (
                    <div className="fh-order-actions">
                      {statusAction && (
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={blocked}
                          onClick={() => setAction({
                            kind: 'status', order, value: statusAction.value,
                          })}
                        >{statusAction.label}</Button>
                      )}
                      {order.status === 'processing' && (
                        <Button size="sm" variant="danger" disabled={blocked} onClick={() => setAction({ kind: 'cancel', order, value: '' })}>Bekor qilish</Button>
                      )}
                    </div>
                  )}
                </footer>
              </Card>
            );
          })}
        </div>
      )}

      <Pagination page={page} total={total} limit={LIMIT} onPage={setPage} />

      <Dialog
        open={Boolean(action)}
        title={action?.kind === 'label' ? 'Fiskal marka' : action?.kind === 'cancel' ? 'Sub-orderni bekor qilish' : 'Medicalka statusini yuborish'}
        description="Amal Medicalka API orqali bajariladi. Qaytarib bo‘lmaydigan statusni yuborishdan oldin tekshiring."
        onClose={() => !submitting && setAction(null)}
        closeDisabled={submitting}
        width="520px"
      >
        {action?.kind === 'label' && (
          <label className="fh-medicalka-comment">
            <span>DataMatrix</span>
            <textarea aria-label="DataMatrix" className="fh-textarea" value={action.value} onChange={(event) => setAction((value) => ({ ...value, value: event.target.value }))} />
          </label>
        )}
        {action?.kind === 'cancel' && (
          <label className="fh-medicalka-comment">
            <span>Sabab</span>
            <textarea aria-label="Bekor qilish sababi" className="fh-textarea" maxLength={500} value={action.value} onChange={(event) => setAction((value) => ({ ...value, value: event.target.value }))} />
          </label>
        )}
        <div className="fh-dialog-actions">
          <Button disabled={submitting} onClick={() => setAction(null)}>Orqaga</Button>
          <Button
            variant={action?.kind === 'cancel' ? 'danger' : 'primary'}
            disabled={submitting || (action?.kind === 'label' && (action?.value.length < 21 || action?.value.length > 500)) || (action?.kind === 'cancel' && !action?.value.trim())}
            onClick={submit}
          >{action?.kind === 'label' ? 'Markani yuborish' : action?.kind === 'cancel' ? 'Ha, bekor qilish' : 'Ha, yuborish'}</Button>
        </div>
      </Dialog>
    </section>
  );
}
