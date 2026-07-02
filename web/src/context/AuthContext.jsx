import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { authStart, authStatus, authMe, authLogout } from '../api.js';

const POLL_INTERVAL_MS = 2000;

const AuthContext = createContext(null);

/**
 * Telegram-bot login session for the web site.
 * Flow: start() → open t.me deep-link → user taps "Start" in the bot →
 * status polling flips to ready → backend sets the httpOnly session cookie.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loginState, setLoginState] = useState('idle'); // idle | waiting | error
  const pollRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    authMe()
      .then((res) => {
        if (!cancelled && res?.success) setUser(res.data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [stopPolling]);

  /** Starts the handshake; returns the t.me URL to open (or null on failure). */
  const beginLogin = useCallback(async () => {
    stopPolling();
    setLoginState('waiting');
    try {
      const res = await authStart();
      const { token, botUrl, expiresInSeconds } = res.data;
      const deadline = Date.now() + (expiresInSeconds - 5) * 1000;

      pollRef.current = setInterval(async () => {
        if (Date.now() > deadline) {
          stopPolling();
          setLoginState('error');
          return;
        }
        try {
          const st = await authStatus(token);
          const status = st?.data?.status;
          if (status === 'ready') {
            stopPolling();
            setUser(st.data.user);
            setLoginState('idle');
          } else if (status === 'expired') {
            stopPolling();
            setLoginState('error');
          }
        } catch (_) { /* transient poll error — keep trying until deadline */ }
      }, POLL_INTERVAL_MS);

      return botUrl;
    } catch (_) {
      setLoginState('error');
      return null;
    }
  }, [stopPolling]);

  const cancelLogin = useCallback(() => {
    stopPolling();
    setLoginState('idle');
  }, [stopPolling]);

  const logout = useCallback(async () => {
    try { await authLogout(); } catch (_) { /* cookie clear is best-effort */ }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, loginState, beginLogin, cancelLogin, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
