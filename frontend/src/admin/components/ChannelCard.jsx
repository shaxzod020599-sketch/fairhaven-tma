import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

const CHANNEL_LABEL = { medicalka: 'Medicalka', uzum: 'Uzum' };

const STATUS_OPTIONS = [
  { key: 'auto', label: 'Авто', hint: 'По остатку Billz' },
  { key: 'in', label: 'Есть', hint: 'Всегда в наличии' },
  { key: 'out', label: 'Нет', hint: 'Скрыть из канала' },
];

/** Space-separated thousands. Paired with tabular figures so columns line up. */
export function money(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('ru-RU').replace(/ /g, ' ');
}

/**
 * One channel line: price field plus availability control.
 *
 * The price saves itself after a pause rather than behind a Save button — an
 * operator repricing thirty products should not press Save thirty times. The
 * field keeps what was typed until the request settles, so a slow network never
 * snaps a value back under the cursor.
 */
function ChannelRow({ product, channel, onSave, toast }) {
  const cfg = product.channels[channel];
  const [price, setPrice] = useState(String(cfg.price || ''));
  const [focused, setFocused] = useState(false);
  const [state, setState] = useState('idle'); // idle | saving | saved
  const timer = useRef(null);
  const latest = useRef(cfg.price);

  useEffect(() => {
    // Adopt values that changed elsewhere (bulk edit, reload) but never
    // overwrite what the operator is currently typing.
    if (state === 'idle' && Number(cfg.price || 0) !== latest.current) {
      latest.current = Number(cfg.price || 0);
      setPrice(String(cfg.price || ''));
    }
  }, [cfg.price, state]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const commit = async (patch) => {
    setState('saving');
    try {
      await onSave(channel, patch);
      latest.current = patch.price ?? latest.current;
      setState('saved');
      setTimeout(() => setState('idle'), 1400);
    } catch (err) {
      setState('idle');
      setPrice(String(cfg.price || ''));
      toast?.err(err.message || 'Не сохранилось');
    }
  };

  const onPriceChange = (event) => {
    const raw = event.target.value.replace(/[^\d]/g, '');
    setPrice(raw);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const next = Number(raw) || 0;
      if (next === latest.current) return;
      commit({ price: next });
    }, 700);
  };

  const setStatus = (forceStatus) => {
    if (forceStatus === cfg.forceStatus) return;
    commit({ forceStatus });
  };

  const toggleEnabled = () => commit({ enabled: !cfg.enabled });

  const liveTone = cfg.enabled ? (cfg.live ? 'on' : 'off') : 'idle';
  const liveText = !cfg.enabled ? 'Выключен'
    : cfg.priceMissing ? 'Нет цены'
      : cfg.live ? 'В продаже' : 'Не показывается';

  return (
    <div className={`ap-ch-row ${cfg.enabled ? '' : 'is-disabled'}`}>
      <div className="ap-ch-row-head">
        <button
          type="button"
          className={`ap-ch-toggle ${cfg.enabled ? 'is-on' : ''}`}
          onClick={toggleEnabled}
          aria-pressed={cfg.enabled}
          aria-label={`${CHANNEL_LABEL[channel]}: ${cfg.enabled ? 'выключить' : 'включить'}`}
        >
          <span className="ap-ch-toggle-knob" />
        </button>
        <span className="ap-ch-name">{CHANNEL_LABEL[channel]}</span>
        <span className={`ap-ch-state ap-ch-state--${liveTone}`}>
          {cfg.priceMissing && <Icon name="alert" size={13} />}
          {liveText}
        </span>
      </div>

      {/* A disabled channel collapses to its header. Showing a dead price
          field and a dead segmented control for every off channel doubled the
          card height for the most common state. */}
      {cfg.enabled && (
      <div className="ap-ch-row-controls">
        <label className="ap-ch-price">
          <span className="ap-ch-price-label">Цена</span>
          <input
            className={`ap-input ap-ch-price-input ${cfg.priceMissing ? 'is-warn' : ''}`}
            inputMode="numeric"
            /* Grouped while resting so six-figure sums stay readable; raw
               digits while typing, where a moving separator fights the caret. */
            value={focused ? price : (price ? money(price) : '')}
            onChange={onPriceChange}
            onFocus={() => setFocused(true)}
            onBlur={() => { setFocused(false); clearTimeout(timer.current); }}
            placeholder="не задана"
            aria-label={`Цена для ${CHANNEL_LABEL[channel]}, сум`}
          />
          <span className="ap-ch-price-unit" aria-hidden="true">сум</span>
          <span className={`ap-ch-save ap-ch-save--${state}`} aria-live="polite">
            {state === 'saving' && <span className="ap-ch-spinner" />}
            {state === 'saved' && <Icon name="check" size={14} />}
          </span>
        </label>

        <div className="ap-seg" role="group" aria-label={`Наличие в ${CHANNEL_LABEL[channel]}`}>
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              title={option.hint}
              className={`ap-seg-btn ${cfg.forceStatus === option.key ? 'is-active' : ''}`}
              onClick={() => setStatus(option.key)}
              aria-pressed={cfg.forceStatus === option.key}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}

export default function ChannelCard({
  product, channels, selected, onSelect, onSave, onLink, toast,
}) {
  const billz = product.billz;
  // A missing file otherwise renders the browser's broken-image glyph, which
  // reads as a bug rather than as "no photo yet".
  const [imageOk, setImageOk] = useState(Boolean(product.imageUrl));

  return (
    <article className={`ap-ch-card ${selected ? 'is-selected' : ''}`}>
      <header className="ap-ch-card-head">
        <label className="ap-ch-check">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onSelect(product._id)}
            aria-label={`Выбрать ${product.name}`}
          />
          <span className="ap-ch-check-box"><Icon name="check" size={13} /></span>
        </label>

        {imageOk
          ? (
            <img
              className="ap-ch-thumb"
              src={product.imageUrl}
              alt=""
              width="44" height="44"
              loading="lazy"
              onError={() => setImageOk(false)}
            />
          )
          : <div className="ap-ch-thumb ap-ch-thumb--empty" aria-hidden="true"><Icon name="gallery" size={16} /></div>}

        <div className="ap-ch-titles">
          <h3 className="ap-ch-title">{product.name}</h3>
          <p className="ap-ch-meta">
            {product.sku && <span className="ap-mono">{product.sku}</span>}
            {product.barcode && <><span className="ap-ch-dot" /><span className="ap-mono">{product.barcode}</span></>}
          </p>
        </div>
      </header>

      {billz ? (
        <div className={`ap-ch-billz ${billz.deletedInBillz ? 'is-gone' : ''}`}>
          <div className="ap-ch-billz-cell">
            <span className="ap-ch-billz-label">Billz</span>
            <span className="ap-ch-billz-value ap-num">{money(billz.retailPrice)}</span>
          </div>
          <div className="ap-ch-billz-cell">
            <span className="ap-ch-billz-label">Свободно</span>
            <span className={`ap-ch-billz-value ap-num ${billz.available <= 0 ? 'is-zero' : ''}`}>
              {billz.available}
            </span>
          </div>
          {(billz.reservedQty > 0 || billz.pendingQty > 0) && (
            <div className="ap-ch-billz-cell">
              <span className="ap-ch-billz-label">Резерв</span>
              <span className="ap-ch-billz-value ap-num">
                {billz.reservedQty + billz.pendingQty}
              </span>
            </div>
          )}
          {billz.deletedInBillz && (
            <span className="ap-ch-gone"><Icon name="alert" size={13} />Удалён в Billz</span>
          )}
        </div>
      ) : (
        <button type="button" className="ap-ch-unlinked" onClick={() => onLink(product)}>
          <Icon name="unlink" size={15} />
          <span>Не связан с Billz — нет остатка и цены</span>
          <Icon name="chevron" size={15} className="ap-ch-unlinked-go" />
        </button>
      )}

      <div className="ap-ch-rows">
        {channels.map((channel) => (
          <ChannelRow
            key={channel}
            product={product}
            channel={channel}
            onSave={(ch, patch) => onSave(product._id, ch, patch)}
            toast={toast}
          />
        ))}
      </div>
    </article>
  );
}

export { CHANNEL_LABEL };
