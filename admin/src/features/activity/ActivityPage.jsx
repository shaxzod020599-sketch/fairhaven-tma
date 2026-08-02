import React, { useCallback, useEffect, useState } from 'react';
import { activityApi } from '../../api/activity';
import { formatDateTime, formatNumber, shortId } from '../../lib/format';
import { activityLabel } from '../dashboard/DashboardPage';
import { AdminLink } from '../../app/route';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { DataState } from '../../ui/DataState';
import { Dialog } from '../../ui/Dialog';
import { Field } from '../../ui/Field';
import { Pagination } from '../../ui/Pagination';
import { useToast } from '../../ui/ToastProvider';

const LIMIT = 30;

const SEGMENTS = [
  ['all', 'Все клиенты', 'Все зарегистрированные, кто не отключил уведомления.'],
  ['recent30', 'Покупали за 30 дней', 'Тёплая аудитория — недавние покупатели.'],
  ['inactive90', 'Молчат 90 дней', 'Давно не заказывали. Хороший повод напомнить.'],
];

const BROADCAST_STATUS = {
  draft: { label: 'Черновик', tone: 'neutral' },
  tested: { label: 'Тест отправлен', tone: 'warning' },
  sending: { label: 'Отправляется…', tone: 'burgundy' },
  completed: { label: 'Завершена', tone: 'success' },
  failed: { label: 'Ошибка', tone: 'danger' },
};

function summaryLine(entry) {
  const s = entry.summary;
  if (!s) return '';
  if (entry.action === 'order.transition') return [s.from, '→', s.to, s.reason ? `· ${s.reason}` : ''].join(' ');
  if (entry.action === 'product.price') return `${s.name}: ${formatNumber(s.price?.old)} → ${formatNumber(s.price?.new)} сум`;
  if (entry.action === 'product.delete') return s.name;
  if (entry.action === 'broadcast.send') return `сегмент «${s.segment}», получателей: ${s.targets}`;
  if (entry.action === 'excel.apply') return `создано ${s.created}, обновлено ${s.updated}`;
  if (entry.action === 'keys.pair') return s.label;
  if (s.name) return s.name;
  return '';
}

function BroadcastComposer({ api, onDone }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [segment, setSegment] = useState('all');
  const [text, setText] = useState('');
  const [count, setCount] = useState(null);
  const [draft, setDraft] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) { setSegment('all'); setText(''); setDraft(null); setConfirming(false); setCount(null); }
  }, [open]);

  useEffect(() => {
    let live = true;
    api.previewSegment(segment)
      .then((response) => live && setCount(response.data.count))
      .catch(() => live && setCount(null));
    return () => { live = false; };
  }, [api, segment]);

  const createDraft = async () => {
    setBusy(true);
    try {
      const response = await api.createBroadcast({ segment, text: text.trim() });
      setDraft(response.data);
      toast?.success?.('Черновик создан. Теперь отправьте тест себе.');
    } catch (err) {
      toast?.error?.(err.message || 'Не удалось создать рассылку');
    } finally { setBusy(false); }
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      const response = await api.testBroadcast(draft._id);
      setDraft(response.data);
      toast?.success?.('Тест отправлен вам в Telegram. Проверьте, как выглядит сообщение.');
    } catch (err) {
      toast?.error?.(err.message === 'bot_unavailable' ? 'Бот недоступен' : err.message);
    } finally { setBusy(false); }
  };

  const send = async () => {
    setBusy(true);
    try {
      await api.sendBroadcast(draft._id);
      setConfirming(false);
      setOpen(false);
      toast?.success?.('Рассылка запущена. Прогресс виден в списке ниже.');
      onDone?.();
    } catch (err) {
      toast?.error?.(err.message || 'Рассылка не запущена');
    } finally { setBusy(false); }
  };

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>Новая рассылка</Button>
      <Dialog open={open} title="Рассылка клиентам" description="Три шага: текст → тест себе → подтверждение. Без теста отправка невозможна." onClose={() => !busy && setOpen(false)} width="680px">
        <div className="fh-wizard">
          <Field label="Кому отправить">
            <div className="fh-segment-picker" role="radiogroup" aria-label="Сегмент">
              {SEGMENTS.map(([key, label, hint]) => (
                <label key={key} className={`fh-segment ${segment === key ? 'is-active' : ''}`}>
                  <input type="radio" name="segment" checked={segment === key} disabled={Boolean(draft)} onChange={() => setSegment(key)} />
                  <span><b>{label}</b><small>{hint}</small></span>
                </label>
              ))}
            </div>
          </Field>
          <p className="fh-segment-count">{count == null ? 'Считаем получателей…' : `Получателей: ${formatNumber(count)}`}</p>
          <Field label="Текст сообщения" hint="Поддерживается HTML-разметка Telegram: <b>жирный</b>, <i>курсив</i>.">
            <textarea className="fh-textarea" rows="5" value={text} disabled={Boolean(draft)} onChange={(event) => setText(event.target.value)} placeholder="Здравствуйте! У нас новое поступление витаминов…" />
          </Field>

          {!draft && (
            <div className="fh-dialog-actions">
              <Button onClick={() => setOpen(false)}>Отмена</Button>
              <Button variant="primary" disabled={busy || text.trim().length < 5} onClick={createDraft}>Продолжить</Button>
            </div>
          )}

          {draft && (
            <div className="fh-broadcast-steps">
              <div className={`fh-broadcast-step ${draft.status !== 'draft' ? 'is-done' : ''}`}>
                <span>1</span>
                <div>
                  <b>Отправьте тест себе</b>
                  <small>Сообщение придёт только вам. Убедитесь, что всё выглядит правильно.</small>
                </div>
                <Button size="sm" disabled={busy} onClick={sendTest}>{draft.status === 'draft' ? 'Тест мне' : 'Ещё раз'}</Button>
              </div>
              <div className={`fh-broadcast-step ${draft.status === 'draft' ? 'is-locked' : ''}`}>
                <span>2</span>
                <div>
                  <b>Запустите рассылку</b>
                  <small>{draft.status === 'draft' ? 'Откроется после теста.' : `Уйдёт ${formatNumber(draft.counts?.targets || 0)} клиентам. Остановить нельзя.`}</small>
                </div>
                <Button size="sm" variant="danger" disabled={busy || draft.status === 'draft'} onClick={() => setConfirming(true)}>Запустить</Button>
              </div>
            </div>
          )}
        </div>
      </Dialog>

      <Dialog open={confirming} title="Запустить рассылку?" description={`Сообщение получат ${formatNumber(draft?.counts?.targets || 0)} клиентов. Действие необратимо.`} onClose={() => setConfirming(false)} width="480px">
        <div className="fh-dialog-actions">
          <Button onClick={() => setConfirming(false)}>Отмена</Button>
          <Button variant="danger" disabled={busy} onClick={send}>Да, отправить всем</Button>
        </div>
      </Dialog>
    </>
  );
}

export function ActivityPage({ api = activityApi }) {
  const [tab, setTab] = useState('log');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [broadcasts, setBroadcasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [log, sends] = await Promise.all([
        api.list({ page, limit: LIMIT }),
        api.broadcasts(),
      ]);
      setRows(log.data || []);
      setTotal(log.meta?.total || 0);
      setBroadcasts(sends.data || []);
      setError('');
    } catch (err) {
      setError(err.message || 'История недоступна');
    } finally {
      setLoading(false);
    }
  }, [api, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!broadcasts.some((b) => b.status === 'sending')) return undefined;
    const poll = window.setInterval(async () => {
      try { const response = await api.broadcasts(); setBroadcasts(response.data || []); } catch (_) { /* keep last */ }
    }, 4000);
    return () => window.clearInterval(poll);
  }, [api, broadcasts]);

  return (
    <div className="fh-page fh-activity">
      <header className="fh-page-head">
        <div><p className="fh-eyebrow">КОМАНДА И КОММУНИКАЦИЯ</p><h1>История</h1><p>Журнал действий администраторов и рассылки клиентам.</p></div>
        <BroadcastComposer api={api} onDone={load} />
      </header>

      <div className="fh-tabs" data-print-hide>
        <button type="button" className={tab === 'log' ? 'is-active' : ''} onClick={() => setTab('log')}>Журнал действий</button>
        <button type="button" className={tab === 'broadcasts' ? 'is-active' : ''} onClick={() => setTab('broadcasts')}>Рассылки</button>
      </div>

      {loading && rows.length === 0 ? <div className="fh-page-skeleton"><span /><span /></div>
        : error && rows.length === 0 ? <DataState tone="error" title="История недоступна" message={error} actionLabel="Повторить" onAction={load} />
          : tab === 'log' ? (
            rows.length === 0 ? <DataState title="Журнал пуст" message="Здесь появятся смены статусов, изменения цен и другие важные действия." /> : (
              <>
                <div className="fh-audit-table">
                  {rows.map((entry) => (
                    <div key={entry._id} className="fh-audit-row">
                      <span className="fh-audit-row__when">{formatDateTime(entry.createdAt)}</span>
                      <span className="fh-audit-row__who">{entry.admin?.name || '—'}</span>
                      <span className="fh-audit-row__what">
                        <b>{activityLabel(entry.action)}</b>
                        <small>{summaryLine(entry)}</small>
                      </span>
                      {entry.entityType === 'order' && entry.entityId
                        ? <AdminLink className="fh-mono" to={`/orders/${entry.entityId}`}>#{shortId(entry.entityId)}</AdminLink>
                        : <span />}
                    </div>
                  ))}
                </div>
                <Pagination page={page} total={total} limit={LIMIT} onPage={setPage} />
              </>
            )
          ) : (
            broadcasts.length === 0 ? <DataState title="Рассылок ещё не было" message="Создайте первую — кнопка «Новая рассылка» вверху." /> : (
              <div className="fh-broadcast-list">
                {broadcasts.map((broadcast) => {
                  const meta = BROADCAST_STATUS[broadcast.status] || BROADCAST_STATUS.draft;
                  const segmentLabel = SEGMENTS.find(([key]) => key === broadcast.segment)?.[1] || broadcast.segment;
                  return (
                    <Card key={broadcast._id} className="fh-broadcast-card">
                      <div className="fh-broadcast-card__head">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        <small>{formatDateTime(broadcast.createdAt)} · {broadcast.createdBy?.name || '—'} · {segmentLabel}</small>
                      </div>
                      <p>{broadcast.text}</p>
                      <div className="fh-broadcast-card__counts fh-mono">
                        <span>цель {formatNumber(broadcast.counts?.targets || 0)}</span>
                        <span>отправлено {formatNumber(broadcast.counts?.sent || 0)}</span>
                        {broadcast.counts?.failed > 0 && <span className="is-bad">ошибки {broadcast.counts.failed}</span>}
                        {broadcast.counts?.skipped > 0 && <span>пропущено {broadcast.counts.skipped}</span>}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )
          )}
    </div>
  );
}
