import React, { useCallback, useEffect, useState } from 'react';
import { connectionsApi } from '../../api/connections';
import { formatDateTime, formatNumber } from '../../lib/format';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Dialog } from '../../ui/Dialog';
import { Field } from '../../ui/Field';
import { useToast } from '../../ui/ToastProvider';
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

export function ConnectionsPage({ api = connectionsApi }) {
  const toast = useToast();
  const [sync, setSync] = useState(null);
  const [keys, setKeys] = useState([]);
  const [defaultMxikCode, setDefaultMxikCode] = useState('');
  const [errors, setErrors] = useState({});
  const [medicalka, setMedicalka] = useState(false);
  const [uzum, setUzum] = useState(false);
  const [revoking, setRevoking] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uzumForm, setUzumForm] = useState({ clientId: '', clientSecret: '', label: 'Основное подключение Uzum' });

  const load = useCallback(async () => {
    const [syncResult, settingsResult, keysResult] = await Promise.allSettled([
      api.syncStatus(), api.settings(), api.keys(),
    ]);
    if (syncResult.status === 'fulfilled') {
      setSync(syncResult.value.data);
      setErrors((e) => ({ ...e, sync: '' }));
    } else setErrors((e) => ({ ...e, sync: syncResult.reason.message }));
    if (settingsResult.status === 'fulfilled') setDefaultMxikCode(settingsResult.value.data.defaultMxikCode || '');
    if (keysResult.status === 'fulfilled') {
      setKeys(keysResult.value.data || []);
      setErrors((e) => ({ ...e, keys: '' }));
    } else setErrors((e) => ({ ...e, keys: keysResult.reason.message }));
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const saveMxik = async () => {
    try { await api.saveSettings({ defaultMxikCode }); toast?.success?.('Общий код сохранён'); }
    catch (err) { toast?.error?.(err.message); }
  };
  const runSync = async () => {
    try {
      await api.triggerSync();
      toast?.success?.('Запросили свежие остатки из Billz. Обновится за несколько секунд.');
      window.setTimeout(load, 1500);
    } catch (err) { toast?.error?.(err.message); }
  };
  const importUzum = async () => {
    setBusy(true);
    try {
      await api.importUzum(uzumForm);
      setUzum(false);
      setUzumForm({ clientId: '', clientSecret: '', label: 'Основное подключение Uzum' });
      toast?.success?.('Данные Uzum сохранены');
      load();
    } catch (err) { toast?.error?.(err.message); }
    finally { setBusy(false); }
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
  const uzumReady = active('uzum').length > 0;
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
              <ConnectionMark tone={medicalkaReady ? 'ok' : 'idle'}>
                {medicalkaReady ? 'Подключено' : 'Пока не подключено'}
              </ConnectionMark>
            </div>
          </div>
          <p>Аптечный маркетплейс. Он сам забирает у нас каталог и присылает заказы — для этого ему нужны два наших ключа.</p>
          <Button variant="primary" onClick={() => setMedicalka(true)}>
            {medicalkaKeys.length ? 'Выпустить новые ключи' : 'Подключить Medicalka'}
          </Button>
        </Card>

        <Card className="fh-connection-card">
          <div className="fh-connection-card__top">
            <div className="fh-service-logo">U</div>
            <div>
              <h2>Uzum Tezkor</h2>
              <ConnectionMark tone={uzumReady ? 'ok' : 'idle'}>
                {uzumReady ? 'Подключено' : 'Пока не подключено'}
              </ConnectionMark>
            </div>
          </div>
          <p>Маркетплейс Uzum. Здесь наоборот: доступ выдаёт их менеджер, а мы только сохраняем то, что он прислал.</p>
          <Button variant="primary" onClick={() => setUzum(true)}>
            {uzumReady ? 'Заменить данные' : 'Ввести данные Uzum'}
          </Button>
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

      <Card className="fh-settings-strip">
        <div>
          <p className="fh-eyebrow">НАЛОГОВЫЙ КОД ТОВАРА</p>
          <h2>Общий код для товаров, у которых нет своего</h2>
          <p>ИКПУ — код товара для налоговой. Если у товара указан свой код, используется он; если нет — вот этот.</p>
        </div>
        <div>
          <input
            className="fh-input fh-mono"
            value={defaultMxikCode}
            onChange={(e) => setDefaultMxikCode(e.target.value)}
            placeholder="17 цифр"
            aria-label="Общий код ИКПУ"
          />
          <Button onClick={saveMxik}>Сохранить</Button>
        </div>
      </Card>

      <MedicalkaWizard open={medicalka} api={api} onClose={() => setMedicalka(false)} onDone={() => load()} />

      <Dialog
        open={uzum}
        title="Подключить Uzum Tezkor"
        description="Введите данные, которые прислал менеджер Uzum. Мы их не придумываем — просто сохраняем."
        onClose={() => !busy && setUzum(false)}
        width="620px"
      >
        <div className="fh-form-stack">
          <Field label="Client ID" hint="Похож на набор букв и цифр. Скопируйте целиком, без пробелов.">
            <input className="fh-input fh-mono" autoComplete="off" value={uzumForm.clientId} onChange={(e) => setUzumForm({ ...uzumForm, clientId: e.target.value })} />
          </Field>
          <Field label="Client secret" hint="Секретная часть. После сохранения поле очистится и показать его снова будет нельзя.">
            <input className="fh-input fh-mono" type="password" autoComplete="new-password" value={uzumForm.clientSecret} onChange={(e) => setUzumForm({ ...uzumForm, clientSecret: e.target.value })} />
          </Field>
          <Field label="Название" hint="Чтобы потом понять, откуда этот доступ.">
            <input className="fh-input" value={uzumForm.label} onChange={(e) => setUzumForm({ ...uzumForm, label: e.target.value })} />
          </Field>
        </div>
        <div className="fh-dialog-actions">
          <Button onClick={() => setUzum(false)}>Отмена</Button>
          <Button variant="primary" disabled={busy || uzumForm.clientId.length < 4 || uzumForm.clientSecret.length < 8} onClick={importUzum}>
            {busy ? 'Сохраняем…' : 'Сохранить данные Uzum'}
          </Button>
        </div>
      </Dialog>

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
