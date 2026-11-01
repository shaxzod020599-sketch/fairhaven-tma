import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n/index.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { User } from '../Icons.jsx';

/**
 * Round avatar for a signed-in user. The Telegram photo always sits inside a fixed circle (a wide or broken
 * picture can never stretch the header); without a photo, or when it fails to load, the person icon shows.
 */
export function Avatar({ user, size = 32 }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [user?.photoUrl]);
  const photo = user?.photoUrl && !broken;
  return (
    <span className="sh-avatar" style={{ '--avatar': `${size}px` }} aria-hidden="true">
      {photo ? (
        <img src={user.photoUrl} alt="" width={size} height={size} referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      ) : (
        <User size={Math.round(size * 0.62)} />
      )}
    </span>
  );
}

/** Header account entry: avatar and first name when signed in, «Войти» otherwise. */
export default function AccountButton({ onNavigate }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const name = user ? user.firstName || t('account') : t('signIn');
  return (
    <Link to="/account" className={`sh-account${user ? ' is-signed' : ''}`} onClick={onNavigate} aria-label={user ? `${t('account')}: ${name}` : name}>
      {user ? <Avatar user={user} size={30} /> : <User size={22} />}
      <span className="sh-account-label">{name}</span>
    </Link>
  );
}

/** Admin panel shortcut, shown only when the server confirmed the admin role for this session. */
export function AdminChip({ onNavigate, className = '' }) {
  const { t } = useI18n();
  const { user } = useAuth();
  if (user?.role !== 'admin') return null;
  return (
    <Link to="/admin" className={`sh-admin ${className}`} title={t('shell.adminPanel')} onClick={onNavigate}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3l7 3v5c0 4.4-3 8.4-7 10-4-1.6-7-5.6-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M9.5 12l1.8 1.8 3.4-3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="sh-admin-label">{t('shell.adminShort')}</span>
    </Link>
  );
}
