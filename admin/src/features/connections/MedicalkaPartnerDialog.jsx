import React, { useEffect, useMemo, useState } from 'react';
import { formatDateTime } from '../../lib/format';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Field } from '../../ui/Field';

const ENVIRONMENTS = {
  production: { label: 'Production', url: 'https://api.medicalka.com/api/v1' },
  staging: { label: 'Staging', url: 'https://api.staging.medicalka.com/api/v1' },
};

export function MedicalkaPartnerDialog({
  open, api, summary = { activeEnvironment: '', profiles: [] }, onClose, onSaved,
}) {
  const [environment, setEnvironment] = useState(summary.activeEnvironment || 'production');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [processingMode, setProcessingMode] = useState('observe');
  const [liveConfirmed, setLiveConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const profile = useMemo(
    () => (summary.profiles || []).find((row) => row.environment === environment) || null,
    [summary.profiles, environment],
  );

  useEffect(() => {
    if (!open) return;
    const selected = summary.activeEnvironment || 'production';
    const current = (summary.profiles || []).find((row) => row.environment === selected);
    setEnvironment(selected);
    setUsername('');
    setPassword('');
    setProcessingMode(current?.processingMode || 'observe');
    setLiveConfirmed(false);
    setFeedback('');
    setError('');
  }, [open]);

  const chooseEnvironment = (value) => {
    const next = (summary.profiles || []).find((row) => row.environment === value);
    setEnvironment(value);
    setUsername('');
    setPassword('');
    setProcessingMode(value === 'staging' ? 'observe' : next?.processingMode || 'observe');
    setLiveConfirmed(false);
    setFeedback('');
    setError('');
  };

  const needsCredentials = !profile?.passwordConfigured;
  const liveNeedsConfirmation = environment === 'production'
    && processingMode === 'live' && !liveConfirmed;
  const saveDisabled = busy || liveNeedsConfirmation
    || (needsCredentials && (!username.trim() || !password));

  const save = async () => {
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      const response = await api.saveMedicalkaPartner(environment, {
        username: username.trim(),
        password,
        processingMode: environment === 'staging' ? 'observe' : processingMode,
      });
      setPassword('');
      setFeedback(`Связь проверена. Найдено аптек: ${response.data?.pharmacyCount || 0}.`);
      await onSaved?.();
    } catch (err) {
      setError(err.message || 'Не удалось проверить данные Medicalka');
    } finally {
      setBusy(false);
    }
  };

  const activate = async () => {
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      await api.activateMedicalkaPartner(environment);
      setFeedback(`${ENVIRONMENTS[environment].label} теперь активен.`);
      await onSaved?.();
    } catch (err) {
      setError(err.message || 'Не удалось переключить Medicalka');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      title="Medicalka: заявки и статусы"
      description="FairHaven входит в Medicalka, получает заявки, оплату и статусы курьера. Адреса серверов зафиксированы и не меняются."
      onClose={() => !busy && onClose?.()}
      closeDisabled={busy}
      width="720px"
    >
      <div className="fh-partner-dialog">
        <div className="fh-partner-envs" role="radiogroup" aria-label="Среда Medicalka">
          {Object.entries(ENVIRONMENTS).map(([key, item]) => (
            <label key={key} className={environment === key ? 'is-selected' : ''}>
              <input
                type="radio"
                name="medicalka-environment"
                checked={environment === key}
                onChange={() => chooseEnvironment(key)}
              />
              <span>
                <b>{item.label}</b>
                <small>{key === 'production' ? 'Реальные заявки' : 'Безопасная проверка'}</small>
              </span>
              {summary.activeEnvironment === key && <Badge tone="success">Активен</Badge>}
            </label>
          ))}
        </div>

        <div className="fh-partner-fixed-url">
          <span>API Medicalka</span>
          <code>{ENVIRONMENTS[environment].url}</code>
        </div>

        <div className="fh-partner-summary">
          <div><span>Сохранённый логин</span><b>{profile?.username || 'Не настроен'}</b></div>
          <div><span>Пароль</span><b>{profile?.passwordConfigured ? 'Сохранён' : 'Не задан'}</b></div>
          <div><span>Аптеки</span><b>{profile?.pharmacyCount || 0}</b></div>
          <div><span>Проверено</span><b>{formatDateTime(profile?.lastValidatedAt)}</b></div>
        </div>

        <div className="fh-form-grid fh-partner-fields">
          <Field label="Новый логин" hint="Оставьте пустым, чтобы сохранить текущий логин.">
            <input aria-label="Новый логин" className="fh-input fh-mono" autoComplete="off" value={username} onChange={(event) => setUsername(event.target.value)} />
          </Field>
          <Field label="Новый пароль" hint="Поле всегда пустое. Пустое значение не меняет сохранённый пароль.">
            <input aria-label="Новый пароль" className="fh-input fh-mono" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </Field>
          <Field label="Режим обработки" hint={environment === 'staging' ? 'Staging всегда только наблюдает и не списывает Billz.' : 'Observe получает данные без списания Billz.'}>
            <select
              aria-label="Режим обработки"
              className="fh-input"
              value={environment === 'staging' ? 'observe' : processingMode}
              onChange={(event) => {
                setProcessingMode(event.target.value);
                setLiveConfirmed(false);
              }}
            >
              <option value="observe">Observe — без списания</option>
              {environment === 'production' && <option value="live">Live — обработка продажи</option>}
            </select>
          </Field>
        </div>

        {environment === 'production' && processingMode === 'live' && (
          <label className="fh-check fh-check--ack">
            <input
              type="checkbox"
              checked={liveConfirmed}
              onChange={(event) => setLiveConfirmed(event.target.checked)}
              aria-label="Я понимаю, что live разрешает списание в Billz"
            />
            <span>
              <b>Я понимаю: live разрешает списание в Billz</b>
              <small>Фактическая продажа всё равно требует отдельного серверного флага Billz.</small>
            </span>
          </label>
        )}

        {feedback && <div className="fh-info-note" role="status">{feedback}</div>}
        {error && <div className="fh-error-note" role="alert">{error}</div>}

        <div className="fh-dialog-actions fh-partner-actions">
          <Button disabled={busy} onClick={onClose}>Закрыть</Button>
          {profile?.passwordConfigured && !profile.active && (
            <Button disabled={busy} onClick={activate}>Сделать активным</Button>
          )}
          <Button variant="primary" disabled={saveDisabled} onClick={save}>
            {busy ? 'Проверяем…' : 'Проверить и сохранить'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
