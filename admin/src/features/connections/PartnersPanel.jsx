import React, { useCallback, useEffect, useRef, useState } from 'react';
import { partnersApi } from '../../api/partners';
import { formatDateTime, formatMoney } from '../../lib/format';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Dialog } from '../../ui/Dialog';
import { Field } from '../../ui/Field';
import { useToast } from '../../ui/ToastProvider';

/**
 * Партнёры по API FairHaven — любой сервис, которому мы отдаём каталог,
 * остатки и принимаем от него заказы по одному общему договору (Partner API).
 *
 * Новый партнёр — это запись здесь, а не новая программа: код, ключи, режим.
 * Цена и «показывать партнёрам» общие для всех и задаются на странице «Товары»
 * в строке «Партнёры (API)».
 */

export const MODE = {
  test: { label: 'Тест', tone: 'warning', hint: 'Заказы проверочные: склад и Billz не трогаются, решение приходит само.' },
  live: { label: 'Работает', tone: 'success', hint: 'Настоящие заказы: товар бронируется, оператор принимает в Telegram.' },
  off: { label: 'Выключен', tone: 'danger', hint: 'Партнёр не может ни читать каталог, ни отправлять заказы.' },
};

const STATUS = {
  new: ['Ждёт решения', 'warning'],
  accepted: ['Принят', 'success'],
  completed: ['Выполнен', 'success'],
  rejected: ['Отклонён', 'neutral'],
  cancelled: ['Отменён', 'neutral'],
};

const ERRORS = {
  partner_code_taken: 'Такой код уже занят — придумайте другой.',
  partner_invalid_code: 'Код: латинские буквы, цифры и дефис, от 3 до 24 символов, начинается с буквы.',
  partner_invalid_name: 'Введите название партнёра.',
  partner_encryption_unavailable: 'На сервере не настроен ключ шифрования — без него секреты партнёра сохранить нельзя.',
  webhook_url_invalid: 'Адрес вебхука указан неверно.',
  webhook_url_not_https: 'Адрес вебхука должен начинаться с https://',
  webhook_url_has_credentials: 'Адрес вебхука не должен содержать логин и пароль.',
  webhook_url_too_long: 'Адрес вебхука слишком длинный.',
  invalid_status: 'Заказ уже закрыт — обновите список.',
  order_busy: 'Заказ сейчас обрабатывается — повторите через минуту.',
  test_order: 'Проверочный заказ решается сам — вручную его не трогают.',
  billz_writes_disabled: 'Запись в Billz выключена на сервере — принять заказ сейчас нельзя.',
  billz_unavailable: 'Billz не ответил. Повторите через минуту.',
  billz_uncertain: 'Billz ответил неясно. Проверьте бронь в Billz перед повтором.',
  channel_hub_unreachable: 'Сервис каналов недоступен.',
};

export function partnerError(err) {
  return ERRORS[err?.code] || err?.message || 'Не удалось выполнить действие.';
}

function useMounted() {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  return mounted;
}

function SecretBoxes({ items }) {
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  const copy = async (item) => {
    try {
      await navigator.clipboard.writeText(item.value);
      setCopied(item.label);
      setError('');
    } catch (_) { setError('Не удалось скопировать — выделите значение и скопируйте вручную.'); }
  };
  return <>
    <div className="fh-key-grid">
      {items.map((item) => <div className="fh-key-box" key={item.label}>
        <span>{item.label}</span>
        <code className="fh-key-box__value">{item.value}</code>
        {item.hint && <small>{item.hint}</small>}
        <Button size="sm" onClick={() => copy(item)}>Скопировать</Button>
      </div>)}
    </div>
    {copied && <p role="status">{copied} — скопировано</p>}
    {error && <div className="fh-error-note" role="alert">{error}</div>}
  </>;
}

function keyItems(keys, webhookSecret) {
  return [
    keys?.token && { label: 'Ключ для чтения (token)', value: keys.token, hint: 'Каталог, остатки, статусы заказов.' },
    keys?.secret && { label: 'Ключ для заказов (secret)', value: keys.secret, hint: 'Создание, отмена и завершение заказов.' },
    webhookSecret && { label: 'Секрет вебхуков', value: webhookSecret, hint: 'Проверка подписи наших уведомлений.' },
  ].filter(Boolean);
}

// Mounted only while open, so the one-time secrets disappear with the window.
function CreatePartnerDialog({ api, onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', code: '', decisionMinutes: 5, webhookUrl: '' });
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useMounted();

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await api.create({
        name: form.name.trim(),
        code: form.code.trim().toLowerCase(),
        decisionMinutes: Number(form.decisionMinutes) || 5,
        ...(form.webhookUrl.trim() ? { webhookUrl: form.webhookUrl.trim() } : {}),
      });
      if (!mounted.current) return;
      const data = response?.data;
      if (!data?.keys?.token || !data?.keys?.secret) throw new Error('Неполный ответ сервера. Обновите список: если партнёр появился, выпустите ему новые ключи.');
      setCreated(data);
      onSaved();
    } catch (err) {
      if (mounted.current) setError(partnerError(err));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const valid = form.name.trim() && /^[a-z][a-z0-9-]{2,23}$/.test(form.code.trim().toLowerCase());

  return (
    <Dialog
      open
      title={created ? `Партнёр «${created.partner?.name}» добавлен` : 'Добавить партнёра'}
      description={created
        ? 'Ключи показываются только сейчас. Передайте их партнёру вместе с документацией по защищённому каналу.'
        : 'Партнёр сразу получает тестовый режим: может читать каталог и отправлять проверочные заказы, склад не трогается.'}
      onClose={() => !busy && onClose()}
      closeDisabled={busy}
      width="680px"
    >
      {created ? <>
        <div className="fh-secret-warning">Сохраните ключи сейчас — после закрытия окна их не будет видно. Потеряли — выпустите новые.</div>
        <SecretBoxes items={keyItems(created.keys, created.webhookSecret)} />
        <div className="fh-next-note"><b>Что дальше</b><p>
          Адрес API: <span className="fh-mono">https://api.fairhaven.uz/partner/v1</span>. Отправьте партнёру ключи и документацию
          (docs/integrations). Когда тестовые заказы у него проходят — переключите режим на «Работает».
        </p></div>
      </> : <div className="fh-form-stack">
        <Field label="Название" hint="Как партнёр будет подписан в Telegram и в панели.">
          <input className="fh-input" maxLength={80} disabled={busy} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Код" hint="Латиница, цифры и дефис. Нельзя поменять потом. Например: apteka24">
          <input className="fh-input fh-mono" maxLength={24} disabled={busy} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase() })} />
        </Field>
        <Field label="Минут на решение" hint="Если оператор не ответил за это время, заказ отклоняется сам и бронь снимается.">
          <input className="fh-input" type="number" min={1} max={60} disabled={busy} value={form.decisionMinutes} onChange={(e) => setForm({ ...form, decisionMinutes: e.target.value })} />
        </Field>
        <Field label="Адрес вебхука (необязательно)" hint="Куда сообщать партнёру о смене статуса заказа. Только https://">
          <input className="fh-input fh-mono" maxLength={500} disabled={busy} value={form.webhookUrl} onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })} placeholder="https://partner.example/fairhaven/webhook" />
        </Field>
      </div>}
      {error && <div className="fh-error-note" role="alert">{error}</div>}
      <div className="fh-dialog-actions">
        <Button disabled={busy} onClick={onClose}>{created ? 'Закрыть окно' : 'Отмена'}</Button>
        {!created && <Button variant="primary" disabled={busy || !valid} onClick={save}>{busy ? 'Создаём…' : 'Добавить и выпустить ключи'}</Button>}
      </div>
    </Dialog>
  );
}

function OrderRow({ order, busy, onAct }) {
  const [label, tone] = STATUS[order.status] || [order.status, 'neutral'];
  return (
    <div className="fh-partner-order">
      <div>
        <b>№{order.id} · {order.order_id}</b>
        <small>{formatDateTime(order.created_at)} · {order.items?.map((i) => `${i.name} × ${i.quantity}`).join(', ')}</small>
        {order.decidedBy && <small>Решил: {order.decidedBy}</small>}
        {order.needsReconciliation && <small className="is-error">Нужно сверить с Billz</small>}
      </div>
      <span>{formatMoney(order.total)}</span>
      <span>{order.test && <Badge tone="warning">Тест</Badge>} <Badge tone={tone}>{label}</Badge></span>
      <span className="fh-partner-order__actions">
        {!order.test && order.status === 'new' && <>
          <Button size="sm" variant="primary" disabled={busy} onClick={() => onAct(order, 'accept')}>Принять</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAct(order, 'reject')}>Отклонить</Button>
        </>}
        {!order.test && order.status === 'accepted' && <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAct(order, 'cancel')}>Отменить</Button>}
      </span>
    </div>
  );
}

const ACT_CONFIRM = {
  accept: 'Принять заказ? Товар забронируется в Billz.',
  reject: 'Отклонить заказ? Бронь снимется, партнёр получит отказ.',
  cancel: 'Отменить принятый заказ? Бронь в Billz снимется, партнёр получит отмену.',
};

function PartnerDialog({ partner, api, onClose, onSaved }) {
  const toast = useToast();
  const mounted = useMounted();
  const [form, setForm] = useState({
    name: partner.name,
    decisionMinutes: partner.decisionMinutes,
    webhookUrl: partner.webhookUrl,
    note: partner.note,
    billzSecret: '',
    billzPaymentTypeId: partner.billz?.paymentTypeId || '',
    billzPaymentTypeName: partner.billz?.paymentTypeName || '',
  });
  const [confirm, setConfirm] = useState(null);
  const [shown, setShown] = useState(null);
  const [orders, setOrders] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadOrders = useCallback(async () => {
    try {
      const response = await api.orders(partner.code);
      if (mounted.current) setOrders(Array.isArray(response?.data?.orders) ? response.data.orders : []);
    } catch (err) { if (mounted.current) { setOrders([]); setError(partnerError(err)); } }
  }, [api, partner.code, mounted]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const run = async (work, done) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await work();
      if (!mounted.current) return;
      setConfirm(null);
      if (done) await done(response);
    } catch (err) {
      if (mounted.current) { setConfirm(null); setError(partnerError(err)); }
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const update = (body, message, after) => run(() => api.update(partner.code, body), () => {
    toast?.success?.(message);
    after?.();
    onSaved();
  });

  const saveSettings = () => update({
    name: form.name.trim(),
    decisionMinutes: Number(form.decisionMinutes) || 5,
    webhookUrl: form.webhookUrl.trim(),
    note: form.note,
  }, 'Настройки партнёра сохранены');

  const saveBillz = () => update({
    ...(form.billzSecret.trim() ? { billzSecret: form.billzSecret.trim() } : {}),
    billzPaymentTypeId: form.billzPaymentTypeId.trim(),
    billzPaymentTypeName: form.billzPaymentTypeName.trim(),
  }, 'Настройки Billz сохранены', () => setForm((f) => ({ ...f, billzSecret: '' })));

  const confirmed = () => {
    if (!confirm) return undefined;
    if (confirm.type === 'mode') return update({ mode: confirm.mode }, `Режим: ${MODE[confirm.mode].label}`);
    if (confirm.type === 'keys') {
      return run(() => api.issueKeys(partner.code), (response) => {
        setShown({ title: 'Новые ключи', items: keyItems(response?.data?.keys) });
        onSaved();
      });
    }
    if (confirm.type === 'webhook-rotate') {
      return run(() => api.rotateWebhookSecret(partner.code), (response) => {
        setShown({ title: 'Новый секрет вебхуков', items: keyItems(null, response?.data?.secret) });
      });
    }
    if (confirm.type === 'billz-remove') {
      return update({ billzSecret: '' }, 'Свой ключ Billz удалён — заказы идут под общим ключом');
    }
    if (confirm.type === 'order') {
      const { order, action } = confirm;
      return run(
        () => (action === 'cancel' ? api.cancel(order._id) : api.decide(order._id, action)),
        () => { toast?.success?.('Готово'); loadOrders(); onSaved(); },
      );
    }
    return undefined;
  };

  const showWebhookSecret = () => run(() => api.webhookSecret(partner.code), (response) => {
    setShown({ title: 'Секрет вебхуков', items: keyItems(null, response?.data?.secret) });
  });
  const testWebhook = () => run(() => api.testWebhook(partner.code), (response) => {
    const result = response?.data;
    if (result?.delivered) toast?.success?.(`Вебхук доставлен (ответ ${result.status_code})`);
    else setError(`Вебхук не доставлен${result?.status_code ? ` (ответ ${result.status_code})` : ''}${result?.error ? `: ${result.error}` : ''}`);
  });

  const confirmText = confirm && ({
    mode: confirm.mode === 'live'
      ? 'Включить настоящие заказы? Каждый новый заказ будет бронировать товар и ждать решения оператора в Telegram.'
      : confirm.mode === 'off'
        ? 'Выключить партнёра? Он сразу потеряет доступ к каталогу и заказам. Уже принятые заказы останутся.'
        : 'Вернуть тестовый режим? Новые заказы будут проверочными и не тронут склад.',
    keys: 'Выпустить новые ключи? Старые перестанут работать сразу — партнёру нужно будет заменить их у себя.',
    'webhook-rotate': 'Заменить секрет вебхуков? Партнёр должен обновить его у себя, иначе перестанет доверять нашим уведомлениям.',
    'billz-remove': 'Удалить свой ключ Billz партнёра? Продажи пойдут под общим ключом магазина.',
    order: ACT_CONFIRM[confirm.action],
  })[confirm.type];

  return (
    <Dialog open title={`${partner.name} · ${partner.code}`} description={MODE[partner.mode]?.hint} onClose={() => !busy && onClose()} closeDisabled={busy} width="860px">
      <div className="fh-form-stack">
        <section className="fh-partner-section">
          <h3>Режим</h3>
          <div className="fh-partner-modes">
            {Object.entries(MODE).map(([mode, def]) => (
              <Button key={mode} size="sm" variant={partner.mode === mode ? 'primary' : 'secondary'} disabled={busy || partner.mode === mode}
                onClick={() => setConfirm({ type: 'mode', mode })}>{def.label}</Button>
            ))}
          </div>
        </section>

        {confirm && <div className="fh-info-note" role="alertdialog">
          <p>{confirmText}</p>
          <div className="fh-dialog-actions">
            <Button disabled={busy} onClick={() => setConfirm(null)}>Отмена</Button>
            <Button variant={confirm.type === 'mode' && confirm.mode === 'live' ? 'primary' : 'danger'} disabled={busy} onClick={confirmed}>{busy ? 'Выполняем…' : 'Да, подтверждаю'}</Button>
          </div>
        </div>}

        {shown && <div className="fh-form-stack">
          <div className="fh-secret-warning">{shown.title}: сохраните сейчас — после закрытия окна значение не будет видно.</div>
          <SecretBoxes items={shown.items} />
          <div><Button size="sm" onClick={() => setShown(null)}>Скрыть</Button></div>
        </div>}

        {error && <div className="fh-error-note" role="alert">{error}</div>}

        <section className="fh-partner-section">
          <h3>Заказы</h3>
          {orders === null ? <p>Загружаем…</p> : orders.length === 0 ? <p>Заказов пока нет.</p>
            : orders.map((order) => <OrderRow key={order._id} order={order} busy={busy} onAct={(o, action) => setConfirm({ type: 'order', order: o, action })} />)}
          <div><Button size="sm" variant="ghost" disabled={busy} onClick={loadOrders}>Обновить заказы</Button></div>
        </section>

        <section className="fh-partner-section">
          <h3>Настройки</h3>
          <div className="fh-partner-fields">
            <Field label="Название"><input className="fh-input" maxLength={80} disabled={busy} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Минут на решение" hint="Без ответа заказ отклоняется сам."><input className="fh-input" type="number" min={1} max={60} disabled={busy} value={form.decisionMinutes} onChange={(e) => setForm({ ...form, decisionMinutes: e.target.value })} /></Field>
            <Field label="Адрес вебхука" hint="Пусто — уведомления не отправляются."><input className="fh-input fh-mono" maxLength={500} disabled={busy} value={form.webhookUrl} onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })} /></Field>
            <Field label="Заметка"><input className="fh-input" maxLength={500} disabled={busy} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
          </div>
          <div><Button variant="primary" disabled={busy || !form.name.trim()} onClick={saveSettings}>Сохранить настройки</Button></div>
        </section>

        <section className="fh-partner-section">
          <h3>Доступ</h3>
          {partner.keys?.length
            ? partner.keys.map((key) => <p key={key.fingerprint} className="fh-partner-key">
              <b>{key.kind === 'secret' ? 'Ключ для заказов' : 'Ключ для чтения'}</b> <span className="fh-mono">{key.fingerprint}</span>{' '}
              <small>{key.lastUsedAt ? `использован ${formatDateTime(key.lastUsedAt)}` : 'ещё не использовался'}</small>
            </p>)
            : <p>Действующих ключей нет.</p>}
          <div className="fh-partner-modes">
            <Button size="sm" disabled={busy} onClick={() => setConfirm({ type: 'keys' })}>Выпустить новые ключи</Button>
            <Button size="sm" disabled={busy} onClick={showWebhookSecret}>Показать секрет вебхуков</Button>
            <Button size="sm" disabled={busy} onClick={() => setConfirm({ type: 'webhook-rotate' })}>Заменить секрет вебхуков</Button>
            <Button size="sm" disabled={busy || !partner.webhookUrl} onClick={testWebhook}>Проверить вебхук</Button>
          </div>
        </section>

        <section className="fh-partner-section">
          <h3>Billz</h3>
          <p>По умолчанию продажи партнёра идут под общим ключом магазина. Можно дать партнёру свой ключ и тип оплаты — тогда в Billz его продажи видны отдельно.</p>
          <div className="fh-partner-fields">
            <Field label="Свой ключ Billz" hint={partner.billz?.hasSecret ? 'Ключ сохранён. Введите новый, чтобы заменить.' : 'Не задан — используется общий ключ.'}>
              <input className="fh-input fh-mono" type="password" autoComplete="new-password" disabled={busy} value={form.billzSecret} onChange={(e) => setForm({ ...form, billzSecret: e.target.value })} />
            </Field>
            <Field label="ID типа оплаты в Billz"><input className="fh-input fh-mono" disabled={busy} value={form.billzPaymentTypeId} onChange={(e) => setForm({ ...form, billzPaymentTypeId: e.target.value })} /></Field>
            <Field label="Название типа оплаты"><input className="fh-input" disabled={busy} value={form.billzPaymentTypeName} onChange={(e) => setForm({ ...form, billzPaymentTypeName: e.target.value })} /></Field>
          </div>
          <div className="fh-partner-modes">
            <Button variant="primary" disabled={busy} onClick={saveBillz}>Сохранить Billz</Button>
            {partner.billz?.hasSecret && <Button variant="ghost" disabled={busy} onClick={() => setConfirm({ type: 'billz-remove' })}>Удалить свой ключ</Button>}
          </div>
        </section>
      </div>
      <div className="fh-dialog-actions">
        <Button disabled={busy} onClick={onClose}>Закрыть</Button>
      </div>
    </Dialog>
  );
}

export function PartnersPanel({ api = partnersApi }) {
  const [partners, setPartners] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [openCode, setOpenCode] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await api.list();
      setPartners(Array.isArray(response?.data?.partners) ? response.data.partners : []);
      setError('');
    } catch (err) {
      setPartners([]);
      setError(partnerError(err));
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const open = partners?.find((p) => p.code === openCode);

  return (
    <Card className="fh-keys-card fh-partners-card">
      <div className="fh-keys-card__head fh-partners-card__head">
        <div>
          <p className="fh-eyebrow">PARTNER API</p>
          <h2>Партнёры</h2>
          <p>
            Любой сервис, которому нужны наш каталог и остатки, подключается по одному общему API — без отдельной разработки.
            Цена и «показывать партнёрам» задаются на странице «Товары», в строке «Партнёры (API)».
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>Добавить партнёра</Button>
      </div>
      {error && <div className="fh-stale-note">{error}</div>}
      {partners === null && <p>Загружаем…</p>}
      {partners?.length === 0 && !error && <p>Партнёров пока нет.</p>}
      {partners?.map((partner) => (
        <div className="fh-key-row" key={partner.code}>
          <div>
            <b>{partner.name}</b>
            <small className="fh-mono">{partner.code}</small>
          </div>
          <Badge tone={MODE[partner.mode]?.tone || 'neutral'}>{MODE[partner.mode]?.label || partner.mode}</Badge>
          <span className="fh-key-row__when">
            {partner.stats?.waiting ? `Ждут решения: ${partner.stats.waiting} · ` : ''}
            {partner.stats?.lastOrderAt ? `Последний заказ ${formatDateTime(partner.stats.lastOrderAt)}` : 'Заказов ещё не было'}
            {partner.stats?.webhookFailed ? ` · Вебхуков не доставлено: ${partner.stats.webhookFailed}` : ''}
          </span>
          <Button size="sm" onClick={() => setOpenCode(partner.code)}>Открыть</Button>
        </div>
      ))}
      {creating && <CreatePartnerDialog api={api} onClose={() => setCreating(false)} onSaved={load} />}
      {open && <PartnerDialog key={open.code} partner={open} api={api} onClose={() => setOpenCode('')} onSaved={load} />}
    </Card>
  );
}
