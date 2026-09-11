import React, { useEffect, useRef, useState } from 'react';
import { Dialog } from '../../ui/Dialog';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';

const labels = { uzum: 'Uzum', yandex: 'Yandex' };
function Credential({ item, channel, host, place, api }) {
  const [secret, setSecret] = useState('');
  const [available, setAvailable] = useState(item.secretAvailable);
  const [input, setInput] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const generation = useRef(0);
  useEffect(() => {
    const hide = () => { generation.current += 1; setSecret(''); setInput(''); setNotice(''); setBusy(false); };
    const visibility = () => { if (document.hidden) hide(); };
    document.addEventListener('visibilitychange', visibility);
    return () => { generation.current += 1; document.removeEventListener('visibilitychange', visibility); };
  }, []);
  const reveal = async () => {
    const current = ++generation.current; setBusy(true); setError('');
    try {
      const { data } = await api.revealConnection(item.id);
      if (current !== generation.current) return;
      if (data?.id !== item.id || data.channel !== channel || data.clientId !== item.clientId
        || typeof data.clientSecret !== 'string' || !data.clientSecret) throw new Error();
      setSecret(data.clientSecret);
    } catch (_) { if (current === generation.current) setError('Не удалось открыть секрет. При смене ключа защиты восстановите сохранённую копию.'); }
    finally { if (current === generation.current) setBusy(false); }
  };
  const restore = async () => {
    const current = ++generation.current; setBusy(true); setError('');
    try {
      const result = await api.restoreConnection(item.id, { clientSecret: input });
      if (current !== generation.current) return;
      if (result?.data?.saved !== true) throw new Error();
      setAvailable(true); setInput(''); setRestoring(false); setNotice('Копия сохранена. Действующий ключ не изменён.');
    } catch (_) { if (current === generation.current) setError('Копия не сохранена. Нужен тот же Client secret, который был выдан раньше.'); }
    finally { if (current === generation.current) setBusy(false); }
  };
  const copy = async () => {
    const current = generation.current;
    try {
      await navigator.clipboard.writeText(`Host: ${host}\nClient ID: ${item.clientId}\nClient secret: ${secret}\nPlace: ${place}`);
      if (current === generation.current) setNotice('Данные скопированы. Передайте их только выбранному партнёру.');
    } catch (_) { if (current === generation.current) setError('Не удалось скопировать. Выделите значения вручную.'); }
  };
  return <div className="fh-key-box">
    <span>Client ID</span><code className="fh-key-box__value">{item.clientId}</code>
    <span>Client secret</span><code className="fh-key-box__value">{secret || '••••••••'}</code>
    {!available && <p>Сохранённой копии нет. Существующий ключ продолжает работать.</p>}
    <div className="fh-connection-actions">
      <Button disabled={busy} onClick={secret ? () => { generation.current += 1; setSecret(''); setNotice(''); } : reveal}>{secret ? 'Скрыть Client secret' : 'Показать Client secret'}</Button>
      <Button disabled={!secret || !place || busy} onClick={copy}>Скопировать данные {labels[channel]}</Button>
      <Button variant="ghost" disabled={busy} onClick={() => { setRestoring(!restoring); setInput(''); }}>Восстановить копию</Button>
    </div>
    {restoring && <div className="fh-form-stack">
      <Field label="Ранее выданный Client secret" hint="Проверим совпадение; новый ключ не создаётся.">
        <input className="fh-input" type="password" autoComplete="new-password" value={input} disabled={busy} onChange={e => setInput(e.target.value)} />
      </Field>
      <Button disabled={busy || input.length < 8} onClick={restore}>Сохранить защищённую копию</Button>
    </div>}
    {notice && <p role="status">{notice}</p>}{error && <p role="alert" className="fh-error-note">{error}</p>}
  </div>;
}
export function RetailConnectionDetails({ api, onClose }) {
  const [data, setData] = useState(null); const [place, setPlace] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    api.connectionDetails().then(({ data: value }) => {
      if (!mounted.current) return;
      if (typeof value?.place !== 'string' || !Array.isArray(value.channels) || value.channels.length !== 2
        || !['uzum', 'yandex'].every(c => value.channels.some(row => row.channel === c && Array.isArray(row.keys)))) throw new Error();
      setData(value); setPlace(value.place);
    }).catch(() => { if (mounted.current) setError('Не удалось загрузить данные подключения. Закройте окно и повторите.'); });
    return () => { mounted.current = false; };
  }, [api]);
  const save = async () => {
    setBusy(true); setError('');
    try {
      const result = await api.saveConnectionPlace({ place });
      if (mounted.current) setData(previous => ({ ...previous, place: result.data.place }));
    } catch (_) { if (mounted.current) setError('Place не сохранён. Проверьте идентификатор и настройки активных каналов.'); }
    finally { if (mounted.current) setBusy(false); }
  };
  return <Dialog open title="Данные подключения" description="Один филиал FairHaven. Отдельные доступы для Uzum и Yandex." onClose={onClose} width="760px">
    {error && <p role="alert" className="fh-error-note">{error}</p>}
    {!data ? <p>Загружаем…</p> : <div className="fh-form-stack">
      <Field label="Общий Place" hint="Идентификатор нашего филиала. Сохранение не включает каналы и не меняет рабочие настройки API.">
        <input className="fh-input fh-mono" value={place} maxLength={64} disabled={busy} onChange={e => setPlace(e.target.value)} />
      </Field>
      <Button disabled={busy || !/^[A-Za-z0-9_-]{1,64}$/.test(place) || place === data.place} onClick={save}>Сохранить Place</Button>
      {data.channels.map(c => <section key={c.channel} aria-label={`Данные ${labels[c.channel]}`}>
        <h3>{labels[c.channel]}</h3>
        <p>Host: <span className="fh-key-box__value">{c.host}</span></p>
        <p>Place: <span className="fh-mono">{data.place || 'Не задан'}</span></p>
        <p>{c.enabled ? 'Канал включён' : 'Канал выключен'} · {c.runtimePlace === data.place && data.place ? 'Place совпадает с настройкой API' : 'Place ещё не установлен в API или отличается'}</p>
        {!c.keys.length && <p>Доступ ещё не выпущен. Создайте его кнопкой «Создать доступ {labels[c.channel]}» на странице подключений.</p>}
        {c.keys.map(item => <Credential key={item.id} item={item} channel={c.channel} host={c.host} place={data.place} api={api} />)}
      </section>)}
    </div>}
    <div className="fh-dialog-actions"><Button onClick={onClose}>Закрыть данные</Button></div>
  </Dialog>;
}
