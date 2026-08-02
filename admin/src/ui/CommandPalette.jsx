import React, { useEffect, useMemo, useRef, useState } from 'react';
import { globalSearch } from '../api/dashboard';
import { NAV_ITEMS } from '../app/navigation';
import { navigate } from '../app/route';
import { formatMoney, shortId } from '../lib/format';
import { Dialog } from './Dialog';

/**
 * Cmd/Ctrl+K palette: section navigation plus live server search over orders,
 * customers, products and promo codes. Arrow keys move, Enter opens.
 */
export function CommandPalette({ open, onClose, search = globalSearch }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    if (!open) { setQuery(''); setResults(null); setCursor(0); }
  }, [open]);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) { setResults(null); setBusy(false); return undefined; }
    setBusy(true);
    const id = ++requestId.current;
    const timer = window.setTimeout(async () => {
      try {
        const response = await search(value);
        if (id === requestId.current) { setResults(response.data); setCursor(0); }
      } catch (_) {
        if (id === requestId.current) setResults(null);
      } finally {
        if (id === requestId.current) setBusy(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, search]);

  const options = useMemo(() => {
    if (!results) {
      const value = query.trim().toLowerCase();
      return NAV_ITEMS
        .filter((item) => item.label.toLowerCase().includes(value))
        .map((item) => ({ key: `nav-${item.path}`, group: 'Разделы', title: item.label, note: 'Открыть раздел', to: item.path }));
    }
    return [
      ...(results.orders || []).map((order) => ({
        key: `o-${order._id}`, group: 'Заказы',
        title: `#${shortId(order._id)} · ${order.customerName || 'Без имени'}`,
        note: formatMoney(order.totalAmount), to: `/orders/${order._id}`,
      })),
      ...(results.customers || []).map((user) => ({
        key: `c-${user.telegramId}`, group: 'Клиенты',
        title: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || `ID ${user.telegramId}`,
        note: user.phone || `ID ${user.telegramId}`, to: `/customers?search=${encodeURIComponent(user.phone || user.firstName || user.telegramId)}`,
      })),
      ...(results.products || []).map((product) => ({
        key: `p-${product._id}`, group: 'Товары',
        title: product.name, note: product.sku || formatMoney(product.price),
        to: `/products?search=${encodeURIComponent(product.sku || product.name)}`,
      })),
      ...(results.promos || []).map((promo) => ({
        key: `pr-${promo._id}`, group: 'Промокоды',
        title: promo.code, note: promo.isActive ? 'Активен' : 'Выключен', to: '/promos',
      })),
    ];
  }, [query, results]);

  const choose = (option) => {
    if (!option) return;
    onClose();
    navigate(option.to);
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setCursor((current) => Math.min(current + 1, options.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setCursor((current) => Math.max(current - 1, 0)); }
    else if (event.key === 'Enter') { event.preventDefault(); choose(options[cursor]); }
  };

  let lastGroup = '';
  return (
    <Dialog open={open} title="Быстрый поиск" description="Заказ по номеру, клиент по телефону, товар по SKU — или просто раздел." onClose={onClose} width="640px">
      <input
        autoFocus
        className="fh-input"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Например: 439011, +99890…, OvaBoost"
        aria-label="Глобальный поиск"
        role="combobox"
        aria-expanded="true"
        aria-activedescendant={options[cursor]?.key}
      />
      <nav className="fh-command-results" aria-label="Результаты поиска">
        {busy && <p className="fh-muted">Ищем…</p>}
        {!busy && options.length === 0 && <p className="fh-muted">Ничего не нашлось. Попробуйте телефон, номер заказа или SKU.</p>}
        {options.map((option, index) => {
          const header = option.group !== lastGroup ? option.group : null;
          lastGroup = option.group;
          return (
            <React.Fragment key={option.key}>
              {header && <p className="fh-command-group">{header}</p>}
              <button
                type="button"
                id={option.key}
                className={index === cursor ? 'is-cursor' : ''}
                onMouseEnter={() => setCursor(index)}
                onClick={() => choose(option)}
              >
                <span>{option.title}</span>
                <small>{option.note}</small>
              </button>
            </React.Fragment>
          );
        })}
      </nav>
    </Dialog>
  );
}
