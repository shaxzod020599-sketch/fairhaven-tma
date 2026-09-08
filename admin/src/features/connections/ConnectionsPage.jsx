import React, { useCallback, useEffect, useRef, useState } from 'react';
import { connectionsApi } from '../../api/connections';
import { formatDateTime, formatNumber } from '../../lib/format';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Dialog } from '../../ui/Dialog';
import { Field } from '../../ui/Field';
import { useToast } from '../../ui/ToastProvider';
import { MedicalkaPartnerDialog } from './MedicalkaPartnerDialog';
import { MedicalkaWizard } from './MedicalkaWizard';

/**
 * Подключения — техническая страница, написанная для нетехнического оператора.
 *
 * Каждый сервис сначала объясняется словами («что это и зачем»), и только потом
 * предлагается кнопка. Выпущенные ключи показаны списком: до этого их можно было
 * создать, но нельзя было увидеть или отозвать, из-за чего страница выглядела
 * незаконченной.
 */

const KEY_KIND_LABEL = {
  token: 'Ключ для каталога',
  secret: 'Ключ для заказов',
  oauth: 'Доступ Uzum',
};

function ConnectionMark({ tone = 'idle', children }) {
  return <span className={`fh-connection-mark is-${tone}`}><i />{children}</span>;
}

function KeyRow({ item, onRevoke }) {
  return (
    <div className="fh-key-row">
      <div>
        <b>{KEY_KIND_LABEL[item.kind] || item.kind}</b>
        <small>{item.label || 'Без названия'}</small>
      </div>
      <span className="fh-mono fh-key-row__print" title="Отпечаток ключа — по нему можно отличить один ключ от другого">
        {item.fingerprint}
      </span>
      <span className="fh-key-row__when">
        {item.lastUsedAt ? `Использован ${formatDateTime(item.lastUsedAt)}` : 'Ещё не использовался'}
      </span>
      {item.active
        ? <Button size="sm" variant="ghost" onClick={() => onRevoke(item)}>Отозвать</Button>
        : <Badge tone="neutral">Отозван</Badge>}
    </div>
  );
}

// Mounted only while open, so credentials are discarded when the dialog closes.
function UzumCredentialsDialog({ mode, api, onClose, onSaved }) {
  const importing = mode === 'import';
  const [form, setForm] = useState({ clientId: '', clientSecret: '', label: 'Основное подключение Uzum' });
  const [pair, setPair] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [copied, setCopied] = useState('');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const save = async () => {
    if (busy || uncertain) return;
    setBusy(true);
    setError('');
    try {
      const response = importing
        ? await api.importUzum(form)
        : await api.issueUzum({ label: form.label.trim() });
      if (!mounted.current) return;
      if (importing) {
        setForm({ clientId: '', clientSecret: '', label: '' });
        onClose();
      } else {
        const data = response?.data;
        if (typeof data?.clientId !== 'string' || !data.clientId.trim()
          || typeof data?.clientSecret !== 'string' || !data.clientSecret.trim()) {
          throw new Error('Incomplete credential response');
        }
        setPair({ clientId: data.clientId, clientSecret: data.clientSecret });
      }
      onSaved();
    } catch (_) {
      if (mounted.current) {
        setUncertain(!importing);
        setError(importing
          ? 'Не удалось подтвердить сохранение. Обновите список ключей перед повторной попыткой.'
          : 'Не удалось подтвердить создание доступа. Ключ мог быть создан. Обновите список ключей: если появился новый доступ, секрет которого вы не получили, отзовите его перед созданием новой пары.');
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const close = () => {
    if (busy) return;
    setPair(null);
    setForm({ clientId: '', clientSecret: '', label: '' });
    onClose();
    if (uncertain) onSaved();
  };
  const copy = async (field) => {
    try {
      await navigator.clipboard.writeText(pair[field]);
      if (mounted.current) { setCopied(field); setError(''); }
    } catch (_) {
      if (mounted.current) setError('Не удалось скопировать автоматически. Выделите значение и скопируйте вручную.');
    }
  };

  return (
    <Dialog
      open
      title={importing ? 'Импорт согласованных данных Uzum' : 'Создать доступ для Uzum Tezkor'}
      description={importing
        ? 'Необязательный шаг: сохраните существующую пару, заранее согласованную для доступа Uzum к API FairHaven.'
        : 'FairHaven выпускает Client ID и Client secret для доступа Uzum к нашему API.'}
      onClose={close}
      closeDisabled={busy}
      width="620px"
    >
      {pair ? <>
        <div className="fh-secret-warning"><b>Скопируйте сейчас.</b> Данные показываются один раз. После закрытия окна увидеть секрет снова нельзя.</div>
        <div className="fh-key-grid">
          {['clientId', 'clientSecret'].map((field) => {
            const label = field === 'clientId' ? 'Client ID' : 'Client secret';
            return <div className="fh-key-box" key={field}>
              <span>{label}</span>
              <code className="fh-key-box__value">{pair[field]}</code>
              <Button onClick={() => copy(field)}>Скопировать {label}</Button>
            </div>;
          })}
        </div>
        {copied && <p role="status">{copied === 'clientId' ? 'Client ID скопирован' : 'Client secret скопирован'}</p>}
        <div className="fh-next-note"><b>Что дальше</b><p>Передайте данные команде Uzum по согласованному безопасному каналу. Выпуск ключей не включает обработку реальных заказов: запуск согласуется отдельно.</p></div>
      </> : <div className="fh-form-stack">
        <Field label="Название подключения" hint="Поможет отличить этот доступ в списке ключей.">
          <input className="fh-input" maxLength={120} disabled={busy} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
        </Field>
        {importing && <>
          <Field label="Client ID" hint="Существующий идентификатор для доступа к FairHaven.">
            <input className="fh-input fh-mono" autoComplete="off" disabled={busy} value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} />
          </Field>
          <Field label="Client secret" hint="После закрытия окна поле очистится.">
            <input className="fh-input fh-mono" type="password" autoComplete="new-password" disabled={busy} value={form.clientSecret} onChange={(e) => setForm({ ...form, clientSecret: e.target.value })} />
          </Field>
        </>}
        {!importing && <p>Новая пара создаётся только по кнопке ниже. Ранее выданные ключи продолжат действовать.</p>}
      </div>}
      {error && <div className="fh-error-note" role="alert">{error}</div>}
      <div className="fh-dialog-actions">
        <Button disabled={busy} onClick={close}>{uncertain ? 'Закрыть и обновить список' : pair ? 'Закрыть окно' : 'Отмена'}</Button>
        {!pair && <Button variant="primary" disabled={busy || uncertain || !form.label.trim() || (importing && (form.clientId.trim().length < 4 || form.clientSecret.trim().length < 8))} onClick={save}>
          {busy ? 'Сохраняем…' : importing ? 'Сохранить согласованную пару' : 'Создать Client ID и secret'}
        </Button>}
      </div>
    </Dialog>
  );
}

export function ConnectionsPage({ api = connectionsApi }) {
  const toast = useToast();
  const [sync, setSync] = useState(null);
  const [keys, setKeys] = useState([]);
  const [defaultMxikCode, setDefaultMxikCode] = useState('');
  const [defaultPackageCode, setDefaultPackageCode] = useState('');
  const [errors, setErrors] = useState({});
  const [medicalka, setMedicalka] = useState(false);
  const [medicalkaPartner, setMedicalkaPartner] = useState(false);
  const [partnerSummary, setPartnerSummary] = useState({ activeEnvironment: '', profiles: [] });
  const [uzum, setUzum] = useState(null);
  const [revoking, setRevoking] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [syncResult, settingsResult, keysResult, partnerResult] = await Promise.allSettled([
      api.syncStatus(), api.settings(), api.keys(), api.medicalkaPartner(),
    ]);
    if (syncResult.status === 'fulfilled') {
      setSync(syncResult.value.data);
      setErrors((e) => ({ ...e, sync: '' }));
    } else setErrors((e) => ({ ...e, sync: syncResult.reason.message }));
    if (settingsResult.status === 'fulfilled') {
      setDefaultMxikCode(settingsResult.value.data.defaultMxikCode || '');
      setDefaultPackageCode(settingsResult.value.data.defaultPackageCode || '');
    }
    if (keysResult.status === 'fulfilled') {
      setKeys(keysResult.value.data || []);
      setErrors((e) => ({ ...e, keys: '' }));
    } else setErrors((e) => ({ ...e, keys: keysResult.reason.message }));
    if (partnerResult.status === 'fulfilled') {
      setPartnerSummary(partnerResult.value.data || { activeEnvironment: '', profiles: [] });
      setErrors((e) => ({ ...e, partner: '' }));
    } else setErrors((e) => ({ ...e, partner: partnerResult.reason.message }));
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const saveTaxCodes = async () => {
    try {
      await api.saveSettings({ defaultMxikCode, defaultPackageCode });
      toast?.success?.('Общие коды сохранены');
    } catch (err) { toast?.error?.(err.message); }
  };
  const runSync = async () => {
    try {
      await api.triggerSync();
      toast?.success?.('Запросили свежие остатки из Billz. Обновится за несколько секунд.');
      window.setTimeout(load, 1500);
    } catch (err) { toast?.error?.(err.message); }
  };
  const revoke = async () => {
    setBusy(true);
    try {
      await api.revoke(revoking.id);
      setRevoking(null);
      toast?.success?.('Ключ отозван. Сервис больше не сможет им пользоваться.');
      load();
    } catch (err) { toast?.error?.(err.message); }
    finally { setBusy(false); }
  };

  const active = (channel) => keys.filter((key) => key.channel === channel && key.active);
  const medicalkaKeys = keys.filter((key) => key.channel === 'medicalka');
  const uzumKeys = keys.filter((key) => key.channel === 'uzum');
  const medicalkaReady = active('medicalka').length >= 2;
  const activePartner = partnerSummary.profiles?.find((profile) => profile.active);
  const uzumConfigured = active('uzum').some((key) => key.kind === 'oauth');
  const mirrorTotal = sync?.mirrorTotal || 0;

  return (
    <div className="fh-page fh-connections">
      <header className="fh-page-head">
        <div>
          <p className="fh-eyebrow">КАНАЛЫ ПРОДАЖ</p>
          <h1>Подключения</h1>
          <p>Здесь FairHaven связывается со складом и с маркетплейсами. Настраивается один раз — дальше всё работает само.</p>
        </div>
        <Button onClick={load}>Проверить связь</Button>
      </header>

      <section className="fh-connection-grid">
        <Card className="fh-connection-card">
          <div className="fh-connection-card__top">
            <div className="fh-service-logo">M</div>
            <div>
              <h2>Medicalka</h2>
              <ConnectionMark tone={medicalkaReady && activePartner ? 'ok' : 'idle'}>
                {medicalkaReady && activePartner ? 'Каталог и заявки подключены' : 'Нужна настройка'}
              </ConnectionMark>
            </div>
          </div>
          <p>Medicalka читает наш каталог по ключам, а FairHaven входит в их API и получает заявки, оплату и статусы.</p>
          <div className="fh-connection-actions">
            <Button variant="primary" onClick={() => setMedicalkaPartner(true)}>Настроить заявки</Button>
            <Button size="sm" variant="ghost" onClick={() => setMedicalka(true)}>
              {medicalkaKeys.length ? 'Ключи каталога' : 'Выпустить API-ключи'}
            </Button>
          </div>
        </Card>

        <Card className="fh-connection-card">
          <div className="fh-connection-card__top">
            <div className="fh-service-logo">U</div>
            <div>
              <h2>Uzum Tezkor</h2>
              <ConnectionMark tone="idle">
                {uzumConfigured ? 'Ключи настроены' : 'Ключи не настроены'}
              </ConnectionMark>
            </div>
          </div>
          <p>FairHaven выдаёт Uzum данные для доступа к нашему API. Настроенные ключи не подтверждают запуск: обработка реальных заказов согласуется отдельно.</p>
          <div className="fh-connection-actions">
            <Button variant="primary" onClick={() => setUzum('create')}>Создать доступ Uzum</Button>
            <Button size="sm" variant="ghost" onClick={() => setUzum('import')}>Импорт согласованной пары</Button>
          </div>
        </Card>

        <Card className="fh-connection-card fh-connection-card--billz">
          <div className="fh-connection-card__top">
            <div className="fh-service-logo">B</div>
            <div>
              <h2>Billz</h2>
              <ConnectionMark tone={mirrorTotal ? 'ok' : errors.sync ? 'bad' : 'idle'}>
                {mirrorTotal ? `${formatNumber(mirrorTotal)} товаров синхронизировано` : errors.sync ? 'Связь недоступна' : 'Проверяем связь'}
              </ConnectionMark>
            </div>
          </div>
          <p>Складская программа. Именно из неё FairHaven берёт остатки — сколько чего реально лежит на складе.</p>
          <div className="fh-sync-ledger">
            <div><span>Последнее обновление</span><b>{formatDateTime(sync?.last?.at)}</b></div>
            <div><span>Результат</span><b>{sync?.last?.ok ? 'Успешно' : sync?.last?.error || 'Нет данных'}</b></div>
          </div>
          <Button onClick={runSync}>Обновить остатки сейчас</Button>
        </Card>
      </section>

      {errors.keys && (
        <div className="fh-stale-note">
          Список ключей сейчас недоступен — {errors.keys.replace(/\.\s*$/, '')}. Каталог и заказы при этом работают как обычно.
        </div>
      )}

      {(medicalkaKeys.length > 0 || uzumKeys.length > 0) && (
        <Card className="fh-keys-card">
          <div className="fh-keys-card__head">
            <div>
              <p className="fh-eyebrow">ВЫДАННЫЕ КЛЮЧИ</p>
              <h2>Кто имеет доступ к нашим данным</h2>
              <p>Сам ключ показывается только один раз — при создании. Здесь виден лишь отпечаток, чтобы отличать ключи друг от друга.</p>
            </div>
          </div>
          {medicalkaKeys.length > 0 && (
            <div className="fh-keys-group">
              <h3>Medicalka</h3>
              {medicalkaKeys.map((item) => <KeyRow key={item.id} item={item} onRevoke={setRevoking} />)}
            </div>
          )}
          {uzumKeys.length > 0 && (
            <div className="fh-keys-group">
              <h3>Uzum Tezkor</h3>
              {uzumKeys.map((item) => <KeyRow key={item.id} item={item} onRevoke={setRevoking} />)}
            </div>
          )}
        </Card>
      )}

      <Card className="fh-tax-card">
        <div className="fh-tax-card__lead">
          <p className="fh-eyebrow">НАЛОГОВЫЕ КОДЫ ТОВАРА</p>
          <h2>Общие коды для товаров, у которых нет своих</h2>
          <p>
            Эти два кода уходят вместе с товаром в Medicalka и Uzum — они нужны
            для чека покупателя. Если у товара заполнен свой код, берётся он;
            если поле пустое — вот этот общий. Поменять код у одного товара
            можно на странице «Товары».
          </p>
        </div>
        <div className="fh-tax-card__fields">
          <label>
            <span>
              <b>ИКПУ — что это за товар</b>
              <small>Код категории товара из справочника налоговой, 17 цифр.</small>
            </span>
            <input
              className="fh-input fh-mono"
              value={defaultMxikCode}
              onChange={(e) => setDefaultMxikCode(e.target.value)}
              placeholder="02106999028000000"
              aria-label="Общий код ИКПУ"
            />
          </label>
          <label>
            <span>
              <b>Код упаковки — в чём продаём</b>
              <small>Единица продажи: банка, упаковка, штука. Обычно 7 цифр.</small>
            </span>
            <input
              className="fh-input fh-mono"
              value={defaultPackageCode}
              onChange={(e) => setDefaultPackageCode(e.target.value)}
              placeholder="1490779"
              aria-label="Общий код упаковки"
            />
          </label>
        </div>
        <footer>
          <Button variant="primary" onClick={saveTaxCodes}>Сохранить коды</Button>
        </footer>
      </Card>

      <MedicalkaWizard open={medicalka} api={api} onClose={() => setMedicalka(false)} onDone={() => load()} />
      <MedicalkaPartnerDialog
        open={medicalkaPartner}
        api={api}
        summary={partnerSummary}
        onClose={() => setMedicalkaPartner(false)}
        onSaved={load}
      />

      {uzum && <UzumCredentialsDialog mode={uzum} api={api} onClose={() => setUzum(null)} onSaved={load} />}

      <Dialog
        open={Boolean(revoking)}
        title="Отозвать ключ?"
        description="Сервис, который пользуется этим ключом, сразу потеряет доступ. Если он ещё работает — сначала выдайте новый ключ."
        onClose={() => !busy && setRevoking(null)}
        width="520px"
      >
        <div className="fh-dialog-actions">
          <Button onClick={() => setRevoking(null)}>Отмена</Button>
          <Button variant="danger" disabled={busy} onClick={revoke}>{busy ? 'Отзываем…' : 'Да, отозвать'}</Button>
        </div>
      </Dialog>
    </div>
  );
}
