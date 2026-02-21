import {
  createRouter,
  createRoute,
  createRootRoute,
  Outlet,
  redirect,
  useNavigate,
  useLocation,
} from '@tanstack/react-router';
import {
  LayoutDashboard,
  Users,
  UserCog,
  Store,
  ClipboardCheck,
  BookOpen,
  Scale,
  Landmark,
} from 'lucide-react';
import { AppShell, useAuth, type NavItem } from '@caricash/ui';
import { LoginPage } from './pages/login.js';
import { DashboardPage } from './pages/dashboard.js';
import { CustomersPage } from './pages/customers.js';
import { AgentsPage } from './pages/agents.js';
import { MerchantsPage } from './pages/merchants.js';
import { ApprovalsPage } from './pages/approvals.js';
import { LedgerPage } from './pages/ledger.js';
import { ReconciliationPage } from './pages/reconciliation.js';
import { OverdraftPage } from './pages/overdraft.js';

// ── Root ──────────────────────────────────────────────
const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

// ── Login (public) ────────────────────────────────────
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

// ── Auth layout ───────────────────────────────────────
function AuthLayout() {
  const { isAuthenticated, actor, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (!isAuthenticated) {
    navigate({ to: '/login' });
    return null;
  }

  const navigation: NavItem[] = [
    {
      label: 'Dashboard',
      href: '/dashboard',
      icon: <LayoutDashboard className="h-4 w-4" />,
      active: location.pathname === '/dashboard',
    },
    {
      label: 'Customers',
      href: '/customers',
      icon: <Users className="h-4 w-4" />,
      active: location.pathname === '/customers',
    },
    {
      label: 'Agents',
      href: '/agents',
      icon: <UserCog className="h-4 w-4" />,
      active: location.pathname === '/agents',
    },
    {
      label: 'Merchants',
      href: '/merchants',
      icon: <Store className="h-4 w-4" />,
      active: location.pathname === '/merchants',
    },
    {
      label: 'Approvals',
      href: '/approvals',
      icon: <ClipboardCheck className="h-4 w-4" />,
      active: location.pathname === '/approvals',
    },
    {
      label: 'Ledger',
      href: '/ledger',
      icon: <BookOpen className="h-4 w-4" />,
      active: location.pathname === '/ledger',
    },
    {
      label: 'Reconciliation',
      href: '/reconciliation',
      icon: <Scale className="h-4 w-4" />,
      active: location.pathname === '/reconciliation',
    },
    {
      label: 'Overdraft',
      href: '/overdraft',
      icon: <Landmark className="h-4 w-4" />,
      active: location.pathname === '/overdraft',
    },
  ];

  return (
    <AppShell
      navigation={navigation}
      appName="CariCash Staff"
      user={actor ? { name: actor.name, role: 'Staff' } : null}
      onLogout={() => {
        localStorage.removeItem('caricash_staff_id');
        logout();
        navigate({ to: '/login' });
      }}
    >
      <Outlet />
    </AppShell>
  );
}

const authLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'auth',
  component: AuthLayout,
});

// ── Index redirect ────────────────────────────────────
const indexRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/dashboard' });
  },
});

// ── Authenticated pages ───────────────────────────────
const dashboardRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/dashboard',
  component: DashboardPage,
});

const customersRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/customers',
  component: CustomersPage,
});

const agentsRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/agents',
  component: AgentsPage,
});

const merchantsRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/merchants',
  component: MerchantsPage,
});

const approvalsRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/approvals',
  component: ApprovalsPage,
});

const ledgerRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/ledger',
  component: LedgerPage,
});

const reconciliationRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/reconciliation',
  component: ReconciliationPage,
});

const overdraftRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/overdraft',
  component: OverdraftPage,
});

// ── Router tree ───────────────────────────────────────
const routeTree = rootRoute.addChildren([
  loginRoute,
  authLayoutRoute.addChildren([
    indexRoute,
    dashboardRoute,
    customersRoute,
    agentsRoute,
    merchantsRoute,
    approvalsRoute,
    ledgerRoute,
    reconciliationRoute,
    overdraftRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
