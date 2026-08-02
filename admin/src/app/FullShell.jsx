import React from 'react';
import { NAV_ITEMS } from './navigation';
import { AdminLink, pathOnly } from './route';
import { Icon } from '../ui/Icon';

function isActive(route, target) {
  const path = pathOnly(route);
  return target === '/' ? path === '/' : path === target || path.startsWith(`${target}/`);
}

export function Brand() {
  return (
    <div className="fh-brand" aria-label="FairHaven Operations">
      <span className="fh-brand__seal">FH</span>
      <span><b>FairHaven</b><small>OPERATIONS</small></span>
    </div>
  );
}

export function FullShell({ route, me, alertCount = 0, onSearch, onSignOut, children }) {
  return (
    <div className="fh-shell">
      <aside className="fh-rail">
        <Brand />
        <nav className="fh-nav" aria-label="Основная навигация">
          {NAV_ITEMS.map((item) => (
            <AdminLink
              key={item.path}
              to={item.path}
              className={`fh-nav__item ${isActive(route, item.path) ? 'is-active' : ''}`}
              aria-current={isActive(route, item.path) ? 'page' : undefined}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.attention && alertCount > 0 && <b>{alertCount}</b>}
            </AdminLink>
          ))}
        </nav>
        <div className="fh-rail__identity">
          <span className="fh-avatar">{(me?.firstName || 'A').slice(0, 1)}</span>
          <span><b>{me?.firstName || me?.username || 'Администратор'}</b><small>ID {me?.telegramId}</small></span>
          <button type="button" className="fh-signout" onClick={onSignOut} aria-label="Выйти" title="Выйти">
            <Icon name="close" size={16} />
          </button>
        </div>
      </aside>
      <div className="fh-shell__body">
        <header className="fh-commandbar">
          <button className="fh-commandbar__search" type="button" onClick={onSearch} aria-label="Глобальный поиск">
            <Icon name="search" />
            <span>Найти заказ, клиента или товар</span>
            <kbd>⌘ K</kbd>
          </button>
          <div className="fh-commandbar__status"><span className="fh-live-dot" /> Система работает</div>
        </header>
        <main className="fh-workspace" aria-label="Панель управления FairHaven">{children}</main>
      </div>
    </div>
  );
}
