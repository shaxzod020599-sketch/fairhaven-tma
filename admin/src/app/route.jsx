import { useEffect, useState } from 'react';

export function normalizeAdminPath(pathname = window.location.pathname) {
  const value = String(pathname || '/');
  return value.startsWith('/') ? `/${value.replace(/^\/+/, '')}` : '/';
}

export function adminHref(path = '/') {
  const normalized = `/${String(path || '').replace(/^\/+/, '')}`;
  return normalized || '/';
}

export function navigate(path, { replace = false } = {}) {
  const href = adminHref(path);
  window.history[replace ? 'replaceState' : 'pushState']({}, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useRoute() {
  const read = () => `${normalizeAdminPath()}${window.location.search}`;
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const change = () => setRoute(read());
    window.addEventListener('popstate', change);
    return () => window.removeEventListener('popstate', change);
  }, []);
  return route;
}

export function pathOnly(route = '/') {
  return route.split('?')[0].split('#')[0] || '/';
}

export function matchRoute(path, pattern) {
  const pathParts = pathOnly(path).split('/').filter(Boolean);
  const patternParts = pattern.split('/').filter(Boolean);
  if (pathParts.length !== patternParts.length) return null;
  const params = {};
  for (let i = 0; i < patternParts.length; i += 1) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

export function AdminLink({ to, children, onClick, ...props }) {
  return (
    <a
      href={adminHref(to)}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(to);
      }}
      {...props}
    >
      {children}
    </a>
  );
}
