import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  listChannelProducts,
  channelSummary,
  updateProductChannel,
  updateProductChannelMeta,
  bulkUpdateChannel,
  linkProductToBillz,
  searchBillzProducts,
  channelSyncStatus,
  triggerChannelSync,
} from '../adminApi';
import Icon from '../components/Icon';
import Modal from '../components/Modal';
import ChannelCard, { CHANNEL_LABEL, money } from '../components/ChannelCard';
import ChannelKeys from '../components/ChannelKeys';

const CHANNELS = ['medicalka', 'uzum'];
const PAGE_SIZE = 30;

/** Filters an operator actually acts on, in the order problems get fixed. */
const FILTERS = [
  { key: '', label: 'Все', countKey: 'total' },
  { key: 'unlinked', label: 'Без Billz', countKey: 'unlinked', tone: 'warn' },
  { key: 'awaiting_approval', label: 'Ждёт одобрения', countKey: 'awaiting_approval', tone: 'warn' },
  { key: 'no_image', label: 'Без фото', countKey: 'no_image', tone: 'warn' },
  { key: 'no_price', label: 'Без цены', countKey: 'no_price', tone: 'warn' },
  { key: 'out_of_stock', label: 'Нет остатка', countKey: 'out_of_stock' },
  { key: 'no_mxik', label: 'Без ИКПУ', countKey: 'no_mxik' },
  { key: 'deleted_in_billz', label: 'Удалён в Billz', countKey: 'deleted_in_billz', tone: 'danger' },
];

function relativeTime(value) {
  if (!value) return 'никогда';
  const diff = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diff)) return 'никогда';
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  return new Date(value).toLocaleDateString('ru-RU');
}

export default function Channels({ toast }) {
  const [view, setView] = useState('products');
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1 });
  const [counts, setCounts] = useState({});
  const [billzStats, setBillzStats] = useState(null);
  const [sync, setSync] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState(() => new Set());
  const [bulkFor, setBulkFor] = useState(null);
  const [linkFor, setLinkFor] = useState(null);

  const searchTimer = useRef(null);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page, limit: PAGE_SIZE };
      if (debouncedSearch) params.search = debouncedSearch;
      if (filter) params.filter = filter;
      const res = await listChannelProducts(params);
      setRows(res.data || []);
      setMeta(res.meta || { total: 0, page: 1 });
    } catch (err) {
      toast?.err(err.message || 'Не загрузилось');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, filter, toast]);

  const loadAside = useCallback(async () => {
    try {
      const [summary, status] = await Promise.all([channelSummary(), channelSyncStatus()]);
      setCounts(summary.data?.counts || {});
      setBillzStats(summary.data?.billz || null);
      setSync(status.data || null);
    } catch (_) {
      // The page is still usable without the counters; stay quiet.
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadAside(); }, [loadAside]);

  /** Optimistic: the card already shows the new value, so re-render in place. */
  const saveChannel = useCallback(async (id, channel, patch) => {
    const res = await updateProductChannel(id, channel, patch);
    setRows((prev) => prev.map((row) => (row._id === id ? res.data : row)));
    loadAside();
    return res.data;
  }, [loadAside]);

  const saveMeta = useCallback(async (id, patch) => {
    const res = await updateProductChannelMeta(id, patch);
    setRows((prev) => prev.map((row) => (row._id === id ? res.data : row)));
    loadAside();
    return res.data;
  }, [loadAside]);

  const toggleSelect = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAllVisible = () => {
    setSelected((prev) => {
      const visible = rows.map((r) => r._id);
      const allChosen = visible.every((id) => prev.has(id));
      return allChosen ? new Set() : new Set([...prev, ...visible]);
    });
  };

  const runSync = async () => {
    try {
      setSyncing(true);
      const res = await triggerChannelSync();
      const data = res.data || {};
      if (data.rejected) toast?.err(`Синхронизация отклонена: ${data.reason}`);
      else toast?.ok(`Обновлено ${data.seen ?? 0} товаров`);
      await Promise.all([load(), loadAside()]);
    } catch (err) {
      toast?.err(
        err.code === 'channel_hub_not_configured'
          ? 'Сервис каналов не подключён'
          : err.message || 'Синхронизация не удалась'
      );
    } finally {
      setSyncing(false);
    }
  };

  const pages = Math.max(1, Math.ceil((meta.total || 0) / PAGE_SIZE));
  const selectedIds = useMemo(() => [...selected], [selected]);

  // Applying a filter, or products leaving one, can shrink the result set below
  // the current page. That left an empty list and — because the pager hides
  // itself at a single page — no visible way back.
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);

  return (
    <div className="ap-page ap-ch">
      <div className="ap-page-head">
        <div>
          <h1 className="ap-page-title">Каналы продаж</h1>
          <p className="ap-page-sub">
            Цены и наличие для Medicalka и Uzum. Остаток берётся из Billz.
          </p>
        </div>
        <div className="ap-ch-live">
          {CHANNELS.map((channel) => (
            <span key={channel} className="ap-ch-livechip">
              <b className="ap-num">{counts[channel] ?? 0}</b>
              <span>в {CHANNEL_LABEL[channel]}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Credentials and catalogue defaults are a separate job from pricing —
          done once at setup, then rarely. Kept behind a switch so the screen an
          operator opens every day is not the one with the revoke buttons. */}
      <div className="ap-ch-views" role="tablist" aria-label="Раздел">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'products'}
          className={`ap-ch-view ${view === 'products' ? 'is-active' : ''}`}
          onClick={() => setView('products')}
        >
          Товары и цены
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'access'}
          className={`ap-ch-view ${view === 'access' ? 'is-active' : ''}`}
          onClick={() => setView('access')}
        >
          Доступ и ИКПУ
        </button>
      </div>

      {view === 'access' ? <ChannelKeys toast={toast} /> : (
      <>
      {/* The Billz side of the headline, visible before anything is linked —
          otherwise an empty page reads as "the sync is broken" when the sync
          is fine and the linking simply has not been done yet. */}
      {billzStats && (
        <div className="ap-ch-billzbar" role="group" aria-label="Billz — сводка">
          <div className="ap-ch-billzstat">
            <span className="ap-ch-billzstat-n ap-num">{billzStats.total}</span>
            <span className="ap-ch-billzstat-l">товаров в Billz</span>
          </div>
          <div className="ap-ch-billzstat">
            <span className="ap-ch-billzstat-n ap-num">{billzStats.inStock}</span>
            <span className="ap-ch-billzstat-l">в наличии</span>
          </div>
          <div className="ap-ch-billzstat">
            <span className="ap-ch-billzstat-n ap-num">{money(billzStats.units)}</span>
            <span className="ap-ch-billzstat-l">единиц на складе</span>
          </div>
          {billzStats.reserved > 0 && (
            <div className="ap-ch-billzstat">
              <span className="ap-ch-billzstat-n ap-num">{billzStats.reserved}</span>
              <span className="ap-ch-billzstat-l">в резерве</span>
            </div>
          )}
          <div className="ap-ch-billzstat">
            <span className="ap-ch-billzstat-n ap-num">{billzStats.linked}</span>
            <span className="ap-ch-billzstat-l">связано из {counts.total ?? 0}</span>
          </div>
        </div>
      )}

      <SyncBar sync={sync} syncing={syncing} onSync={runSync} />

      <div className="ap-ch-toolbar">
        <div className="ap-ch-search">
          <Icon name="search" size={17} className="ap-ch-search-icon" />
          <input
            className="ap-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Название, артикул, штрихкод"
            aria-label="Поиск товара"
          />
          {search && (
            <button
              type="button"
              className="ap-ch-search-clear"
              onClick={() => setSearch('')}
              aria-label="Очистить поиск"
            >
              <Icon name="close" size={15} />
            </button>
          )}
        </div>

        <div className="ap-ch-chips" role="group" aria-label="Фильтры">
          {FILTERS.map((f) => {
            const count = counts[f.countKey];
            if (f.key && !count) return null;
            return (
              <button
                key={f.key || 'all'}
                type="button"
                className={`ap-ch-chip ${filter === f.key ? 'is-active' : ''} ${f.tone ? `ap-ch-chip--${f.tone}` : ''}`}
                onClick={() => { setFilter(f.key); setPage(1); }}
                aria-pressed={filter === f.key}
              >
                {f.label}
                {count !== undefined && <span className="ap-ch-chip-n ap-num">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {loading && !rows.length ? (
        <SkeletonList />
      ) : rows.length ? (
        <>
          <div className="ap-ch-listhead">
            <button type="button" className="ap-btn ap-btn-ghost ap-btn-xs" onClick={selectAllVisible}>
              {rows.every((r) => selected.has(r._id)) ? 'Снять выбор' : 'Выбрать все на странице'}
            </button>
            <span className="ap-muted-sm ap-num">{meta.total} товаров</span>
          </div>

          <div className="ap-ch-grid">
            {rows.map((product) => (
              <ChannelCard
                key={product._id}
                product={product}
                channels={CHANNELS}
                selected={selected.has(product._id)}
                onSelect={toggleSelect}
                onSave={saveChannel}
                onMeta={saveMeta}
                onLink={setLinkFor}
                toast={toast}
              />
            ))}
          </div>

          {pages > 1 && (
            <nav className="ap-ch-pager" aria-label="Страницы">
              <button
                type="button" className="ap-btn ap-btn-ghost"
                disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
              >
                <Icon name="chevron" size={16} className="ap-flip" /> Назад
              </button>
              <span className="ap-muted-sm ap-num">{page} / {pages}</span>
              <button
                type="button" className="ap-btn ap-btn-ghost"
                disabled={page >= pages} onClick={() => setPage((p) => p + 1)}
              >
                Вперёд <Icon name="chevron" size={16} />
              </button>
            </nav>
          )}
        </>
      ) : (
        <EmptyState filter={filter} search={debouncedSearch} onReset={() => { setFilter(''); setSearch(''); }} />
      )}

      {selectedIds.length > 0 && (
        <div className="ap-ch-bulkbar" role="region" aria-label="Массовые действия">
          <span className="ap-ch-bulkcount ap-num">{selectedIds.length}</span>
          <span className="ap-ch-bulklabel">выбрано</span>
          <div className="ap-ch-bulkactions">
            {CHANNELS.map((channel) => (
              <button
                key={channel}
                type="button"
                className="ap-btn ap-btn-primary ap-btn-xs"
                onClick={() => setBulkFor(channel)}
              >
                {CHANNEL_LABEL[channel]}
              </button>
            ))}
            <button
              type="button" className="ap-btn ap-btn-ghost ap-btn-xs"
              onClick={() => setSelected(new Set())}
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {bulkFor && (
        <BulkDialog
          channel={bulkFor}
          ids={selectedIds}
          onClose={() => setBulkFor(null)}
          onDone={async (result) => {
            setBulkFor(null);
            setSelected(new Set());
            toast?.ok(`Обновлено: ${result.updated}`);
            if (result.skipped?.length) {
              toast?.err(`Пропущено ${result.skipped.length} — нет цены Billz`);
            }
            await Promise.all([load(), loadAside()]);
          }}
          toast={toast}
        />
      )}

      {linkFor && (
        <LinkDialog
          product={linkFor}
          onClose={() => setLinkFor(null)}
          onLinked={async () => {
            setLinkFor(null);
            toast?.ok('Связано с Billz');
            await Promise.all([load(), loadAside()]);
          }}
          toast={toast}
        />
      )}
      </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────── Sync status */

function SyncBar({ sync, syncing, onSync }) {
  const last = sync?.last;
  const failed = last && !last.ok;

  return (
    <div className={`ap-ch-sync ${failed ? 'is-failed' : ''}`}>
      <span className={`ap-ch-sync-dot ${failed ? 'is-failed' : ''} ${syncing ? 'is-busy' : ''}`} />
      <div className="ap-ch-sync-text">
        <b>Billz</b>
        <span className="ap-muted-sm">
          {sync?.mirrorTotal ?? 0} товаров · обновлено {relativeTime(last?.at)}
        </span>
        {failed && (
          <span className="ap-ch-sync-error">
            {last.rejectedReason || last.error || 'Последняя синхронизация не прошла'}
          </span>
        )}
      </div>
      <button
        type="button"
        className="ap-btn ap-btn-ghost ap-btn-xs"
        onClick={onSync}
        disabled={syncing}
      >
        <Icon name="refresh" size={15} className={syncing ? 'ap-spin' : ''} />
        {syncing ? 'Обновляю…' : 'Обновить'}
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────── Bulk edit */

function BulkDialog({ channel, ids, onClose, onDone, toast }) {
  const [mode, setMode] = useState('markup');
  const [markup, setMarkup] = useState('15');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);

  const apply = async (extra) => {
    try {
      setBusy(true);
      const res = await bulkUpdateChannel(channel, { ids, ...extra });
      onDone(res.data);
    } catch (err) {
      toast?.err(err.message || 'Не применилось');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`${CHANNEL_LABEL[channel]} — ${ids.length} товаров`} onClose={onClose}>
      <div className="ap-ch-bulk">
        <div className="ap-seg ap-seg--wide" role="group" aria-label="Что менять">
          <button type="button" className={`ap-seg-btn ${mode === 'markup' ? 'is-active' : ''}`} onClick={() => setMode('markup')}>Наценка</button>
          <button type="button" className={`ap-seg-btn ${mode === 'price' ? 'is-active' : ''}`} onClick={() => setMode('price')}>Одна цена</button>
          <button type="button" className={`ap-seg-btn ${mode === 'state' ? 'is-active' : ''}`} onClick={() => setMode('state')}>Наличие</button>
        </div>

        {mode === 'markup' && (
          <>
            <label className="ap-label" htmlFor="bulk-markup">Процент к цене Billz</label>
            <div className="ap-ch-markup">
              <input
                id="bulk-markup" className="ap-input ap-num" inputMode="numeric"
                value={markup} onChange={(e) => setMarkup(e.target.value.replace(/[^\d-]/g, ''))}
              />
              <span className="ap-ch-price-unit">%</span>
            </div>
            <div className="ap-ch-presets">
              {[0, 10, 15, 20, 30].map((v) => (
                <button key={v} type="button" className="ap-chip" onClick={() => setMarkup(String(v))}>+{v}%</button>
              ))}
            </div>
            <p className="ap-muted-sm">
              Товары без цены в Billz будут пропущены — вы увидите сколько.
            </p>
            <button
              type="button" className="ap-btn ap-btn-primary" disabled={busy}
              onClick={() => apply({ markupPercent: Number(markup) || 0, enabled: true })}
            >
              {busy ? 'Применяю…' : 'Применить наценку'}
            </button>
          </>
        )}

        {mode === 'price' && (
          <>
            <label className="ap-label" htmlFor="bulk-price">Одинаковая цена для всех</label>
            <div className="ap-ch-markup">
              <input
                id="bulk-price" className="ap-input ap-num" inputMode="numeric" placeholder="0"
                value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))}
              />
              <span className="ap-ch-price-unit">сум</span>
            </div>
            <button
              type="button" className="ap-btn ap-btn-primary"
              disabled={busy || !price}
              onClick={() => apply({ price: Number(price), enabled: true })}
            >
              {busy ? 'Применяю…' : `Поставить ${money(price)} сум`}
            </button>
          </>
        )}

        {mode === 'state' && (
          <div className="ap-ch-bulkstate">
            <button type="button" className="ap-btn ap-btn-primary" disabled={busy} onClick={() => apply({ enabled: true })}>Включить канал</button>
            <button type="button" className="ap-btn ap-btn-ghost" disabled={busy} onClick={() => apply({ enabled: false })}>Выключить канал</button>
            <div className="ap-line" />
            <button type="button" className="ap-btn ap-btn-ghost" disabled={busy} onClick={() => apply({ forceStatus: 'auto' })}>Наличие: авто</button>
            <button type="button" className="ap-btn ap-btn-ghost" disabled={busy} onClick={() => apply({ forceStatus: 'out' })}>Наличие: скрыть</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ─────────────────────────────────────────────── Billz linking */

function LinkDialog({ product, onClose, onLinked, toast }) {
  const [query, setQuery] = useState(product.sku || product.barcode || product.name || '');
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    // Typing fires overlapping requests and they do not come back in order.
    // Without this guard a slow response for "fer" could land after "fertil"
    // and repopulate the list with results for a query no longer on screen.
    let current = true;
    timer.current = setTimeout(async () => {
      try {
        const res = await searchBillzProducts({ search: query.trim(), limit: 40 });
        if (current) setItems(res.data || []);
      } catch (err) {
        if (current) toast?.err(err.message || 'Поиск не удался');
      }
    }, 300);
    return () => { current = false; clearTimeout(timer.current); };
  }, [query, toast]);

  const link = async (billzProductId) => {
    try {
      setBusy(true);
      await linkProductToBillz(product._id, billzProductId);
      onLinked();
    } catch (err) {
      toast?.err(
        err.code === 'already_linked'
          ? 'Этот товар Billz уже связан с другой карточкой'
          : err.message || 'Не связалось'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Связать с Billz" onClose={onClose}>
      <p className="ap-muted-sm">
        Карточка: <b>{product.name}</b>
      </p>
      <input
        className="ap-input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Название, артикул или штрихкод"
        aria-label="Поиск в каталоге Billz"
        autoFocus
      />

      <div className="ap-ch-picklist">
        {items.length === 0 && <p className="ap-empty">Ничего не найдено в Billz</p>}
        {items.map((item) => (
          <button
            key={item.billzProductId}
            type="button"
            className="ap-ch-pick"
            disabled={busy || Boolean(item.linkedTo)}
            onClick={() => link(item.billzProductId)}
          >
            <span className="ap-ch-pick-main">
              <span className="ap-ch-pick-name">{item.name}</span>
              <span className="ap-ch-pick-meta">
                <span className="ap-mono">{item.sku}</span>
                {item.barcode && <><span className="ap-ch-dot" /><span className="ap-mono">{item.barcode}</span></>}
              </span>
            </span>
            <span className="ap-ch-pick-side">
              <span className="ap-num">{money(item.retailPrice)}</span>
              <span className="ap-muted-sm ap-num">{item.stock} шт</span>
            </span>
            {item.linkedTo && <span className="ap-ch-pick-taken">уже связан</span>}
          </button>
        ))}
      </div>
    </Modal>
  );
}

/* ─────────────────────────────────────────────── States */

function SkeletonList() {
  // Matches the real card height so the list does not jump when data lands.
  return (
    <div className="ap-ch-grid" aria-busy="true" aria-label="Загрузка">
      {[0, 1, 2, 3].map((i) => <div key={i} className="ap-ch-skeleton" />)}
    </div>
  );
}

function EmptyState({ filter, search, onReset }) {
  const filtered = Boolean(filter || search);
  return (
    <div className="ap-ch-empty">
      <Icon name="channels" size={28} />
      <h3>{filtered ? 'Ничего не найдено' : 'Пока нет товаров'}</h3>
      <p className="ap-muted-sm">
        {filtered
          ? 'Измените запрос или снимите фильтр.'
          : 'Добавьте товары в разделе «Товары», затем свяжите их с Billz.'}
      </p>
      {filtered && (
        <button type="button" className="ap-btn ap-btn-ghost" onClick={onReset}>
          Сбросить фильтры
        </button>
      )}
    </div>
  );
}
