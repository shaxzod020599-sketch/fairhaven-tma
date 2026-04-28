import React, { useEffect, useMemo, useState } from 'react';
import {
  listPromos,
  createPromo,
  updatePromo,
  deletePromo,
  togglePromo,
} from '../adminApi';
import Modal, { ConfirmDialog } from '../components/Modal';

function fmtUZS(n) {
  return (Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' UZS';
}

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
  } catch (_) {
    return '—';
  }
}

function discountLabel(p) {
  if (p.discountType === 'percentage') return `−${p.discountValue}%`;
  return `−${fmtUZS(p.discountValue)}`;
}

function statusOf(p) {
  if (!p.isActive) return { tone: 'off', label: 'Выключен' };
  const now = Date.now();
  if (p.startsAt && new Date(p.startsAt).getTime() > now) {
    return { tone: 'wait', label: 'Запланирован' };
  }
  if (p.expiresAt && new Date(p.expiresAt).getTime() < now) {
    return { tone: 'off', label: 'Истёк' };
  }
  if (p.maxUses > 0 && p.usedCount >= p.maxUses) {
    return { tone: 'off', label: 'Исчерпан' };
  }
  return { tone: 'on', label: 'Активен' };
}

export default function PromoCodes({ toast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [filter, setFilter] = useState('all');

  const load = async () => {
    try {
      setLoading(true);
      const res = await listPromos();
      setItems(res.data || []);
    } catch (e) {
      toast?.err(e.message || 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    if (filter === 'active') return items.filter((p) => statusOf(p).tone === 'on');
    if (filter === 'first') return items.filter((p) => p.firstOrderOnly);
    if (filter === 'off') return items.filter((p) => !p.isActive);
    return items;
  }, [items, filter]);

  const onToggle = async (p) => {
    try {
      const res = await togglePromo(p._id);
      setItems((prev) => prev.map((x) => (x._id === p._id ? res.data : x)));
      toast?.ok(res.data.isActive ? 'Включён' : 'Выключен');
    } catch (e) {
      toast?.err(e.message || 'Ошибка');
    }
  };

  const onDelete = async (p) => {
    try {
      await deletePromo(p._id);
      setItems((prev) => prev.filter((x) => x._id !== p._id));
      toast?.ok('Удалено');
    } catch (e) {
      toast?.err(e.message || 'Ошибка');
    }
  };

  const onSaved = (promo, isNew) => {
    if (isNew) setItems((prev) => [promo, ...prev]);
    else setItems((prev) => prev.map((x) => (x._id === promo._id ? promo : x)));
    setEditing(null);
    toast?.ok(isNew ? 'Промокод создан' : 'Промокод обновлён');
  };

  const stats = useMemo(() => {
    const total = items.length;
    const active = items.filter((p) => statusOf(p).tone === 'on').length;
    const firstOrder = items.filter((p) => p.firstOrderOnly).length;
    const usedTotal = items.reduce((s, p) => s + (p.usedCount || 0), 0);
    return { total, active, firstOrder, usedTotal };
  }, [items]);

  return (
    <div className="ap-page">
      <div className="ap-page-head">
        <div>
          <h1 className="ap-page-title">Промокоды</h1>
          <div className="ap-page-sub">
            Всего: {stats.total} · Активных: {stats.active} · Для 1-го заказа: {stats.firstOrder} · Применений: {stats.usedTotal}
          </div>
        </div>
        <div className="ap-row">
          <button className="ap-btn ap-btn-ghost" onClick={load}>Обновить</button>
          <button className="ap-btn ap-btn-primary" onClick={() => setEditing('new')}>
            + Новый промокод
          </button>
        </div>
      </div>

      <div className="ap-promo-tabs">
        {[
          { k: 'all', label: 'Все' },
          { k: 'active', label: 'Активные' },
          { k: 'first', label: 'Для 1-го заказа' },
          { k: 'off', label: 'Выключенные' },
        ].map((t) => (
          <button
            key={t.k}
            className={`ap-promo-tab ${filter === t.k ? 'active' : ''}`}
            onClick={() => setFilter(t.k)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="ap-muted">Загрузка…</div>
      ) : filtered.length === 0 ? (
        <div className="ap-empty">Промокодов нет</div>
      ) : (
        <div className="ap-promo-grid">
          {filtered.map((p) => {
            const st = statusOf(p);
            return (
              <div key={p._id} className={`ap-promo-card ${st.tone}`}>
                <div className="ap-promo-head">
                  <div className="ap-promo-code">{p.code}</div>
                  <div className={`ap-promo-status ${st.tone}`}>{st.label}</div>
                </div>
                {p.description && <div className="ap-promo-desc">{p.description}</div>}

                <div className="ap-promo-discount">{discountLabel(p)}</div>

                <div className="ap-promo-meta">
                  {p.firstOrderOnly && <span className="ap-chip ink">⭐ Только 1-й заказ</span>}
                  {p.oncePerUser && <span className="ap-chip">1 раз на клиента</span>}
                  {p.minOrderAmount > 0 && (
                    <span className="ap-chip">от {fmtUZS(p.minOrderAmount)}</span>
                  )}
                  {p.maxDiscount > 0 && (
                    <span className="ap-chip">макс {fmtUZS(p.maxDiscount)}</span>
                  )}
                </div>

                <div className="ap-promo-rows">
                  <div className="ap-promo-row">
                    <span>Применений</span>
                    <strong>
                      {p.usedCount || 0}{p.maxUses > 0 ? ` / ${p.maxUses}` : ''}
                    </strong>
                  </div>
                  <div className="ap-promo-row">
                    <span>Старт</span>
                    <strong>{fmtDate(p.startsAt)}</strong>
                  </div>
                  <div className="ap-promo-row">
                    <span>До</span>
                    <strong>{fmtDate(p.expiresAt)}</strong>
                  </div>
                </div>

                <div className="ap-promo-actions">
                  <button
                    className={`ap-toggle ${p.isActive ? 'on' : 'off'}`}
                    onClick={() => onToggle(p)}
                  >
                    <span className="ap-toggle-dot" />
                    <span className="ap-toggle-label">{p.isActive ? 'вкл' : 'выкл'}</span>
                  </button>
                  <div className="ap-row-actions">
                    <button
                      className="ap-btn ap-btn-xs ap-btn-ghost"
                      onClick={() => setEditing(p)}
                    >
                      Изменить
                    </button>
                    <button
                      className="ap-btn ap-btn-xs ap-btn-danger"
                      onClick={() => setConfirm({
                        title: 'Удалить промокод',
                        message: `Удалить «${p.code}»?`,
                        onConfirm: () => onDelete(p),
                      })}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <PromoEditor
          promo={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function PresetButton({ label, onClick }) {
  return (
    <button type="button" className="ap-btn ap-btn-xs ap-btn-ghost" onClick={onClick}>
      {label}
    </button>
  );
}

function PromoEditor({ promo, onClose, onSaved }) {
  const isNew = !promo;
  const [code, setCode] = useState(promo?.code || '');
  const [description, setDescription] = useState(promo?.description || '');
  const [discountType, setDiscountType] = useState(promo?.discountType || 'percentage');
  const [discountValue, setDiscountValue] = useState(promo?.discountValue || 10);
  const [minOrderAmount, setMinOrderAmount] = useState(promo?.minOrderAmount || 0);
  const [maxDiscount, setMaxDiscount] = useState(promo?.maxDiscount || 0);
  const [firstOrderOnly, setFirstOrderOnly] = useState(promo?.firstOrderOnly || false);
  const [oncePerUser, setOncePerUser] = useState(promo?.oncePerUser !== false);
  const [maxUses, setMaxUses] = useState(promo?.maxUses || 0);
  const [isActive, setIsActive] = useState(promo?.isActive !== false);
  const [startsAt, setStartsAt] = useState(promo?.startsAt ? toLocalIso(promo.startsAt) : '');
  const [expiresAt, setExpiresAt] = useState(promo?.expiresAt ? toLocalIso(promo.expiresAt) : '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const presetFirstOrder = () => {
    setCode('WELCOME15');
    setDescription('Скидка 15% на первый заказ');
    setDiscountType('percentage');
    setDiscountValue(15);
    setFirstOrderOnly(true);
    setOncePerUser(true);
    setMinOrderAmount(0);
  };
  const presetVip = () => {
    setCode('VIP100K');
    setDescription('Постоянным клиентам — фиксированная скидка');
    setDiscountType('fixed');
    setDiscountValue(100000);
    setMinOrderAmount(500000);
    setFirstOrderOnly(false);
    setOncePerUser(false);
  };
  const presetSeasonal = () => {
    setCode('SPRING20');
    setDescription('Сезонная промо-акция');
    setDiscountType('percentage');
    setDiscountValue(20);
    setMaxDiscount(150000);
    setMinOrderAmount(300000);
    setFirstOrderOnly(false);
    setOncePerUser(true);
    setMaxUses(200);
  };

  const save = async () => {
    setErr('');
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) { setErr('Укажите код'); return; }
    if (!discountValue || discountValue <= 0) { setErr('Укажите размер скидки'); return; }
    if (discountType === 'percentage' && discountValue > 100) {
      setErr('Процент не может быть больше 100');
      return;
    }
    const body = {
      code: cleanCode,
      description: description.trim(),
      discountType,
      discountValue: Number(discountValue),
      minOrderAmount: Number(minOrderAmount) || 0,
      maxDiscount: Number(maxDiscount) || 0,
      firstOrderOnly,
      oncePerUser,
      maxUses: Number(maxUses) || 0,
      isActive,
      startsAt: startsAt || null,
      expiresAt: expiresAt || null,
    };
    try {
      setSaving(true);
      const res = isNew ? await createPromo(body) : await updatePromo(promo._id, body);
      onSaved(res.data, isNew);
    } catch (e) {
      setErr(e.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={isNew ? 'Новый промокод' : 'Редактировать промокод'}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="ap-btn ap-btn-ghost" onClick={onClose}>Отмена</button>
          <button className="ap-btn ap-btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </>
      }
    >
      {err && <div className="ap-error">{err}</div>}

      {isNew && (
        <div className="ap-promo-presets">
          <span className="ap-muted-sm">Шаблоны:</span>
          <PresetButton label="🎁 1-й заказ −15%" onClick={presetFirstOrder} />
          <PresetButton label="💎 VIP −100k UZS" onClick={presetVip} />
          <PresetButton label="🌱 Сезонная −20%" onClick={presetSeasonal} />
        </div>
      )}

      <div className="ap-form-grid">
        <div>
          <label className="ap-label">Код промокода</label>
          <input
            className="ap-input ap-promo-code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="WELCOME15"
          />
        </div>
        <div>
          <label className="ap-label">Тип скидки</label>
          <select
            className="ap-input ap-select"
            value={discountType}
            onChange={(e) => setDiscountType(e.target.value)}
          >
            <option value="percentage">Процент (%)</option>
            <option value="fixed">Фиксированная (UZS)</option>
          </select>
        </div>
        <div>
          <label className="ap-label">
            Размер ({discountType === 'percentage' ? '%' : 'UZS'})
          </label>
          <input
            className="ap-input"
            type="number"
            min="0"
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
          />
        </div>
        <div>
          <label className="ap-label">Мин. сумма заказа (UZS)</label>
          <input
            className="ap-input"
            type="number"
            min="0"
            value={minOrderAmount}
            onChange={(e) => setMinOrderAmount(e.target.value)}
          />
        </div>
        {discountType === 'percentage' && (
          <div>
            <label className="ap-label">Макс. скидка (UZS, 0 = без лимита)</label>
            <input
              className="ap-input"
              type="number"
              min="0"
              value={maxDiscount}
              onChange={(e) => setMaxDiscount(e.target.value)}
            />
          </div>
        )}
        <div>
          <label className="ap-label">Лимит применений (0 = без лимита)</label>
          <input
            className="ap-input"
            type="number"
            min="0"
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
          />
        </div>
        <div>
          <label className="ap-label">Действует с</label>
          <input
            className="ap-input"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </div>
        <div>
          <label className="ap-label">Действует до</label>
          <input
            className="ap-input"
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="ap-label">Описание (для клиента)</label>
          <input
            className="ap-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Скидка 15% на первый заказ"
          />
        </div>
      </div>

      <div className="ap-promo-flags">
        <label className="ap-checkbox">
          <input
            type="checkbox"
            checked={firstOrderOnly}
            onChange={(e) => setFirstOrderOnly(e.target.checked)}
          />
          <span>Только для первого заказа клиента</span>
        </label>
        <label className="ap-checkbox">
          <input
            type="checkbox"
            checked={oncePerUser}
            onChange={(e) => setOncePerUser(e.target.checked)}
          />
          <span>Один раз на одного клиента</span>
        </label>
        <label className="ap-checkbox">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <span>Активен</span>
        </label>
      </div>
    </Modal>
  );
}

function toLocalIso(d) {
  try {
    const date = new Date(d);
    const tz = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tz).toISOString().slice(0, 16);
  } catch (_) {
    return '';
  }
}
