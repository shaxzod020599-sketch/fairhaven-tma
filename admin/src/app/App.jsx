import React, { useEffect, useState } from 'react';
import { AccessGate } from './AccessGate';
import { FullShell } from './FullShell';
import { navigate, pathOnly, useRoute } from './route';
import { logout } from '../api/auth';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { OrdersPage } from '../features/orders/OrdersPage';
import { ProductsPage } from '../features/products/ProductsPage';
import { ConnectionsPage } from '../features/connections/ConnectionsPage';
import { CustomersPage } from '../features/customers/CustomersPage';
import { AdminsPage } from '../features/admins/AdminsPage';
import { PromosPage } from '../features/promos/PromosPage';
import { CollectionsPage } from '../features/collections/CollectionsPage';
import { GalleryPage } from '../features/gallery/GalleryPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { ActivityPage } from '../features/activity/ActivityPage';
import { SalesPage } from '../features/sales/SalesPage';
import { BillzPage } from '../features/billz/BillzPage';
import { CommandPalette } from '../ui/CommandPalette';
import { DataState } from '../ui/DataState';
import { ToastProvider } from '../ui/ToastProvider';

export const PAGE_MAP = {
  '/': DashboardPage,
  '/sales': SalesPage,
  '/billz': BillzPage,
  '/orders': OrdersPage,
  '/products': ProductsPage,
  '/connections': ConnectionsPage,
  '/customers': CustomersPage,
  '/admins': AdminsPage,
  '/promos': PromosPage,
  '/collections': CollectionsPage,
  '/gallery': GalleryPage,
  '/settings': SettingsPage,
  '/activity': ActivityPage,
};

function RoutePage({ route, me }) {
  const path = pathOnly(route);
  const normalized = path.startsWith('/orders/') ? '/orders' : path;
  const Page = PAGE_MAP[normalized];
  if (!Page) {
    return <DataState title="Раздел не найден" message="Проверьте адрес или вернитесь в обзор." actionLabel="Открыть обзор" onAction={() => navigate('/')} />;
  }
  return <Page me={me} />;
}

function Workspace({ me, onSignedOut }) {
  const route = useRoute();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const signOut = async () => {
    try { await logout(); } finally { onSignedOut(); }
  };

  return (
    <>
      <FullShell route={route} me={me} onSearch={() => setSearchOpen(true)} onSignOut={signOut}>
        <RoutePage route={route} me={me} />
      </FullShell>
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

export default function App({ loadMe }) {
  const [session, setSession] = useState(0);
  return (
    <ToastProvider>
      <AccessGate key={session} loadMe={loadMe}>
        {(me) => <Workspace me={me} onSignedOut={() => setSession((n) => n + 1)} />}
      </AccessGate>
    </ToastProvider>
  );
}
