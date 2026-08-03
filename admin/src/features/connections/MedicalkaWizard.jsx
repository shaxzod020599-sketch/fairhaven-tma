import React, { useEffect, useState } from 'react';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Field } from '../../ui/Field';

/**
 * A key is ~52 characters. In a single-line input it was cut off, so the
 * operator could not confirm they had copied the whole thing — on the one
 * screen where the value is shown exactly once and never again. It now wraps
 * in full, and the copy button reports whether it actually worked.
 */
function KeyBox({ label, hint, value, onCopy }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const ok = await onCopy(value);
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 2500);
  };
  return (
    <div className="fh-key-box">
      <span>{label}</span>
      {hint && <small className="fh-key-box__hint">{hint}</small>}
      <code className="fh-key-box__value">{value}</code>
      <Button onClick={copy}>{copied ? '✓ Скопировано' : 'Скопировать'}</Button>
    </div>
  );
}

export function MedicalkaWizard({ open, api, onClose, onDone }) {
  const [stage, setStage] = useState('intro');
  const [label, setLabel] = useState('Основное подключение');
  const [revokeOld, setRevokeOld] = useState(false);
  const [pair, setPair] = useState(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setStage('intro'); setPair(null); setAcknowledged(false); setError(''); }
  }, [open]);

  const issue = async () => {
    setStage('loading');
    try {
      const response = await api.issuePair({ label, revokeOld });
      setPair(response.data);
      setStage('reveal');
      onDone?.(response.data);
    } catch (err) {
      setError(err.message || 'Ключи не созданы');
      setStage('confirm');
    }
  };

  // Returns whether the copy actually happened. Swallowing the failure left the
  // operator believing they had the key when the clipboard was unavailable.
  const copy = async (value) => {
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(value);
      return true;
    } catch (_) {
      setError('Не удалось скопировать автоматически. Выделите значение мышью и скопируйте вручную.');
      return false;
    }
  };

  const safeClose = () => {
    if (stage === 'reveal' && !acknowledged) return;
    setPair(null);
    onClose?.();
  };

  return (
    <Dialog open={open} title="Подключить Medicalka" description={`Шаг ${stage === 'intro' ? 1 : stage === 'confirm' || stage === 'loading' ? 2 : 3} из 3`} onClose={safeClose} closeDisabled={stage === 'loading' || (stage === 'reveal' && !acknowledged)} width="720px">
      {stage === 'intro' && <div className="fh-wizard"><span className="fh-wizard__step">01</span><h3>Одно подключение — два ключа</h3><p>Medicalka нужны два ключа: первый читает каталог, второй безопасно передаёт заказы. Мастер создаст оба вместе и покажет один раз.</p><div className="fh-info-note">Ничего не создаётся, пока вы не подтвердите следующий шаг.</div><div className="fh-dialog-actions"><Button onClick={safeClose}>Отмена</Button><Button variant="primary" onClick={() => setStage('confirm')}>Продолжить</Button></div></div>}
      {(stage === 'confirm' || stage === 'loading') && <div className="fh-wizard"><span className="fh-wizard__step">02</span><h3>Проверьте перед созданием</h3><Field label="Название подключения" hint="Поможет отличить ключи позже."><input className="fh-input" value={label} onChange={(e) => setLabel(e.target.value)} /></Field><label className="fh-check"><input type="checkbox" checked={revokeOld} onChange={(e) => setRevokeOld(e.target.checked)} /><span><b>Отключить старые ключи после создания</b><small>Не включайте, пока Medicalka не готова перейти на новые ключи.</small></span></label>{error && <div className="fh-error-note">{error}</div>}<div className="fh-dialog-actions"><Button disabled={stage === 'loading'} onClick={() => setStage('intro')}>Назад</Button><Button variant="primary" disabled={stage === 'loading' || !label.trim()} onClick={issue}>{stage === 'loading' ? 'Создаём…' : 'Создать два ключа'}</Button></div></div>}
      {stage === 'reveal' && pair && <div className="fh-wizard"><span className="fh-wizard__step">03</span><h3>Ключи готовы</h3><div className="fh-secret-warning"><b>Скопируйте сейчас.</b> Эти значения показываются один раз. После закрытия окна увидеть их снова будет нельзя — только выпустить новые.</div><div className="fh-key-grid"><KeyBox label="Ключ 1 — каталог" hint="По нему Medicalka читает список наших товаров." value={pair.token} onCopy={copy} /><KeyBox label="Ключ 2 — заказы" hint="По нему Medicalka присылает нам заказы." value={pair.secret} onCopy={copy} /></div><Button onClick={() => copy(`TOKEN: ${pair.token}\nSECRET: ${pair.secret}`)}>Скопировать оба</Button><label className="fh-check fh-check--ack"><input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} aria-label="Я скопировал и сохранил оба ключа" /><span><b>Я скопировал и сохранил оба ключа</b><small>Передам их менеджеру Medicalka по согласованному безопасному каналу.</small></span></label><div className="fh-next-note"><b>Что дальше</b><p>Передайте оба ключа менеджеру Medicalka — так, как вы обычно с ним переписываетесь. Когда Medicalka начнёт ими пользоваться, на странице «Подключения» появится время последнего обращения.</p></div><div className="fh-dialog-actions"><Button variant="primary" disabled={!acknowledged} onClick={safeClose}>Закрыть мастер</Button></div></div>}
    </Dialog>
  );
}
