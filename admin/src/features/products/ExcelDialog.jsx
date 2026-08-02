import React, { useEffect, useState } from 'react';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';

function countLabel(count, word) {
  return `${count || 0} ${word}`;
}

export function ExcelDialog({ open, api, onClose, onApplied }) {
  const [file, setFile] = useState(null);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setFile(null); setReport(null); setBusy(''); setError(''); }
  }, [open]);

  const preview = async () => {
    if (!file) return;
    setBusy('preview'); setError('');
    try {
      const response = await api.importExcel(file, false);
      setReport(response.data?.report || null);
    } catch (err) { setError(err.message || 'Файл не проверен'); }
    finally { setBusy(''); }
  };

  const apply = async () => {
    if (!file || !report || report.invalid?.length) return;
    setBusy('apply'); setError('');
    try {
      await api.importExcel(file, true);
      onApplied?.();
      onClose?.();
    } catch (err) { setError(err.message || 'Изменения не применены'); }
    finally { setBusy(''); }
  };

  const download = async () => {
    setBusy('export'); setError('');
    try {
      const result = await api.exportExcel();
      const href = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = href; link.download = result.filename; link.click();
      URL.revokeObjectURL(href);
    } catch (err) { setError(err.message || 'Файл не скачан'); }
    finally { setBusy(''); }
  };

  return (
    <Dialog open={open} title="Excel: экспорт и импорт" description="Сначала проверка. Запись в каталог — только после отчёта." onClose={onClose} width="720px">
      <div className="fh-excel">
        <section><div><h3>1. Скачать текущий каталог</h3><p>Billz ID и остаток попадут в файл как справочные поля. Импорт их не меняет.</p></div><Button onClick={download} disabled={Boolean(busy)}>{busy === 'export' ? 'Готовим…' : 'Скачать .xlsx'}</Button></section>
        <section><div><h3>2. Загрузить изменённый файл</h3><p>До подтверждения сервер только строит отчёт.</p></div><label className="fh-file-drop"><span>{file?.name || 'Выбрать products.xlsx'}</span><input aria-label="Файл Excel" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setFile(event.target.files?.[0] || null); setReport(null); }} /></label><Button onClick={preview} disabled={!file || Boolean(busy)}>{busy === 'preview' ? 'Проверяем…' : 'Проверить без изменений'}</Button></section>
        {error && <div className="fh-error-note">{error}</div>}
        {report && <section className="fh-excel-report"><div><strong>{countLabel(report.toCreate?.length, 'создать')}</strong><strong>{countLabel(report.toUpdate?.length, 'обновить')}</strong><strong>{countLabel(report.unchangedCount, 'без изменений')}</strong><strong className={report.invalid?.length ? 'is-danger' : ''}>{countLabel(report.invalid?.length, 'ошибок')}</strong></div>{report.invalid?.length > 0 && <ul>{report.invalid.slice(0, 8).map((row) => <li key={`${row.row}-${row.reason}`}>Строка {row.row}: {row.reason}</li>)}</ul>}</section>}
      </div>
      <div className="fh-dialog-actions"><Button onClick={onClose}>Закрыть</Button><Button variant="primary" disabled={!report || report.invalid?.length > 0 || Boolean(busy)} onClick={apply}>{busy === 'apply' ? 'Применяем…' : 'Применить изменения'}</Button></div>
    </Dialog>
  );
}
