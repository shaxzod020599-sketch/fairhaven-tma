import React, { useCallback, useEffect, useState } from 'react';
import { medicalkaApi } from '../../api/medicalka';
import { formatDateTime, formatMoney } from '../../lib/format';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { DataState } from '../../ui/DataState';
import { Dialog } from '../../ui/Dialog';
import { Pagination } from '../../ui/Pagination';
import { useToast } from '../../ui/ToastProvider';
import { MedicalkaSubOrders } from './MedicalkaSubOrders';

const LIMIT = 30;
const BUCKETS = [
  ['active', 'Kutilayotgan'],
  ['history', 'Tarix'],
  ['all', 'Hammasi'],
];

const STATUS = {
  pending: { label: 'Kutilmoqda', tone: 'warning' },
  accepted: { label: 'Tasdiqlandi', tone: 'success' },
  rejected: { label: 'Rad etildi', tone: 'danger' },
  cancelled: { label: 'Bekor qilindi', tone: 'neutral' },
};

function remaining(deadline, now) {
  const milliseconds = new Date(deadline).getTime() - now;
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return 'Medicalka oynasi tugagan';
  const seconds = Math.ceil(milliseconds / 1000);
  return `Medicalka oynasi: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function customerName(customer = {}) {
  return [customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'Ism ko‘rsatilmagan';
}

export function MedicalkaQueue({ api = medicalkaApi }) {
  const toast = useToast();
  const [bucket, setBucket] = useState('active');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [sync, setSync] = useState({ stale: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [view, setView] = useState('approvals');

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const response = await api.list({ bucket, page, limit: LIMIT });
      setRows(response.data || []);
      setTotal(response.meta?.total || 0);
      setSync(response.sync || { stale: false });
      setError('');
    } catch (err) {
      setError(err.message || 'Medicalka zayavkalari yuklanmadi');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [api, bucket, page]);

  useEffect(() => {
    if (view !== 'approvals') return undefined;
    load();
    const poll = window.setInterval(() => load({ silent: true }), 10_000);
    return () => window.clearInterval(poll);
  }, [load, view]);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  const decide = async () => {
    const current = confirm;
    if (!current) return;
    setSubmitting(true);
    try {
      const result = await api.respond(current.approval.id, {
        action: current.action,
        comment: current.comment.trim(),
      });
      const updated = result.approval;
      setRows((list) => list.map((row) => (row.id === updated.id ? updated : row)));
      setConfirm(null);
      toast?.success?.(current.action === 'accepted' ? 'Medicalka zayavka tasdiqlandi' : 'Medicalka zayavka rad etildi');
    } catch (err) {
      if (err.status === 409) await load({ silent: true });
      toast?.error?.(err.message || 'Medicalka qarori saqlanmadi');
    } finally {
      setSubmitting(false);
    }
  };

  if (view === 'suborders') {
    return (
      <section className="fh-medicalka-queue">
        <div className="fh-medicalka-queue__head">
          <div>
            <p className="fh-eyebrow">MEDICALKA · PAID SUB-ORDERS</p>
            <h2>Medicalka paid orderlari</h2>
            <p>Faqat paid sub-order Billz sotuv oqimiga kiradi. Mapping noaniq bo‘lsa avtomatik sotuv bloklanadi.</p>
          </div>
        </div>
        <div className="fh-order-sources">
          <button type="button" onClick={() => setView('approvals')}>Zayavkalar</button>
          <button type="button" className="is-active" onClick={() => setView('suborders')}>Paid orderlar</button>
        </div>
        <MedicalkaSubOrders api={api} />
      </section>
    );
  }

  return (
    <section className="fh-medicalka-queue">
      <div className="fh-medicalka-queue__head">
        <div>
          <p className="fh-eyebrow">MEDICALKA · PHARMACY APPROVALS</p>
          <h2>Medicalka zayavkalari</h2>
          <p>Tasdiqlash ostatkani kamaytirmaydi. Sotuv faqat paid sub-order kelganda yoziladi.</p>
        </div>
        <Button onClick={() => load()} disabled={loading}>Yangilash</Button>
      </div>

      <div className="fh-order-sources">
        <button type="button" className="is-active" onClick={() => setView('approvals')}>Zayavkalar</button>
        <button type="button" onClick={() => setView('suborders')}>Paid orderlar</button>
      </div>

      <div className="fh-toolbar">
        <div className="fh-tabs">
          {BUCKETS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={bucket === key ? 'is-active' : ''}
              onClick={() => { setBucket(key); setPage(1); }}
            >{label}</button>
          ))}
        </div>
        <small>{total} ta zayavka</small>
      </div>

      {(error || sync.stale) && rows.length > 0 && (
        <div className="fh-stale-note">
          Oldingi ma’lumot ko‘rsatilmoqda. Medicalka sync vaqtincha ishlamayapti.
        </div>
      )}
      {sync.enabled === false && (
        <div className="fh-stale-note">Medicalka inbound prod sozlamasi hali yoqilmagan.</div>
      )}

      {loading && rows.length === 0 ? (
        <div className="fh-page-skeleton"><span /><span /><span /></div>
      ) : error && rows.length === 0 ? (
        <DataState tone="error" title="Medicalka ulanmagan" message={error} actionLabel="Qayta urinish" onAction={load} />
      ) : rows.length === 0 ? (
        <DataState title="Medicalka navbati bo‘sh" message="Yangi zayavka kelganda shu yerda ko‘rinadi." />
      ) : (
        <div className="fh-medicalka-list">
          {rows.map((approval) => {
            const status = STATUS[approval.status] || { label: approval.status, tone: 'neutral' };
            return (
              <Card key={approval.id} className="fh-medicalka-card">
                <header>
                  <div>
                    <span className="fh-mono">#{approval.checkoutId}</span>
                    <h3>{customerName(approval.customer)}</h3>
                    <small>{approval.customer?.phone || 'Telefon yo‘q'} · {approval.deliveryType || 'delivery ko‘rsatilmagan'}</small>
                  </div>
                  <div className="fh-medicalka-card__status">
                    <Badge tone={status.tone}>{status.label}</Badge>
                    <small>{formatDateTime(approval.sourceCreatedAt)}</small>
                  </div>
                </header>

                <div className="fh-medicalka-items">
                  {(approval.items || []).map((item, index) => (
                    <div key={`${item.productId}-${index}`}>
                      <span><b>{item.name || item.externalName || item.productId}</b><small>{item.productId}</small></span>
                      <span>{item.quantity} × {formatMoney(item.unitPrice)}</span>
                      <strong>{formatMoney(item.lineTotal)}</strong>
                    </div>
                  ))}
                </div>

                <footer>
                  <div>
                    <small>{remaining(approval.deadlineAt, now)} · axborot uchun</small>
                    {approval.decision?.actorName && <span>Qaror: {approval.decision.actorName}</span>}
                    {approval.reconciliationRequired && <span>Medicalka javobi noaniq — tarix sync kutilmoqda</span>}
                  </div>
                  <strong>{formatMoney(approval.subtotal)}</strong>
                  {approval.status === 'pending' && approval.requiresAction && (
                    <div className="fh-order-actions">
                      <Button disabled={approval.inProgress || approval.reconciliationRequired} size="sm" variant="primary" onClick={() => setConfirm({ approval, action: 'accepted', comment: '' })}>Tasdiqlash</Button>
                      <Button disabled={approval.inProgress || approval.reconciliationRequired} size="sm" variant="danger" onClick={() => setConfirm({ approval, action: 'rejected', comment: '' })}>Rad etish</Button>
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
        open={Boolean(confirm)}
        title={confirm?.action === 'accepted' ? 'Medicalka zayavkani tasdiqlash' : 'Medicalka zayavkani rad etish'}
        description="Qaror Medicalka API orqali darhol yuboriladi. Billz ostatkasi bu bosqichda o‘zgarmaydi."
        onClose={() => !submitting && setConfirm(null)}
        closeDisabled={submitting}
        width="520px"
      >
        {confirm?.action === 'rejected' && (
          <label className="fh-medicalka-comment">
            <span>Izoh / Комментарий</span>
            <textarea
              aria-label="Izoh / Комментарий"
              className="fh-textarea"
              maxLength={500}
              value={confirm.comment}
              onChange={(event) => setConfirm((value) => ({ ...value, comment: event.target.value }))}
              placeholder="Ixtiyoriy, 500 belgigacha"
            />
            <small>{confirm.comment.length}/500</small>
          </label>
        )}
        <div className="fh-dialog-actions">
          <Button disabled={submitting} onClick={() => setConfirm(null)}>Bekor qilish</Button>
          <Button
            disabled={submitting}
            variant={confirm?.action === 'accepted' ? 'primary' : 'danger'}
            onClick={decide}
          >{confirm?.action === 'accepted' ? 'Ha, tasdiqlash' : 'Ha, rad etish'}</Button>
        </div>
      </Dialog>
    </section>
  );
}
