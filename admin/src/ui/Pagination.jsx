import React from 'react';
import { Button } from './Button';

export function Pagination({ page, total, limit, onPage }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  return (
    <nav className="fh-pagination" aria-label="Страницы">
      <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Назад</Button>
      <span><b>{page}</b> / {pages}</span>
      <Button size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Дальше</Button>
    </nav>
  );
}
