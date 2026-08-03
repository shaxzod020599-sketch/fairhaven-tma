import React, { useEffect, useState } from 'react';
import { settingsApi } from '../../api/resources';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { DataState } from '../../ui/DataState';
import { useToast } from '../../ui/ToastProvider';

function groupFor(key) {
  if (/delivery|order|payment/i.test(key)) return 'Доставка и заказы';
  if (/phone|contact|social|support/i.test(key)) return 'Контакты';
  if (/hero|site|banner|title/i.test(key)) return 'Сайт';
  return 'Остальное';
}

/**
 * Plain-language explanation for the settings a shop operator actually touches.
 * The database key is never shown as if it were information — it stays in a
 * title attribute so support can still ask "what's the key?" without the
 * operator reading `delivery_fee` glued to the setting's name.
 */
const EXPLANATIONS = {
  'delivery.fee': 'Сколько добавляется к каждому заказу за доставку, в сумах.',
  delivery_fee: 'Сколько добавляется к каждому заказу за доставку, в сумах.',
  'delivery.freeFrom': 'С какой суммы заказа доставка становится бесплатной.',
  'support.phone': 'Телефон, который клиент видит в боте и на сайте.',
  support_phone: 'Телефон, который клиент видит в боте и на сайте.',
};

function hintFor(setting) {
  return EXPLANATIONS[setting.key] || '';
}

/** A value the panel cannot safely edit as plain text (list, object). */
function isStructured(value) {
  return value !== null && typeof value === 'object';
}

export function SettingsPage({ api = settingsApi }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.list()
      .then((response) => { setRows(response.data || []); setError(''); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [api]);

  const change = (key, value) => setRows((current) => current.map((row) => (row.key === key ? { ...row, value } : row)));

  const saveAll = async () => {
    setSaving(true);
    try {
      await Promise.all(rows.map((row) => api.save({ key: row.key, value: row.value, label: row.label })));
      toast?.success?.('Настройки сохранены');
    } catch (err) {
      toast?.error?.(err.message);
    } finally {
      setSaving(false);
    }
  };

  const groups = rows.reduce((acc, row) => {
    const group = groupFor(row.key);
    return { ...acc, [group]: [...(acc[group] || []), row] };
  }, {});

  return (
    <div className="fh-page">
      <header className="fh-page-head">
        <div>
          <p className="fh-eyebrow">ПРАВИЛА FAIRHAVEN.UZ</p>
          <h1>Настройки</h1>
          <p>Тексты, контакты и суммы, которые клиент видит в боте и на сайте fairhaven.uz.</p>
        </div>
        <Button variant="primary" onClick={saveAll} disabled={saving || !rows.length}>
          {saving ? 'Сохраняем…' : 'Сохранить всё'}
        </Button>
      </header>

      {loading ? <div className="fh-page-skeleton"><span /></div>
        : error ? <DataState tone="error" title="Настройки недоступны" message={error} />
          : (
            <div className="fh-settings-groups">
              {Object.entries(groups).map(([group, items]) => (
                <Card key={group} className="fh-settings-card">
                  <h2>{group}</h2>
                  {items.map((setting) => {
                    const hint = hintFor(setting);
                    const structured = isStructured(setting.value);
                    return (
                      <label key={setting.key} title={`Техническое имя: ${setting.key}`}>
                        <span>
                          <b>{setting.label || setting.key}</b>
                          {hint && <small>{hint}</small>}
                          {structured && <small>Это сложное значение — его меняют разработчики, не трогайте здесь.</small>}
                        </span>
                        {typeof setting.value === 'boolean' ? (
                          <input
                            type="checkbox"
                            checked={setting.value}
                            onChange={(e) => change(setting.key, e.target.checked)}
                          />
                        ) : (
                          <input
                            className="fh-input"
                            readOnly={structured}
                            value={structured ? JSON.stringify(setting.value) : setting.value ?? ''}
                            onChange={(e) => change(setting.key, e.target.value)}
                          />
                        )}
                      </label>
                    );
                  })}
                </Card>
              ))}
            </div>
          )}
    </div>
  );
}
