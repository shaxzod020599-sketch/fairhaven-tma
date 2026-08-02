import React, { useEffect, useState } from 'react';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Field } from '../../ui/Field';

function KeyBox({ label, value, onCopy }) {
  return (
    <div className="fh-key-box">
      <span>{label}</span>
      <input className="fh-input fh-mono" readOnly value={value} />
      <Button onClick={() => onCopy(value)}>Скопировать</Button>
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

  const copy = async (value) => {
    try { await navigator.clipboard?.writeText(value); } catch (_) { /* manual selection remains */ }
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
      {stage === 'reveal' && pair && <div className="fh-wizard"><span className="fh-wizard__step">03</span><h3>Ключи готовы</h3><div className="fh-secret-warning"><b>Скопируйте сейчас.</b> После закрытия секрет повторно не показывается.</div><div className="fh-key-grid"><KeyBox label="TOKEN · каталог" value={pair.token} onCopy={copy} /><KeyBox label="SECRET · заказы" value={pair.secret} onCopy={copy} /></div><Button onClick={() => copy(`TOKEN: ${pair.token}\nSECRET: ${pair.secret}`)}>Скопировать оба</Button><label className="fh-check fh-check--ack"><input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} aria-label="Я скопировал и сохранил оба ключа" /><span><b>Я скопировал и сохранил оба ключа</b><small>Передам их менеджеру Medicalka по согласованному безопасному каналу.</small></span></label><div className="fh-next-note"><b>Что дальше</b><p>Передайте TOKEN и SECRET менеджеру Medicalka. После подключения здесь появится время последнего использования.</p></div><div className="fh-dialog-actions"><Button variant="primary" disabled={!acknowledged} onClick={safeClose}>Закрыть мастер</Button></div></div>}
    </Dialog>
  );
}
