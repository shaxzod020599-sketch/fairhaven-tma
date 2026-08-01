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
  const savedTimer = useRef(null);
  // The value waiting to be written. Non-null means there is an unsaved edit.
  const pending = useRef(null);
  const latest = useRef(Number(cfg.price) || 0);

  useEffect(() => {
    // Adopt values changed elsewhere (bulk edit, reload) but never overwrite
    // an edit in progress. Keyed off focus and the pending value rather than
    // `state`, which is 'idle' the whole time someone is typing.
    if (focused || pending.current !== null) return;
    const incoming = Number(cfg.price) || 0;
    if (incoming !== latest.current) {
      latest.current = incoming;
      setPrice(String(cfg.price || ''));
    }
  }, [cfg.price, focused]);

  useEffect(() => () => {
    clearTimeout(timer.current);
    clearTimeout(savedTimer.current);
  }, []);

  const commit = async (patch) => {
    setState('saving');
    clearTimeout(savedTimer.current);
    try {
      await onSave(channel, patch);
      if (patch.price !== undefined) latest.current = patch.price;
      setState('saved');
      savedTimer.current = setTimeout(() => setState('idle'), 1400);
    } catch (err) {
      setState('idle');
      pending.current = null;
      setPrice(String(cfg.price || ''));
      toast?.err(err.message || 'Не сохранилось');
    }
  };

  /**
   * Writes the pending edit now.
   *
   * Blur used to cancel the debounce timer instead of firing it, so typing a
   * price and clicking away inside the debounce window discarded the edit —
   * silently, because the field kept displaying the value that was never saved.
   */
  const flushPrice = () => {
    clearTimeout(timer.current);
    const next = pending.current;
    pending.current = null;
    if (next === null || next === latest.current) return;
    commit({ price: next });
  };

  const onPriceChange = (event) => {
    const raw = event.target.value.replace(/[^\d]/g, '');
    setPrice(raw);
    pending.current = Number(raw) || 0;
    clearTimeout(timer.current);
    timer.current = setTimeout(flushPrice, 700);
  };

  const setStatus = (forceStatus) => {
    if (forceStatus === cfg.forceStatus) return;
    // A status change is a deliberate action; do not let it race a half-typed
    // price that has not been written yet.
    flushPrice();
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
            onBlur={() => { setFocused(false); flushPrice(); }}
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

/**
 * Why the product is or is not in the shop itself, and the one action that
 * unblocks it. This is separate from the marketplace channels below: a product
 * can be live on Medicalka while hidden in the bot for want of a photo.
 */
const SHOP_STATE = {
  in_stock: { tone: 'on', text: 'В магазине · по остатку Billz' },
  out_of_stock: { tone: 'off', text: 'Скрыт — нет остатка в Billz' },
  gone_from_billz: { tone: 'warn', text: 'Скрыт — пропал из Billz' },
  no_image: { tone: 'warn', text: 'Скрыт — нет фото' },
  awaiting_approval: { tone: 'warn', text: 'Ждёт одобрения' },
  not_linked: { tone: 'plain', text: 'Наличие вручную' },
  manual_override: { tone: 'plain', text: 'Наличие вручную' },
};

/**
 * Shop visibility, and the one control that changes it.
 *
 * Much of the catalogue — nursing pads, test strips, accessories — has no Billz
 * counterpart, so manual availability is a normal way to run a product, not an
 * error state. Products in that mode get the in-stock switch right here.
 *
 * A missing photo is the exception: it blocks the product regardless, because
 * it is not a stock question and the only fix is to add the photo.
 */
function ShopStatus({ product, onMeta, toast }) {
  const [busy, setBusy] = useState(false);
  const shop = product.shop || {};
  const state = SHOP_STATE[shop.reason] || SHOP_STATE.not_linked;
  const manual = shop.mode === 'manual';

  const act = async (patch, message) => {
    try {
      setBusy(true);
      await onMeta(product._id, patch);
      toast?.ok(message);
    } catch (err) {
      toast?.err(err.message || 'Не сохранилось');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`ap-ch-shop ${shop.mode === 'blocked' ? 'is-blocked' : ''}`}>
      <span className={`ap-ch-state ap-ch-state--${manual && shop.visible ? 'on' : state.tone}`}>
        {state.tone === 'warn' && <Icon name="alert" size={13} />}
        {manual ? `${state.text} — ${shop.visible ? 'в наличии' : 'нет в наличии'}` : state.text}
      </span>

      {shop.reason === 'awaiting_approval' && (
        <button
          type="button" className="ap-btn ap-btn-primary ap-btn-xs" disabled={busy}
          onClick={() => act({ approved: true }, 'Одобрено — появится в магазине')}
        >
          Одобрить
        </button>
      )}

      {manual && (
        <div className="ap-seg ap-ch-shop-seg" role="group" aria-label="Наличие в магазине">
          <button
            type="button" disabled={busy}
            className={`ap-seg-btn ${shop.visible ? 'is-active' : ''}`}
            aria-pressed={shop.visible}
            onClick={() => act({ isAvailable: true }, 'В наличии')}
          >
            Есть
          </button>
          <button
            type="button" disabled={busy}
            className={`ap-seg-btn ${!shop.visible ? 'is-active' : ''}`}
            aria-pressed={!shop.visible}
            onClick={() => act({ isAvailable: false }, 'Нет в наличии')}
          >
            Нет
          </button>
        </div>
      )}

      {/* Only offered when Billz can actually drive it. */}
      {shop.reason === 'manual_override' && product.billzProductId && (
        <button
          type="button" className="ap-btn ap-btn-ghost ap-btn-xs" disabled={busy}
          onClick={() => act({ autoStock: true }, 'Наличие снова по Billz')}
        >
          По Billz
        </button>
      )}
    </div>
  );
}

export default function ChannelCard({
  product, channels, selected, onSelect, onSave, onMeta, onLink, toast,
}) {
  const billz = product.billz;
  // A missing file otherwise renders the browser's broken-image glyph, which
  // reads as a bug rather than as "no photo yet".
  const [imageOk, setImageOk] = useState(Boolean(product.imageUrl));

  // Initial state alone was not enough: the row keeps its identity across a
  // refetch, so a product that gained a photo went on showing the placeholder
  // and one that lost its file kept a stale thumbnail.
  useEffect(() => {
    setImageOk(Boolean(product.imageUrl));
  }, [product.imageUrl]);

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
        // Not an error: plenty of the catalogue is not carried in Billz.
        // Offered as an action, styled as a choice.
        <button type="button" className="ap-ch-unlinked" onClick={() => onLink(product)}>
          <Icon name="link" size={15} />
          <span>Нет в Billz — цена и наличие вручную. Связать?</span>
          <Icon name="chevron" size={15} className="ap-ch-unlinked-go" />
        </button>
      )}

      <ShopStatus product={product} onMeta={onMeta} toast={toast} />

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
