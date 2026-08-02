import React, { useCallback, useEffect, useState } from 'react';
import { connectionsApi } from '../../api/connections';
import { formatDateTime } from '../../lib/format';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Dialog } from '../../ui/Dialog';
import { Field } from '../../ui/Field';
import { useToast } from '../../ui/ToastProvider';
import { MedicalkaWizard } from './MedicalkaWizard';

function ConnectionMark({ available, children }) {
  return <span className={`fh-connection-mark ${available ? 'is-ok' : ''}`}><i />{children}</span>;
}

export function ConnectionsPage({ api = connectionsApi }) {
  const toast = useToast();
  const [sync, setSync] = useState(null);
  const [keys, setKeys] = useState([]);
  const [defaultMxikCode, setDefaultMxikCode] = useState('');
  const [errors, setErrors] = useState({});
  const [medicalka, setMedicalka] = useState(false);
  const [uzum, setUzum] = useState(false);
  const [uzumForm, setUzumForm] = useState({ clientId: '', clientSecret: '', label: 'Основное подключение Uzum' });

  const load = useCallback(async () => {
    const [syncResult, settingsResult, keysResult] = await Promise.allSettled([api.syncStatus(), api.settings(), api.keys()]);
    if (syncResult.status === 'fulfilled') { setSync(syncResult.value.data); setErrors((e) => ({ ...e, sync: '' })); } else setErrors((e) => ({ ...e, sync: syncResult.reason.message }));
    if (settingsResult.status === 'fulfilled') setDefaultMxikCode(settingsResult.value.data.defaultMxikCode || '');
    if (keysResult.status === 'fulfilled') { setKeys(keysResult.value.data || []); setErrors((e) => ({ ...e, keys: '' })); } else setErrors((e) => ({ ...e, keys: keysResult.reason.message }));
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const saveMxik = async () => { try { await api.saveSettings({ defaultMxikCode }); toast?.success?.('Общий ИКПУ сохранён'); } catch (err) { toast?.error?.(err.message); } };
  const runSync = async () => { try { await api.triggerSync(); toast?.success?.('Обновление Billz запущено'); window.setTimeout(load, 1200); } catch (err) { toast?.error?.(err.message); } };
  const importUzum = async () => { try { await api.importUzum(uzumForm); setUzum(false); setUzumForm({ clientId: '', clientSecret: '', label: 'Основное подключение Uzum' }); toast?.success?.('Данные Uzum сохранены'); load(); } catch (err) { toast?.error?.(err.message); } };
  const active = (channel) => keys.filter((key) => key.channel === channel && key.active);

  return (
    <div className="fh-page fh-connections">
      <header className="fh-page-head"><div><p className="fh-eyebrow">КАНАЛЫ ПРОДАЖ</p><h1>Подключения</h1><p>Технические настройки собраны отдельно от ежедневной работы с товарами.</p></div><Button onClick={load}>Проверить связь</Button></header>
      <section className="fh-connection-grid">
        <Card className="fh-connection-card"><div className="fh-connection-card__top"><div className="fh-service-logo">M</div><div><h2>Medicalka</h2><ConnectionMark available={active('medicalka').length >= 2}>{active('medicalka').length >= 2 ? 'Ключи активны' : 'Нужно подключить'}</ConnectionMark></div></div><p>Мы создаём два ключа и передаём их менеджеру Medicalka.</p><Button variant="primary" onClick={() => setMedicalka(true)}>{active('medicalka').length ? 'Обновить подключение' : 'Подключить Medicalka'}</Button></Card>
        <Card className="fh-connection-card"><div className="fh-connection-card__top"><div className="fh-service-logo">U</div><div><h2>Uzum Tezkor</h2><ConnectionMark available={active('uzum').length > 0}>{active('uzum').length ? 'Данные сохранены' : 'Не подключён'}</ConnectionMark></div></div><p>Менеджер Uzum выдаёт client ID и secret. Введите их без изменений.</p><Button variant="primary" onClick={() => setUzum(true)}>{active('uzum').length ? 'Заменить данные' : 'Ввести данные Uzum'}</Button></Card>
        <Card className="fh-connection-card fh-connection-card--billz"><div className="fh-connection-card__top"><div className="fh-service-logo">B</div><div><h2>Billz</h2><ConnectionMark available={Boolean(sync?.mirrorTotal)}>{sync?.mirrorTotal ? `${sync.mirrorTotal} товаров в зеркале` : errors.sync ? 'Связь недоступна' : 'Проверяем связь'}</ConnectionMark></div></div><div className="fh-sync-ledger"><div><span>Последнее обновление</span><b>{formatDateTime(sync?.last?.at)}</b></div><div><span>Результат</span><b>{sync?.last?.ok ? 'Успешно' : sync?.last?.error || 'Нет данных'}</b></div></div><Button onClick={runSync}>Обновить из Billz</Button></Card>
      </section>
      {errors.keys && <div className="fh-stale-note">Сервис ключей недоступен: {errors.keys}. Каталог и заказы продолжают работать.</div>}
      <Card className="fh-settings-strip"><div><p className="fh-eyebrow">ИКПУ ПО УМОЛЧАНИЮ</p><h2>Общий код для товаров без своего ИКПУ</h2><p>Индивидуальный код в карточке товара всегда имеет приоритет.</p></div><div><input className="fh-input fh-mono" value={defaultMxikCode} onChange={(e) => setDefaultMxikCode(e.target.value)} placeholder="17  цифр" /><Button onClick={saveMxik}>Сохранить</Button></div></Card>
      <MedicalkaWizard open={medicalka} api={api} onClose={() => setMedicalka(false)} onDone={() => load()} />
      <Dialog open={uzum} title="Подключить Uzum Tezkor" description="Введите данные, которые прислал менеджер Uzum. FairHaven их не генерирует." onClose={() => setUzum(false)} width="620px"><div className="fh-form-stack"><Field label="Client ID"><input className="fh-input fh-mono" autoComplete="off" value={uzumForm.clientId} onChange={(e) => setUzumForm({ ...uzumForm, clientId: e.target.value })} /></Field><Field label="Client secret" hint="После сохранения значение очистится."><input className="fh-input fh-mono" type="password" autoComplete="new-password" value={uzumForm.clientSecret} onChange={(e) => setUzumForm({ ...uzumForm, clientSecret: e.target.value })} /></Field><Field label="Название"><input className="fh-input" value={uzumForm.label} onChange={(e) => setUzumForm({ ...uzumForm, label: e.target.value })} /></Field></div><div className="fh-dialog-actions"><Button onClick={() => setUzum(false)}>Отмена</Button><Button variant="primary" disabled={uzumForm.clientId.length < 4 || uzumForm.clientSecret.length < 8} onClick={importUzum}>Сохранить данные Uzum</Button></div></Dialog>
    </div>
  );
}
