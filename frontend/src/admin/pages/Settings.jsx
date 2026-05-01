import React, { useEffect, useState } from 'react';
import { listSettings, upsertSetting } from '../adminApi';

const FRIENDLY = {
  // hero (главная) — главный баннер на главной странице
  hero_eyebrow: { label: 'Главная — надпись над заголовком', hint: 'Например: FAIRHAVEN HEALTH · USA', group: 'hero' },
  hero_title_pre: { label: 'Главная — начало заголовка', hint: 'Например: Репродуктивное —', group: 'hero' },
  hero_title_em: { label: 'Главная — выделенное слово (бургунди курсив)', hint: 'Например: здоровье', group: 'hero' },
  hero_title_post: { label: 'Главная — окончание заголовка', hint: 'Например: семьи', group: 'hero' },
  hero_desc: { label: 'Главная — описание под заголовком', hint: '', group: 'hero', kind: 'textarea' },
  hero_cta: { label: 'Главная — текст кнопки', hint: 'Например: Открыть каталог', group: 'hero' },
  hero_stat1_value: { label: 'Главная — цифра №1', hint: 'Например: 22', group: 'hero' },
  hero_stat1_label: { label: 'Главная — подпись цифры №1', hint: 'Например: продукта', group: 'hero' },
  hero_stat2_value: { label: 'Главная — цифра №2', hint: 'Например: 100%', group: 'hero' },
  hero_stat2_label: { label: 'Главная — подпись цифры №2', hint: 'Например: оригинал', group: 'hero' },
  // contact + delivery
  support_phone: { label: 'Телефон контакт-центра (показывается)', hint: 'Например: +998 78 150 04 40' },
  support_phone_tel: { label: 'Телефон контакт-центра (tel:)', hint: 'Без пробелов, начинается с +. Например: +998781500440' },
  support_hours: { label: 'Часы работы контакт-центра', hint: '' },
  free_delivery_threshold: { label: 'Бесплатная доставка от (UZS)', hint: 'Число', kind: 'number' },
  delivery_city: { label: 'Город доставки', hint: '' },
  brand_tagline: { label: 'Слоган на главной', hint: '' },
};

const DEFAULT_ORDER = Object.keys(FRIENDLY);

export default function Settings({ toast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [draft, setDraft] = useState({});

  const load = async () => {
    try {
      setLoading(true);
      const res = await listSettings();
      const list = res.data || [];
      setItems(list);
      const d = {};
      list.forEach((s) => { d[s.key] = s.value; });
      setDraft(d);
    } catch (e) {
      toast?.err(e.message || 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const saveOne = async (key) => {
    try {
      setSaving(key);
      const friendly = FRIENDLY[key];
      const label = friendly?.label || '';
      let value = draft[key];
      if (friendly?.kind === 'number') value = Number(value) || 0;
      await upsertSetting({ key, value, label });
      toast?.ok('Сохранено');
      setItems((prev) => {
        const idx = prev.findIndex((p) => p.key === key);
        const next = { key, value, label };
        if (idx === -1) return [...prev, next];
        const copy = [...prev];
        copy[idx] = { ...copy[idx], value, label };
        return copy;
      });
    } catch (e) {
      toast?.err(e.message || 'Ошибка');
    } finally {
      setSaving('');
    }
  };

  const allKeys = Array.from(
    new Set([...DEFAULT_ORDER, ...items.map((i) => i.key)])
  );

  return (
    <div className="ap-page">
      <div className="ap-page-head">
        <div>
          <h1 className="ap-page-title">Настройки</h1>
          <div className="ap-page-sub">Контакт-центр, условия доставки, маркетинг</div>
        </div>
      </div>

      {loading ? (
        <div className="ap-muted">Загрузка…</div>
      ) : (
        <div className="ap-settings-list">
          {allKeys.map((key) => {
            const f = FRIENDLY[key] || { label: key };
            return (
              <div key={key} className="ap-card">
                <div className="ap-settings-row">
                  <div style={{ flex: 1 }}>
                    <div className="ap-label">{f.label}</div>
                    {f.kind === 'textarea' ? (
                      <textarea
                        className="ap-input"
                        rows={3}
                        value={draft[key] ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                      />
                    ) : (
                      <input
                        className="ap-input"
                        type={f.kind === 'number' ? 'number' : 'text'}
                        value={draft[key] ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                      />
                    )}
                    {f.hint && <div className="ap-muted-sm" style={{ marginTop: 4 }}>{f.hint}</div>}
                    <div className="ap-muted-sm" style={{ marginTop: 2 }}>
                      <code>{key}</code>
                    </div>
                  </div>
                  <button
                    className="ap-btn ap-btn-primary"
                    disabled={saving === key}
                    onClick={() => saveOne(key)}
                  >
                    {saving === key ? '…' : 'Сохранить'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
