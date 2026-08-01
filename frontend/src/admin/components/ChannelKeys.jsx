import React, { useCallback, useEffect, useState } from 'react';
import {
  listChannelKeys,
  issueChannelKey,
  revokeChannelKey,
  channelSettings,
  updateChannelSettings,
} from '../adminApi';
import Icon from './Icon';
import Modal from './Modal';

/**
 * Marketplace credentials and the catalogue defaults that go with them.
 *
 * Issuing a key used to mean an SSH session and a script, which in practice
 * meant keys were issued rarely, revoked late, and passed around in chat
 * because reissuing was a chore. Making it a button is the security
 * improvement, not a convenience.
 *
 * A secret is shown once, here, in the response that creates it. There is no
 * endpoint that can show it again and nothing on this side stores it — so the
 * screen says so plainly rather than letting an operator assume they can come
 * back for it.
 */

const KINDS = {
  medicalka: [
    { kind: 'token', label: 'Токен чтения', hint: 'каталог и остатки' },
    { kind: 'secret', label: 'Секрет заказов', hint: 'приём и статусы заказов' },
  ],
  uzum: [
    { kind: 'oauth', label: 'OAuth-клиент', hint: 'client_id + client_secret' },
  ],
};

const CHANNEL_LABEL = { medicalka: 'Medicalka', uzum: 'Uzum Tezkor' };

function when(value) {
  if (!value) return 'никогда';
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export default function ChannelKeys({ toast }) {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [revealed, setRevealed] = useState(null);
  const [mxik, setMxik] = useState('');
  const [savedMxik, setSavedMxik] = useState('');
  const [savingMxik, setSavingMxik] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [keyList, settings] = await Promise.all([listChannelKeys(), channelSettings()]);
      setKeys(keyList.data || []);
      setMxik(settings.data?.defaultMxikCode || '');
      setSavedMxik(settings.data?.defaultMxikCode || '');
    } catch (err) {
      toast?.err?.(err.message || 'Не удалось загрузить ключи');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function issue(channel, kind, label) {
    setIssuing(true);
    try {
      const result = await issueChannelKey({ channel, kind, label });
      // Held in component state only, and only until the operator dismisses it.
      setRevealed(result.data);
      await load();
    } catch (err) {
      toast?.err?.(err.message || 'Не удалось выпустить ключ');
    } finally {
      setIssuing(false);
    }
  }

  async function revoke(key) {
    // Irreversible and immediate: the integration using it stops working on its
    // next request. Worth one confirmation.
    const ok = window.confirm(
      `Отозвать ${CHANNEL_LABEL[key.channel]} · ${key.fingerprint}?\n\n`
      + 'Интеграция перестанет работать сразу же. Отменить нельзя — можно только выпустить новый ключ.'
    );
    if (!ok) return;
    try {
      await revokeChannelKey(key.id);
      toast?.ok?.('Ключ отозван');
      await load();
    } catch (err) {
      toast?.err?.(err.message || 'Не удалось отозвать ключ');
    }
  }

  async function saveMxik() {
    setSavingMxik(true);
    try {
      await updateChannelSettings({ defaultMxikCode: mxik.trim() });
      setSavedMxik(mxik.trim());
      toast?.ok?.('ИКПУ по умолчанию сохранён');
    } catch (err) {
      toast?.err?.(err.message || 'Неверный код ИКПУ');
    } finally {
      setSavingMxik(false);
    }
  }

  const active = keys.filter((k) => k.active);
  const revoked = keys.filter((k) => !k.active);

  return (
    <div className="ap-ch-keys">
      <section className="ap-card ap-ch-keycard">
        <header className="ap-ch-keyhead">
          <div>
            <h2 className="ap-ch-keytitle">Ключи маркетплейсов</h2>
            <p className="ap-ch-keysub">
              Секрет показывается один раз при выпуске. Сохранить его позже нельзя —
              только выпустить новый.
            </p>
          </div>
        </header>

        <div className="ap-ch-issue">
          {Object.entries(KINDS).map(([channel, kinds]) => (
            <div key={channel} className="ap-ch-issuegroup">
              <span className="ap-ch-issuechannel">{CHANNEL_LABEL[channel]}</span>
              {kinds.map(({ kind, label, hint }) => (
                <button
                  key={kind}
                  type="button"
                  className="ap-btn ap-btn-ghost ap-btn-xs"
                  disabled={issuing}
                  onClick={() => issue(channel, kind, label)}
                  title={hint}
                >
                  <Icon name="plus" size={14} />
                  {label}
                </button>
              ))}
            </div>
          ))}
        </div>

        {loading ? (
          <p className="ap-muted">Загрузка…</p>
        ) : (
          <>
            <KeyTable keys={active} onRevoke={revoke} />
            {revoked.length > 0 && (
              <details className="ap-ch-revoked">
                <summary>Отозванные ({revoked.length})</summary>
                <KeyTable keys={revoked} />
              </details>
            )}
          </>
        )}
      </section>

      <section className="ap-card ap-ch-keycard">
        <h2 className="ap-ch-keytitle">ИКПУ по умолчанию</h2>
        <p className="ap-ch-keysub">
          Uzum требует код ИКПУ на каждый товар, а в Billz его нет ни у одного.
          Этот код уходит для всех товаров без собственного — он задаётся в карточке товара.
        </p>
        <div className="ap-ch-mxikrow">
          <input
            className="ap-input"
            value={mxik}
            onChange={(e) => setMxik(e.target.value.replace(/\D/g, '').slice(0, 20))}
            placeholder="02106999028000000"
            inputMode="numeric"
            aria-label="Код ИКПУ по умолчанию"
          />
          <button
            type="button"
            className="ap-btn ap-btn-primary ap-btn-xs"
            disabled={savingMxik || mxik.trim() === savedMxik}
            onClick={saveMxik}
          >
            {savingMxik ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </div>
      </section>

      {revealed && <RevealDialog data={revealed} onClose={() => setRevealed(null)} toast={toast} />}
    </div>
  );
}

function KeyTable({ keys, onRevoke }) {
  if (!keys.length) return <p className="ap-muted">Пока нет ключей.</p>;

  return (
    <div className="ap-ch-keytable" role="table">
      {keys.map((key) => (
        <div className="ap-ch-keyrow" role="row" key={key.id}>
          <span className="ap-ch-keychannel">{CHANNEL_LABEL[key.channel] || key.channel}</span>
          <code className="ap-ch-keyfp">{key.fingerprint}</code>
          <span className="ap-ch-keykind">{key.kind}</span>
          {key.clientId && <code className="ap-ch-keyclient">{key.clientId}</code>}
          <span className="ap-ch-keyused">
            {key.active ? `использован ${when(key.lastUsedAt)}` : `отозван ${when(key.revokedAt)}`}
          </span>
          {onRevoke && (
            <button
              type="button"
              className="ap-btn ap-btn-danger ap-btn-xs"
              onClick={() => onRevoke(key)}
            >
              Отозвать
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * The one moment the secret exists outside the server.
 *
 * Deliberately modal and deliberately blunt: an operator who closes this
 * without copying has to revoke and reissue, and that is better than a screen
 * that quietly implies the value can be found again later.
 */
function RevealDialog({ data, onClose, toast }) {
  const pairs = data.clientId
    ? [['client_id', data.clientId], ['client_secret', data.clientSecret]]
    : [['key', data.key]];

  async function copy(value) {
    try {
      await navigator.clipboard.writeText(value);
      toast?.ok?.('Скопировано');
    } catch {
      toast?.err?.('Браузер не дал доступ к буферу — выделите и скопируйте вручную');
    }
  }

  return (
    <Modal
      title={`${CHANNEL_LABEL[data.channel]} · ${data.kind}`}
      onClose={onClose}
      footer={
        <button type="button" className="ap-btn ap-btn-primary" onClick={onClose}>
          Я сохранил
        </button>
      }
    >
      <p className="ap-ch-revealwarn">
        <Icon name="alert" size={15} />
        Показывается один раз. Скопируйте сейчас — восстановить будет нельзя.
      </p>

      {pairs.map(([name, value]) => (
        <div className="ap-ch-revealfield" key={name}>
          <label className="ap-label">{name}</label>
          <div className="ap-ch-revealrow">
            <code className="ap-ch-revealvalue">{value}</code>
            <button
              type="button"
              className="ap-btn ap-btn-ghost ap-btn-xs"
              onClick={() => copy(value)}
            >
              Копировать
            </button>
          </div>
        </div>
      ))}
    </Modal>
  );
}
